import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import {
  runAgent,
  stableStringify,
  stripToolCallMarkup,
  type AgentRunInput,
  type AgentRunResult
} from '@main/ai/agent-runner'
import type { ModelAdapter, ModelStreamRequest, ModelToolCall } from '@main/ai/model-adapter'
import type { ToolCallRecord } from '@shared/types/tool'
import { ToolExecutionError, ToolRegistry } from '@main/ai/tools/tool-registry'

interface ScriptedRound {
  text?: string
  toolCalls?: ModelToolCall[]
  usage?: { inputTokens?: number; outputTokens?: number }
}

function scriptAdapter(rounds: ScriptedRound[]): {
  adapter: ModelAdapter
  requests: ModelStreamRequest[]
} {
  const requests: ModelStreamRequest[] = []
  let index = 0

  return {
    requests,
    adapter: {
      stream(request) {
        requests.push(request)
        const round = rounds[index] ?? {}
        index += 1

        return (async function* () {
          if (round.text) yield { type: 'text_delta' as const, text: round.text }
          for (const call of round.toolCalls ?? []) {
            yield { type: 'tool_call' as const, ...call }
          }
          if (round.usage) yield { type: 'usage' as const, ...round.usage }
        })()
      }
    }
  }
}

interface TestTools {
  registry: ToolRegistry
  echo: ReturnType<typeof vi.fn>
  sensitive: ReturnType<typeof vi.fn>
  slow: ReturnType<typeof vi.fn>
}

function createTools(options: { longOutput?: boolean } = {}): TestTools {
  const registry = new ToolRegistry()

  const echo = vi.fn(
    async (args: {
      value: string
    }): Promise<{ content: string; summary: string; truncated: boolean }> => ({
      content: options.longOutput ? 'x'.repeat(500) : `value=${args.value}`,
      summary: `echo ${args.value}`,
      truncated: false
    })
  )

  const sensitive = vi.fn(async (): Promise<never> => {
    throw new ToolExecutionError('SENSITIVE_FILE', '敏感文件')
  })

  const slow = vi.fn(
    (_args: Record<string, never>, context: { signal: AbortSignal }): Promise<never> =>
      new Promise((_, reject) => {
        if (context.signal.aborted) reject(new Error('aborted'))
        context.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
      })
  )

  registry.register({
    name: 'echo',
    description: 'echo',
    schema: z.strictObject({ value: z.string() }),
    summarizeArgs: (args) => `echo ${args.value}`,
    execute: echo
  })
  registry.register({
    name: 'sensitive',
    description: 'sensitive',
    schema: z.strictObject({ path: z.string() }),
    summarizeArgs: (args) => args.path,
    execute: sensitive
  })
  registry.register({
    name: 'slow',
    description: 'slow',
    schema: z.strictObject({}),
    summarizeArgs: () => 'slow',
    execute: slow
  })

  return { registry, echo, sensitive, slow }
}

function createCallbacks(): AgentRunInput['callbacks'] {
  return {
    onTextDelta: vi.fn(),
    onToolStarted: vi.fn(),
    onToolFinished: vi.fn(),
    onUsage: vi.fn()
  }
}

async function run(
  adapter: ModelAdapter,
  registry: ToolRegistry | null,
  callbacks: AgentRunInput['callbacks'],
  overrides: Partial<AgentRunInput> = {}
): Promise<AgentRunResult> {
  return runAgent({
    adapter,
    registry,
    repositoryId: registry ? 'repo-1' : null,
    messages: [{ role: 'user', content: 'hi' }],
    signal: new AbortController().signal,
    callbacks,
    ...overrides
  })
}

function toolCall(id: string, value: string): ModelToolCall {
  return { id, name: 'echo', arguments: { value } }
}

describe('stableStringify', () => {
  it('对象键排序后保持稳定', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: [3] } })).toBe('{"a":{"c":[3],"d":2},"b":1}')
    expect(stableStringify(null)).toBe('null')
    expect(stableStringify('x')).toBe('"x"')
  })
})

