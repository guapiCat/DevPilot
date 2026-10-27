import { randomUUID } from 'node:crypto'
import type { BaseChatModel, BindToolsInput } from '@langchain/core/language_models/chat_models'
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import type {
  ModelAdapter,
  ModelEvent,
  ModelMessage,
  ModelStreamRequest,
  ModelToolCall,
  ModelToolDefinition,
} from './model-adapter'
import { toModelAdapterError } from './model-error'

export interface ChatModelOptions {
  apiKey: string
  model: string
  maxTokens?: number
  temperature?: number
  streaming: true
  configuration: { baseURL: string }
}

export interface OpenAiCompatibleAdapterOptions {
  apiKey: string
  model: string
  baseUrl: string
  createModel: (options: ChatModelOptions) => BaseChatModel
}

interface ToolCallChunkLike {
  id?: string | null
  name?: string | null
  args?: string | null
  index?: number | null
}

export interface ToolCallAccumulatorState {
  id: string
  name: string
  argsText: string
}

function isTextBlock(block: unknown): block is { type: 'text'; text: string } {
  if (block === null || typeof block !== 'object') return false
  const record = block as Record<string, unknown>
  return record.type === 'text' && typeof record.text === 'string'
}

export function normalizeContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter(isTextBlock)
      .map((block) => block.text)
      .join('')
  }
  return ''
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function toOpenAiTools(tools: ModelToolDefinition[]): BindToolsInput[] {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }))
}

function toLangChainMessage(message: ModelMessage): SystemMessage | HumanMessage | AIMessage | ToolMessage {
  if (message.role === 'system') return new SystemMessage(message.content)
  if (message.role === 'user') return new HumanMessage(message.content)
  if (message.role === 'tool') {
    return new ToolMessage({
      content: message.content,
      tool_call_id: message.toolCallId,
      name: message.toolName,
    })
  }

  const toolCalls = message.toolCalls?.map((call) => ({
    id: call.id,
    name: call.name,
    args: isPlainObject(call.arguments) ? call.arguments : {},
    type: 'tool_call' as const,
  }))

  return new AIMessage({
    content: message.content,
    ...(toolCalls && toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
  })
}

export function mergeToolCallChunks(
  state: Map<number, ToolCallAccumulatorState>,
  chunks: readonly ToolCallChunkLike[],
): void {
  chunks.forEach((chunk, position) => {
    const index = typeof chunk.index === 'number' ? chunk.index : position
    const current = state.get(index) ?? { id: '', name: '', argsText: '' }

    if (chunk.id) current.id += chunk.id
    if (chunk.name) current.name += chunk.name
    if (chunk.args) current.argsText += chunk.args

    state.set(index, current)
  })
}

export function finalizeToolCalls(state: Map<number, ToolCallAccumulatorState>): ModelToolCall[] {
  const calls: ModelToolCall[] = []

  for (const [, item] of [...state.entries()].sort(([left], [right]) => left - right)) {
    if (!item.name) continue

    let args: unknown = null
    try {
      const parsed: unknown = JSON.parse(item.argsText || '{}')
      if (isPlainObject(parsed)) args = parsed
    } catch {
      args = null
    }

    calls.push({ id: item.id || randomUUID(), name: item.name, arguments: args })
  }

  return calls
}

export class OpenAiCompatibleAdapter implements ModelAdapter {
  constructor(private readonly options: OpenAiCompatibleAdapterOptions) {}

  async *stream(request: ModelStreamRequest): AsyncIterable<ModelEvent> {
    const model = this.options.createModel({
      apiKey: this.options.apiKey,
      model: this.options.model,
      maxTokens: request.maxTokens,
      temperature: request.temperature,
      streaming: true,
      configuration: { baseURL: this.options.baseUrl },
    })

    const runnable = request.tools && request.tools.length > 0 ? model.bindTools!(toOpenAiTools(request.tools)) : model

    try {
      const stream = await runnable.stream(request.messages.map(toLangChainMessage), {
        signal: request.signal,
      })

      const toolState = new Map<number, ToolCallAccumulatorState>()
      let usage: { inputTokens?: number; outputTokens?: number } | null = null

      for await (const chunk of stream) {
        if (request.signal.aborted) return

        const text = normalizeContent(chunk.content)
        if (text) yield { type: 'text_delta', text }

        const toolChunks = (chunk as { tool_call_chunks?: ToolCallChunkLike[] }).tool_call_chunks
        if (toolChunks && toolChunks.length > 0) mergeToolCallChunks(toolState, toolChunks)

        if (chunk.usage_metadata) {
          usage = {
            inputTokens: chunk.usage_metadata.input_tokens,
            outputTokens: chunk.usage_metadata.output_tokens,
          }
        }
      }

      for (const call of finalizeToolCalls(toolState)) {
        yield { type: 'tool_call', id: call.id, name: call.name, arguments: call.arguments }
      }

      if (usage) yield { type: 'usage', ...usage }
    } catch (error) {
      // 中止由 ChatService 根据 AbortController 的原因统一收尾。
      if (request.signal.aborted) return
      throw toModelAdapterError(error)
    }
  }
}
