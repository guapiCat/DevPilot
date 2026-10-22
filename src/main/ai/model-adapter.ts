export type ModelRole = 'system' | 'user' | 'assistant'

export interface ModelMessage {
  role: ModelRole
  content: string
}

export type ModelEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'usage'; inputTokens?: number; outputTokens?: number }

export interface ModelStreamRequest {
  messages: ModelMessage[]
  signal: AbortSignal
  maxTokens?: number
  temperature?: number
}

export interface ModelAdapter {
  stream(request: ModelStreamRequest): AsyncIterable<ModelEvent>
}
