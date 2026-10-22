import {
  MAX_CHAT_OUTPUT_TOKENS,
  MAX_TOOL_ARG_SUMMARY_CHARS,
  MAX_TOOL_CALLS_PER_ROUND,
  MAX_TOOL_CALLS_PER_RUN,
  MAX_TOOL_OUTPUT_CHARS,
  MAX_TOOL_RESULT_SUMMARY_CHARS,
  MAX_TOOL_ROUNDS,
  MAX_TOTAL_TOOL_OUTPUT_CHARS,
  TOOL_EXECUTION_TIMEOUT_MS
} from '@shared/constants/app'
import type { ToolCallRecord, ToolCallStatus } from '@shared/types/tool'
import type {
  ModelAdapter,
  ModelMessage,
  ModelToolCall,
  ModelToolDefinition
} from './model-adapter'
import { capText, clampText, formatToolError } from './tools/output'
import { ToolExecutionError, type ToolRegistry } from './tools/tool-registry'

export interface AgentLimits {
  maxRounds: number
  maxCallsPerRound: number
  maxToolCalls: number
  toolTimeoutMs: number
  maxToolOutputChars: number
  maxTotalToolOutputChars: number
  maxOutputTokens: number
}

export const DEFAULT_AGENT_LIMITS: AgentLimits = {
  maxRounds: MAX_TOOL_ROUNDS,
  maxCallsPerRound: MAX_TOOL_CALLS_PER_ROUND,
  maxToolCalls: MAX_TOOL_CALLS_PER_RUN,
  toolTimeoutMs: TOOL_EXECUTION_TIMEOUT_MS,
  maxToolOutputChars: MAX_TOOL_OUTPUT_CHARS,
  maxTotalToolOutputChars: MAX_TOTAL_TOOL_OUTPUT_CHARS,
  maxOutputTokens: MAX_CHAT_OUTPUT_TOKENS
}

export interface AgentCallbacks {
  onTextDelta(text: string): void
  onToolStarted(call: { id: string; name: string; argsSummary: string }): void
  onToolFinished(record: ToolCallRecord): void
  onUsage(usage: { inputTokens?: number; outputTokens?: number }): void
}

export interface AgentRunInput {
  adapter: ModelAdapter
  registry: ToolRegistry | null
  repositoryId: string | null
  messages: ModelMessage[]
  signal: AbortSignal
  callbacks: AgentCallbacks
  limits?: Partial<AgentLimits>
}

export interface AgentRunResult {
  text: string
  answerText: string
  toolCalls: ToolCallRecord[]
  usage: { inputTokens?: number; outputTokens?: number } | null
  stopped: boolean
  roundLimitReached: boolean
}

class ToolTimeoutError extends Error {}
class RunAbortedError extends Error {}

interface ToolOutcome {
  status: ToolCallStatus
  summary: string
  content: string
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`

  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`
}

async function executeToolCall(
  call: ModelToolCall,
  registry: ToolRegistry,
  repositoryId: string,
  runSignal: AbortSignal,
  timeoutMs: number
): Promise<ToolOutcome> {
  const timeoutController = new AbortController()
  const combined = AbortSignal.any([runSignal, timeoutController.signal])
  let timer: NodeJS.Timeout | undefined
  let abortListener: (() => void) | undefined

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timeoutController.abort()
      reject(new ToolTimeoutError())
    }, timeoutMs)
  })

  const abortPromise = new Promise<never>((_, reject) => {
    abortListener = () => reject(new RunAbortedError())
    if (runSignal.aborted) abortListener()
    else runSignal.addEventListener('abort', abortListener, { once: true })
  })

  const execution = registry.execute(call.name, call.arguments, { repositoryId, signal: combined })
  // 工具被中止/超时后仍可能迟到 reject，这里提前吞掉，避免未处理拒绝。
  execution.catch(() => undefined)

  try {
    const result = await Promise.race([execution, timeoutPromise, abortPromise])
    return { status: 'success', summary: result.summary, content: result.content }
  } catch (error) {
    if (runSignal.aborted || error instanceof RunAbortedError) {
      return { status: 'cancelled', summary: '已停止', content: '[工具未执行] 请求已停止' }
    }
    if (error instanceof ToolTimeoutError) {
      return {
        status: 'timeout',
        summary: '执行超时',
        content: formatToolError(call.name, 'TOOL_FAILED', '工具执行超时')
      }
    }
    if (error instanceof ToolExecutionError) {
      return {
        status: error.code === 'SENSITIVE_FILE' ? 'blocked' : 'error',
        summary: error.message,
        content: formatToolError(call.name, error.code, error.message)
      }
    }
    return {
      status: 'error',
      summary: '工具执行失败',
      content: formatToolError(call.name, 'TOOL_FAILED', '工具执行失败')
    }
  } finally {
    if (timer) clearTimeout(timer)
    if (abortListener) runSignal.removeEventListener('abort', abortListener)
  }
}

function blockedOutcome(reason: string): ToolOutcome {
  return { status: 'blocked', summary: reason, content: `[工具未执行] ${reason}` }
}

