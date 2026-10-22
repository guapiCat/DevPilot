import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'
import { ChatDeepSeek } from '@langchain/deepseek'
import type { ModelAdapter, ModelEvent, ModelMessage, ModelStreamRequest } from './model-adapter'
import { toModelAdapterError } from './model-error'

export interface DeepSeekAdapterOptions {
  apiKey: string
  model: string
  baseUrl: string
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

function toLangChainMessage(message: ModelMessage): SystemMessage | HumanMessage | AIMessage {
  if (message.role === 'system') return new SystemMessage(message.content)
  if (message.role === 'assistant') return new AIMessage(message.content)
  return new HumanMessage(message.content)
}

export class DeepSeekAdapter implements ModelAdapter {
  constructor(private readonly options: DeepSeekAdapterOptions) {}

  async *stream(request: ModelStreamRequest): AsyncIterable<ModelEvent> {
    const model = new ChatDeepSeek({
      apiKey: this.options.apiKey,
      model: this.options.model,
      maxTokens: request.maxTokens,
      temperature: request.temperature,
      streaming: true,
      configuration: { baseURL: this.options.baseUrl }
    })

    try {
      const stream = await model.stream(request.messages.map(toLangChainMessage), {
        signal: request.signal
      })

      for await (const chunk of stream) {
        if (request.signal.aborted) return

        const text = normalizeContent(chunk.content)
        if (text) yield { type: 'text_delta', text }

        if (chunk.usage_metadata) {
          yield {
            type: 'usage',
            inputTokens: chunk.usage_metadata.input_tokens,
            outputTokens: chunk.usage_metadata.output_tokens
          }
        }
      }
    } catch (error) {
      // 中止由 ChatService 根据 AbortController 的原因统一收尾。
      if (request.signal.aborted) return
      throw toModelAdapterError(error)
    }
  }
}
