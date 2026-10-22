import type { FileEditOperation } from './edit'
import type { ErrorCode } from './ipc'
import type { ToolCallRecord, ToolCallStatus } from './tool'

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool'

export type ChatMessageStatus = 'streaming' | 'cancelled' | 'error'

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  createdAt: string
  status?: ChatMessageStatus
  toolCalls?: ToolCallRecord[]
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
  | {
      type: 'tool_started'
      requestId: string
      conversationId: string
      toolCallId: string
      name: string
      argsSummary: string
    }
  | {
      type: 'tool_finished'
      requestId: string
      conversationId: string
      toolCallId: string
      name: string
      status: ToolCallStatus
      summary: string
      durationMs: number
    }
  | {
      type: 'edit_proposed'
      requestId: string
      conversationId: string
      editSessionId: string
      fileEditId: string
      relativePath: string
      operation: FileEditOperation
    }
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