export async function runAgent(input: AgentRunInput): Promise<AgentRunResult> {
  const limits: AgentLimits = { ...DEFAULT_AGENT_LIMITS, ...input.limits }
  const tools: ModelToolDefinition[] =
    input.registry && input.repositoryId ? input.registry.toModelTools() : []

  const messages: ModelMessage[] = [...input.messages]
  const toolCalls: ToolCallRecord[] = []
  const seenCalls = new Set<string>()

  let text = ''
  let answerText = ''
  let stopped = false
  let roundLimitReached = false
  let toolsEnabled = tools.length > 0
  let round = 0
  let executedCalls = 0
  let totalOutputChars = 0
  let inputTokens = 0
  let outputTokens = 0
  let usage: { inputTokens?: number; outputTokens?: number } | null = null

  while (true) {
    if (input.signal.aborted) {
      stopped = true
      break
    }

    const streamUseTools = toolsEnabled
    let roundText = ''
    const roundCalls: ModelToolCall[] = []
    const roundUsage = { inputTokens: 0, outputTokens: 0, seen: false }

    for await (const event of input.adapter.stream({
      messages,
      signal: input.signal,
      tools: streamUseTools ? tools : undefined,
      maxTokens: limits.maxOutputTokens
    })) {
      if (input.signal.aborted) break

      if (event.type === 'text_delta' && event.text) {
        roundText += event.text
        text += event.text
        input.callbacks.onTextDelta(event.text)
      } else if (event.type === 'tool_call') {
        roundCalls.push({ id: event.id, name: event.name, arguments: event.arguments })
      } else if (event.type === 'usage') {
        roundUsage.seen = true
        roundUsage.inputTokens += event.inputTokens ?? 0
        roundUsage.outputTokens += event.outputTokens ?? 0
        input.callbacks.onUsage({
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens
        })
      }
    }

    if (roundUsage.seen) {
      inputTokens += roundUsage.inputTokens
      outputTokens += roundUsage.outputTokens
      usage = { inputTokens, outputTokens }
    }

    if (input.signal.aborted) {
      stopped = true
      break
    }

    if (!streamUseTools || roundCalls.length === 0) {
      answerText = roundText
      break
    }

    messages.push({ role: 'assistant', content: roundText, toolCalls: roundCalls })
    round += 1

    for (let index = 0; index < roundCalls.length; index += 1) {
      const call = roundCalls[index]
      let blockedReason: string | null = null

      if (index >= limits.maxCallsPerRound) {
        blockedReason = `单轮工具调用超过上限（${limits.maxCallsPerRound} 次）`
      } else if (executedCalls >= limits.maxToolCalls) {
        blockedReason = '本次请求工具调用次数已达上限'
      } else {
        const key = `${call.name}:${stableStringify(call.arguments)}`
        if (seenCalls.has(key)) {
          blockedReason = '重复调用已跳过'
        } else {
          seenCalls.add(key)
        }
      }

      const argsSummary = clampText(
        input.registry?.summarize(call.name, call.arguments) ?? '(未知工具)',
        MAX_TOOL_ARG_SUMMARY_CHARS
      )
      input.callbacks.onToolStarted({ id: call.id, name: call.name, argsSummary })

      const startedAt = Date.now()
      let outcome: ToolOutcome

      if (blockedReason) {
        outcome = blockedOutcome(blockedReason)
      } else {
        executedCalls += 1
        outcome = await executeToolCall(
          call,
          input.registry as ToolRegistry,
          input.repositoryId as string,
          input.signal,
          limits.toolTimeoutMs
        )
      }

      const remaining = limits.maxTotalToolOutputChars - totalOutputChars
      if (remaining <= 0) {
        outcome = blockedOutcome('本次请求工具输出总量已达上限')
      }

      const allowed = Math.min(limits.maxToolOutputChars, remaining)
      const cappedContent =
        remaining <= 0 ? outcome.content : capText(outcome.content, Math.max(0, allowed)).text
      totalOutputChars += cappedContent.length

      const durationMs = Date.now() - startedAt
      const record: ToolCallRecord = {
        id: call.id,
        name: call.name,
        argumentsSummary: argsSummary,
        status: outcome.status,
        summary: clampText(outcome.summary, MAX_TOOL_RESULT_SUMMARY_CHARS),
        durationMs
      }

      toolCalls.push(record)
      input.callbacks.onToolFinished(record)
      messages.push({
        role: 'tool',
        content: `<tool_result>\n${cappedContent}\n</tool_result>`,
        toolCallId: call.id,
        toolName: call.name
      })

      if (outcome.status === 'cancelled') {
        stopped = true
        break
      }
    }

    if (stopped) break

    if (round >= limits.maxRounds || executedCalls >= limits.maxToolCalls) {
      // 达到工具轮数/调用上限后，用一轮不传工具的收尾调用生成最终回答。
      roundLimitReached = true
      toolsEnabled = false
    }
  }

  return { text, answerText, toolCalls, usage, stopped, roundLimitReached }
}
