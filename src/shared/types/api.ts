import type { AiConfigStatus, AppInfo } from './app'
import type {
  AiConnectionTestResult,
  CancelChatResult,
  ChatEvent,
  ChatMessage,
  Conversation,
  RetryChatResult,
  SendChatResult,
} from './chat'
import type { ApplyFileEditResult, EditSession, FileEdit } from './edit'
import type {
  GitBranchList,
  GitCommitDetail,
  GitCommitResult,
  GitDiffResult,
  GitLogResult,
  GitRemoteStatus,
  GitStatus,
} from './git'
import type { IpcResult } from './ipc'
import type { ModelProfileInput, TestModelProfileInput } from './model'
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
    saveModelProfile(input: ModelProfileInput): Promise<IpcResult<AiConfigStatus>>
    deleteModelProfile(profileId: string): Promise<IpcResult<AiConfigStatus>>
    activateModelProfile(profileId: string): Promise<IpcResult<AiConfigStatus>>
    testModelProfile(input: TestModelProfileInput): Promise<IpcResult<AiConnectionTestResult>>
  }
  chat: {
    listConversations(): Promise<IpcResult<Conversation[]>>
    createConversation(repositoryId: string | null): Promise<IpcResult<Conversation>>
    deleteConversation(conversationId: string): Promise<IpcResult<null>>
    getMessages(conversationId: string): Promise<IpcResult<ChatMessage[]>>
    send(input: { requestId: string; conversationId: string; content: string }): Promise<IpcResult<SendChatResult>>
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
      expectedHash: string,
    ): Promise<IpcResult<FileWriteResult>>
  }
  git: {
    status(repositoryId: string): Promise<IpcResult<GitStatus>>
    diff(repositoryId: string, relativePath: string): Promise<IpcResult<GitDiffResult>>
    listBranches(repositoryId: string): Promise<IpcResult<GitBranchList>>
    stage(repositoryId: string, input: { all?: boolean; paths?: string[] }): Promise<IpcResult<null>>
    unstage(repositoryId: string, input: { all?: boolean; paths?: string[] }): Promise<IpcResult<null>>
    commit(repositoryId: string, message: string): Promise<IpcResult<GitCommitResult>>
    createBranch(repositoryId: string, branchName: string, checkout: boolean): Promise<IpcResult<null>>
    switchBranch(repositoryId: string, branchName: string): Promise<IpcResult<null>>
    log(repositoryId: string, options?: { limit?: number; skip?: number }): Promise<IpcResult<GitLogResult>>
    commitDetail(repositoryId: string, sha: string): Promise<IpcResult<GitCommitDetail>>
    remoteStatus(repositoryId: string): Promise<IpcResult<GitRemoteStatus>>
    fetch(repositoryId: string): Promise<IpcResult<null>>
    pull(repositoryId: string): Promise<IpcResult<null>>
    push(repositoryId: string): Promise<IpcResult<null>>
  }
  edit: {
    listPending(conversationId: string): Promise<IpcResult<EditSession[]>>
    applyFile(editSessionId: string, fileEditId: string): Promise<IpcResult<ApplyFileEditResult>>
    rejectFile(editSessionId: string, fileEditId: string): Promise<IpcResult<FileEdit>>
  }
}