describe('stripToolCallMarkup', () => {
  it('移除 DSML 调用块并保留正文', () => {
    const raw = [
      '结论如下。',
      '<｜｜DSML｜｜ calls>',
      '<｜｜DSML｜｜ invoke name="read_file">',
      '<｜｜DSML｜｜ parameter name="path" string="true">backend/src/index.ts</｜｜DSML｜｜ parameter>',
      '</｜｜DSML｜｜ invoke>',
      '</｜｜DSML｜｜ calls>'
    ].join('\n')

    expect(stripToolCallMarkup(raw)).toBe('结论如下。')
    expect(stripToolCallMarkup('<||DSML|| calls></||DSML|| calls>')).toBe('')
    expect(stripToolCallMarkup('普通回答')).toBe('普通回答')
  })
})

describe('runAgent', () => {
  it('无工具调用时单轮返回文本', async () => {
    const { adapter, requests } = scriptAdapter([{ text: '你好' }])
    const callbacks = createCallbacks()

    const result = await run(adapter, null, callbacks)

    expect(result.text).toBe('你好')
    expect(result.answerText).toBe('你好')
    expect(result.stopped).toBe(false)
    expect(result.roundLimitReached).toBe(false)
    expect(result.toolCalls).toEqual([])
    expect(requests).toHaveLength(1)
    expect(requests[0].tools).toBeUndefined()
    expect(callbacks.onTextDelta).toHaveBeenCalledWith('你好')
  })

  it('工具调用后把结果回传给模型并生成最终回答', async () => {
    const tools = createTools()
    const { adapter, requests } = scriptAdapter([
      { text: '先读取', toolCalls: [toolCall('call_1', 'a')] },
      { text: '最终回答' }
    ])
    const callbacks = createCallbacks()

    const result = await run(adapter, tools.registry, callbacks)

    expect(result.text).toBe('先读取最终回答')
    expect(result.answerText).toBe('最终回答')
    expect(result.toolCalls).toEqual([
      expect.objectContaining({
        id: 'call_1',
        name: 'echo',
        argumentsSummary: 'echo a',
        status: 'success',
        summary: 'echo a'
      })
    ])
    expect(tools.echo).toHaveBeenCalledWith({ value: 'a' }, expect.anything())
    expect(callbacks.onToolStarted).toHaveBeenCalledWith({
      id: 'call_1',
      name: 'echo',
      argsSummary: 'echo a'
    })
    expect(callbacks.onToolFinished).toHaveBeenCalledTimes(1)

    expect(requests).toHaveLength(2)
    const second = requests[1].messages
    expect(second.at(-2)).toMatchObject({
      role: 'assistant',
      content: '先读取',
      toolCalls: [toolCall('call_1', 'a')]
    })
    expect(second.at(-1)).toMatchObject({
      role: 'tool',
      toolCallId: 'call_1',
      toolName: 'echo'
    })
    expect((second.at(-1) as { content: string }).content).toContain('value=a')
    expect(requests[1].tools).toHaveLength(3)
  })

  it('达到轮数上限后强制一轮不带工具，仍无文本时标记 roundLimitReached', async () => {
    const tools = createTools()
    const { adapter, requests } = scriptAdapter([
      { toolCalls: [toolCall('c1', '1')] },
      { toolCalls: [toolCall('c2', '2')] },
      { text: '' }
    ])

    const result = await run(adapter, tools.registry, createCallbacks(), {
      limits: { maxRounds: 2 }
    })

    expect(result.roundLimitReached).toBe(true)
    expect(result.answerText).toBe('')
    expect(result.toolCalls).toHaveLength(2)
    expect(requests).toHaveLength(3)
    expect(requests[2].tools).toBeUndefined()
  })

  it('收尾轮只输出 DSML 调用标记时从正文中剔除，并提示模型不再调用工具', async () => {
    const tools = createTools()
    const dsml = [
      '<｜｜DSML｜｜ calls>',
      '<｜｜DSML｜｜ invoke name="read_file">',
      '<｜｜DSML｜｜ parameter name="path" string="true">backend/src/index.ts</｜｜DSML｜｜ parameter>',
      '</｜｜DSML｜｜ invoke>',
      '</｜｜DSML｜｜ calls>'
    ].join('\n')
    const { adapter, requests } = scriptAdapter([
      { toolCalls: [toolCall('c1', '1')] },
      { toolCalls: [toolCall('c2', '2')] },
      { text: `已读取部分文件。\n\n${dsml}` }
    ])

    const result = await run(adapter, tools.registry, createCallbacks(), {
      limits: { maxRounds: 2 }
    })

    expect(result.text).toBe('已读取部分文件。')
    expect(result.answerText).toBe('已读取部分文件。')
    expect(result.roundLimitReached).toBe(true)
    expect(requests[2].tools).toBeUndefined()
    expect(requests[2].messages.at(-1)).toMatchObject({ role: 'system' })
  })

  it('收尾轮返回文本时即使达到轮数上限也算成功', async () => {
    const tools = createTools()
    const { adapter } = scriptAdapter([
      { toolCalls: [toolCall('c1', '1')] },
      { toolCalls: [toolCall('c2', '2')] },
      { text: '汇总完成' }
    ])

    const result = await run(adapter, tools.registry, createCallbacks(), {
      limits: { maxRounds: 2 }
    })

    expect(result.answerText).toBe('汇总完成')
    expect(result.roundLimitReached).toBe(true)
    expect(result.stopped).toBe(false)
  })

  it('单轮调用超过上限的部分记录为 blocked 且不执行', async () => {
    const tools = createTools()
    const { adapter } = scriptAdapter([
      {
        toolCalls: [toolCall('c1', '1'), toolCall('c2', '2'), toolCall('c3', '3')]
      },
      { text: '完成' }
    ])

    const result = await run(adapter, tools.registry, createCallbacks(), {
      limits: { maxCallsPerRound: 2 }
    })

    expect(tools.echo).toHaveBeenCalledTimes(2)
    expect(result.toolCalls.map((item: ToolCallRecord) => item.status)).toEqual([
      'success',
      'success',
      'blocked'
    ])
    expect(result.toolCalls[2].summary).toContain('上限')
  })

  it('重复调用只执行一次', async () => {
    const tools = createTools()
    const { adapter } = scriptAdapter([
      { toolCalls: [toolCall('c1', 'same'), toolCall('c2', 'same')] },
      { text: '完成' }
    ])

    const result = await run(adapter, tools.registry, createCallbacks())

    expect(tools.echo).toHaveBeenCalledTimes(1)
    expect(result.toolCalls[1].status).toBe('blocked')
    expect(result.toolCalls[1].summary).toBe('重复调用已跳过')
  })

  it('总调用上限会阻止后续轮次的工具执行', async () => {
    const tools = createTools()
    const { adapter, requests } = scriptAdapter([
      { toolCalls: [toolCall('c1', '1'), toolCall('c2', '2')] },
      { toolCalls: [toolCall('c3', '3')] },
      { text: '完成' }
    ])

    const result = await run(adapter, tools.registry, createCallbacks(), {
      limits: { maxToolCalls: 2, maxRounds: 5 }
    })

    expect(tools.echo).toHaveBeenCalledTimes(2)
    expect(result.roundLimitReached).toBe(true)
    expect(requests.at(-1)?.tools).toBeUndefined()
  })

  it('敏感文件工具错误记录为 blocked，其他错误记录为 error', async () => {
    const tools = createTools()
    const { adapter } = scriptAdapter([
      {
        toolCalls: [
          { id: 's1', name: 'sensitive', arguments: { path: '.env' } },
          { id: 'u1', name: 'unknown_tool', arguments: {} }
        ]
      },
      { text: '继续' }
    ])

    const result = await run(adapter, tools.registry, createCallbacks())

    expect(result.toolCalls[0].status).toBe('blocked')
    expect(result.toolCalls[0].summary).toBe('敏感文件')
    expect(result.toolCalls[1].status).toBe('error')
  })

  it('单工具超时记录为 timeout', async () => {
    const tools = createTools()
    const { adapter } = scriptAdapter([
      { toolCalls: [{ id: 'slow1', name: 'slow', arguments: {} }] },
      { text: '超时后继续' }
    ])

    const result = await run(adapter, tools.registry, createCallbacks(), {
      limits: { toolTimeoutMs: 20 }
    })

    expect(result.toolCalls[0]).toMatchObject({ status: 'timeout', summary: '执行超时' })
    expect(result.answerText).toBe('超时后继续')
  })

  it('工具执行中取消会停止循环并标记 stopped', async () => {
    const tools = createTools()
    const controller = new AbortController()
    const callbacks = createCallbacks()
    callbacks.onToolStarted = vi.fn(() => controller.abort())
    const { adapter, requests } = scriptAdapter([
      { toolCalls: [{ id: 'slow1', name: 'slow', arguments: {} }] },
      { text: '不应到达' }
    ])

    const result = await run(adapter, tools.registry, callbacks, {
      signal: controller.signal,
      limits: { toolTimeoutMs: 5_000 }
    })

    expect(result.stopped).toBe(true)
    expect(result.toolCalls[0].status).toBe('cancelled')
    expect(requests).toHaveLength(1)
  })

  it('按单工具与总输出上限截断结果', async () => {
    const tools = createTools({ longOutput: true })
    const { adapter, requests } = scriptAdapter([
      {
        toolCalls: [
          { id: 'e1', name: 'echo', arguments: { value: '1' } },
          { id: 'e2', name: 'echo', arguments: { value: '2' } }
        ]
      },
      { text: '完成' }
    ])

    const result = await run(adapter, tools.registry, createCallbacks(), {
      limits: { maxToolOutputChars: 100, maxTotalToolOutputChars: 90 }
    })

    const secondRound = requests[1].messages
    const firstToolMessage = secondRound.find((message) => message.role === 'tool')
    expect((firstToolMessage as { content: string }).content).toContain('[输出已截断')
    expect(result.toolCalls[1].status).toBe('blocked')
    expect(result.toolCalls[1].summary).toContain('输出总量已达上限')
  })

  it('输出预算耗尽后立即停止本轮，后续调用不再执行', async () => {
    const tools = createTools({ longOutput: true })
    const { adapter } = scriptAdapter([
      {
        toolCalls: [
          { id: 'b1', name: 'echo', arguments: { value: '1' } },
          { id: 'b2', name: 'echo', arguments: { value: '2' } },
          { id: 'b3', name: 'echo', arguments: { value: '3' } }
        ]
      },
      { text: '完成' }
    ])

    const result = await run(adapter, tools.registry, createCallbacks(), {
      limits: { maxToolOutputChars: 100, maxTotalToolOutputChars: 100 }
    })

    expect(tools.echo).toHaveBeenCalledTimes(1)
    expect(result.toolCalls).toHaveLength(2)
    expect(result.toolCalls[1].status).toBe('blocked')
    expect(result.toolCalls[1].summary).toContain('输出总量已达上限')
    expect(result.roundLimitReached).toBe(true)
    expect(result.answerText).toBe('完成')
  })

  it('聚合多轮 usage', async () => {
    const tools = createTools()
    const { adapter } = scriptAdapter([
      {
        toolCalls: [toolCall('c1', '1')],
        usage: { inputTokens: 10, outputTokens: 5 }
      },
      { text: '完成', usage: { inputTokens: 20, outputTokens: 8 } }
    ])
    const callbacks = createCallbacks()

    const result = await run(adapter, tools.registry, callbacks)

    expect(result.usage).toEqual({ inputTokens: 30, outputTokens: 13 })
    expect(callbacks.onUsage).toHaveBeenCalledTimes(2)
  })
})
