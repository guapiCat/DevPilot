import type { ErrorCode } from './ipc'

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool'

export type ChatMessageStatus = 'streaming' | 'cancelled' | 'error'

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  createdAt: string
  status?: ChatMessageStatus
}

export interface Conversation {
  id: string
  title: string
  repositoryId: string | null
  createdAt: string
  updatedAt: string
}

export type ChatEvent =
  | { type: 'started'; requestId: string; conversationId: string; assistantMessageId: string }
  | { type: 'text_delta'; requestId: string; conversationId: string; text: string }
  | { type: 'completed'; requestId: string; conversationId: string; assistantMessage: ChatMessage }
  | { type: 'cancelled'; requestId: string; conversationId: string }
  | { type: 'error'; requestId: string; conversationId: string; code: ErrorCode; message: string }

export interface SendChatInput {
  requestId: string
  conversationId: string
  content: string
}

export interface RetryChatInput {
  requestId: string
  conversationId: string
}

export interface SendChatResult {
  requestId: string
  conversationId: string
  userMessage: ChatMessage
}

export interface RetryChatResult {
  requestId: string
  conversationId: string
}

export interface CancelChatResult {
  cancelled: boolean
}

export interface AiConnectionTestResult {
  model: string
  latencyMs: number
}
