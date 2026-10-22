import type { AiConfigStatus, AppInfo } from './app'
import type {
  AiConnectionTestResult,
  CancelChatResult,
  ChatEvent,
  ChatMessage,
  Conversation,
  RetryChatResult,
  SendChatResult
} from './chat'
import type { ApplyFileEditResult, EditSession, FileEdit } from './edit'
import type { GitDiffResult, GitStatus } from './git'
import type { IpcResult } from './ipc'
import type { FileContent, FileTreeResult, FileWriteResult, RepositorySummary } from './repository'

export interface PingResponse {
  message: string
  receivedAt: string
}

export interface DevPilotApi {
  app: {
    getInfo(): Promise<IpcResult<AppInfo>>
    ping(message: string): Promise<IpcResult<PingResponse>>
  }
  settings: {
    getAiConfigStatus(): Promise<IpcResult<AiConfigStatus>>
    testConnection(): Promise<IpcResult<AiConnectionTestResult>>
  }
  chat: {
    listConversations(): Promise<IpcResult<Conversation[]>>
    createConversation(repositoryId: string | null): Promise<IpcResult<Conversation>>
    deleteConversation(conversationId: string): Promise<IpcResult<null>>
    getMessages(conversationId: string): Promise<IpcResult<ChatMessage[]>>
    send(input: {
      requestId: string
      conversationId: string
      content: string
    }): Promise<IpcResult<SendChatResult>>
    retry(input: { requestId: string; conversationId: string }): Promise<IpcResult<RetryChatResult>>
    cancel(requestId: string): Promise<IpcResult<CancelChatResult>>
    onEvent(listener: (event: ChatEvent) => void): () => void
  }
  repository: {
    select(): Promise<IpcResult<RepositorySummary | null>>
    list(): Promise<IpcResult<RepositorySummary[]>>
    getTree(repositoryId: string): Promise<IpcResult<FileTreeResult>>
    remove(repositoryId: string): Promise<IpcResult<null>>
  }
  file: {
    read(repositoryId: string, relativePath: string): Promise<IpcResult<FileContent>>
    write(
      repositoryId: string,
      relativePath: string,
      content: string,
      expectedHash: string
    ): Promise<IpcResult<FileWriteResult>>
  }
  git: {
    status(repositoryId: string): Promise<IpcResult<GitStatus>>
    diff(repositoryId: string, relativePath: string): Promise<IpcResult<GitDiffResult>>
  }
  edit: {
    listPending(conversationId: string): Promise<IpcResult<EditSession[]>>
    applyFile(editSessionId: string, fileEditId: string): Promise<IpcResult<ApplyFileEditResult>>
    rejectFile(editSessionId: string, fileEditId: string): Promise<IpcResult<FileEdit>>
  }
}
