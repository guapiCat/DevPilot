import type { AiConfigStatus, AppInfo } from '@shared/types/app'
import type { PingResponse } from '@shared/types/api'
import type {
  AiConnectionTestResult,
  CancelChatResult,
  ChatEvent,
  ChatMessage,
  Conversation,
  RetryChatResult,
  SendChatResult,
} from '@shared/types/chat'
import type { ApplyFileEditResult, EditSession, FileEdit } from '@shared/types/edit'
import type {
  GitBranchList,
  GitCommitDetail,
  GitCommitResult,
  GitDiffResult,
  GitLogResult,
  GitRemoteStatus,
  GitStatus,
} from '@shared/types/git'
import type { ErrorCode, IpcErrorPayload, IpcResult } from '@shared/types/ipc'
import type { ModelProfileInput, TestModelProfileInput } from '@shared/types/model'
import type { FileContent, FileTreeResult, FileWriteResult, RepositorySummary } from '@shared/types/repository'

export class DesktopApiError extends Error {
  readonly code: ErrorCode

  constructor(error: IpcErrorPayload) {
    super(error.message)
    this.name = 'DesktopApiError'
    this.code = error.code
  }
}

function unwrap<T>(result: IpcResult<T>): T {
  if (!result.ok) {
    throw new DesktopApiError(result.error)
  }
  return result.data
}

export const desktopApi = {
  app: {
    async getInfo(): Promise<AppInfo> {
      return unwrap(await window.devPilot.app.getInfo())
    },
    async ping(message: string): Promise<PingResponse> {
      return unwrap(await window.devPilot.app.ping(message))
    },
  },
  settings: {
    async getAiConfigStatus(): Promise<AiConfigStatus> {
      return unwrap(await window.devPilot.settings.getAiConfigStatus())
    },
    async testConnection(): Promise<AiConnectionTestResult> {
      return unwrap(await window.devPilot.settings.testConnection())
    },
    async saveModelProfile(input: ModelProfileInput): Promise<AiConfigStatus> {
      return unwrap(await window.devPilot.settings.saveModelProfile(input))
    },
    async deleteModelProfile(profileId: string): Promise<AiConfigStatus> {
      return unwrap(await window.devPilot.settings.deleteModelProfile(profileId))
    },
    async activateModelProfile(profileId: string): Promise<AiConfigStatus> {
      return unwrap(await window.devPilot.settings.activateModelProfile(profileId))
    },
    async testModelProfile(input: TestModelProfileInput): Promise<AiConnectionTestResult> {
      return unwrap(await window.devPilot.settings.testModelProfile(input))
    },
  },
  chat: {
    async listConversations(): Promise<Conversation[]> {
      return unwrap(await window.devPilot.chat.listConversations())
    },
    async createConversation(repositoryId: string | null): Promise<Conversation> {
      return unwrap(await window.devPilot.chat.createConversation(repositoryId))
    },
    async deleteConversation(conversationId: string): Promise<void> {
      unwrap(await window.devPilot.chat.deleteConversation(conversationId))
    },
    async getMessages(conversationId: string): Promise<ChatMessage[]> {
      return unwrap(await window.devPilot.chat.getMessages(conversationId))
    },
    async send(input: { requestId: string; conversationId: string; content: string }): Promise<SendChatResult> {
      return unwrap(await window.devPilot.chat.send(input))
    },
    async retry(input: { requestId: string; conversationId: string }): Promise<RetryChatResult> {
      return unwrap(await window.devPilot.chat.retry(input))
    },
    async cancel(requestId: string): Promise<CancelChatResult> {
      return unwrap(await window.devPilot.chat.cancel(requestId))
    },
    onEvent(listener: (event: ChatEvent) => void): () => void {
      return window.devPilot.chat.onEvent(listener)
    },
  },
  repository: {
    async select(): Promise<RepositorySummary | null> {
      return unwrap(await window.devPilot.repository.select())
    },
    async list(): Promise<RepositorySummary[]> {
      return unwrap(await window.devPilot.repository.list())
    },
    async getTree(repositoryId: string): Promise<FileTreeResult> {
      return unwrap(await window.devPilot.repository.getTree(repositoryId))
    },
    async remove(repositoryId: string): Promise<void> {
      unwrap(await window.devPilot.repository.remove(repositoryId))
    },
  },
  file: {
    async read(repositoryId: string, relativePath: string): Promise<FileContent> {
      return unwrap(await window.devPilot.file.read(repositoryId, relativePath))
    },
    async write(
      repositoryId: string,
      relativePath: string,
      content: string,
      expectedHash: string,
    ): Promise<FileWriteResult> {
      return unwrap(await window.devPilot.file.write(repositoryId, relativePath, content, expectedHash))
    },
  },
  git: {
    async getStatus(repositoryId: string): Promise<GitStatus> {
      return unwrap(await window.devPilot.git.status(repositoryId))
    },
    async getDiff(repositoryId: string, relativePath: string): Promise<GitDiffResult> {
      return unwrap(await window.devPilot.git.diff(repositoryId, relativePath))
    },
    async listBranches(repositoryId: string): Promise<GitBranchList> {
      return unwrap(await window.devPilot.git.listBranches(repositoryId))
    },
    async stage(repositoryId: string, input: { all?: boolean; paths?: string[] }): Promise<void> {
      unwrap(await window.devPilot.git.stage(repositoryId, input))
    },
    async unstage(repositoryId: string, input: { all?: boolean; paths?: string[] }): Promise<void> {
      unwrap(await window.devPilot.git.unstage(repositoryId, input))
    },
    async commit(repositoryId: string, message: string): Promise<GitCommitResult> {
      return unwrap(await window.devPilot.git.commit(repositoryId, message))
    },
    async createBranch(repositoryId: string, branchName: string, checkout: boolean): Promise<void> {
      unwrap(await window.devPilot.git.createBranch(repositoryId, branchName, checkout))
    },
    async switchBranch(repositoryId: string, branchName: string): Promise<void> {
      unwrap(await window.devPilot.git.switchBranch(repositoryId, branchName))
    },
    async log(repositoryId: string, options?: { limit?: number; skip?: number }): Promise<GitLogResult> {
      return unwrap(await window.devPilot.git.log(repositoryId, options))
    },
    async commitDetail(repositoryId: string, sha: string): Promise<GitCommitDetail> {
      return unwrap(await window.devPilot.git.commitDetail(repositoryId, sha))
    },
    async remoteStatus(repositoryId: string): Promise<GitRemoteStatus> {
      return unwrap(await window.devPilot.git.remoteStatus(repositoryId))
    },
    async fetch(repositoryId: string): Promise<void> {
      unwrap(await window.devPilot.git.fetch(repositoryId))
    },
    async pull(repositoryId: string): Promise<void> {
      unwrap(await window.devPilot.git.pull(repositoryId))
    },
    async push(repositoryId: string): Promise<void> {
      unwrap(await window.devPilot.git.push(repositoryId))
    },
  },
  edit: {
    async listPending(conversationId: string): Promise<EditSession[]> {
      return unwrap(await window.devPilot.edit.listPending(conversationId))
    },
    async applyFile(editSessionId: string, fileEditId: string): Promise<ApplyFileEditResult> {
      return unwrap(await window.devPilot.edit.applyFile(editSessionId, fileEditId))
    },
    async rejectFile(editSessionId: string, fileEditId: string): Promise<FileEdit> {
      return unwrap(await window.devPilot.edit.rejectFile(editSessionId, fileEditId))
    },
  },
}
