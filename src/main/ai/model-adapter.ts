export type ModelRole = 'system' | 'user' | 'assistant' | 'tool'

export interface ModelToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface ModelToolCall {
  id: string
  name: string
  arguments: unknown
}

export type ModelMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ModelToolCall[] }
  | { role: 'tool'; content: string; toolCallId: string; toolName: string }

export type ModelEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call'; id: string; name: string; arguments: unknown }
  | { type: 'usage'; inputTokens?: number; outputTokens?: number }

export interface ModelStreamRequest {
  messages: ModelMessage[]
  signal: AbortSignal
  tools?: ModelToolDefinition[]
  maxTokens?: number
  temperature?: number
}

export interface ModelAdapter {
  stream(request: ModelStreamRequest): AsyncIterable<ModelEvent>
}
