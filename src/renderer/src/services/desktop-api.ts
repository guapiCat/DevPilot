import type { AiConfigStatus, AppInfo } from '@shared/types/app'
import type { PingResponse } from '@shared/types/api'
import type {
  AiConnectionTestResult,
  CancelChatResult,
  ChatEvent,
  ChatMessage,
  Conversation,
  RetryChatResult,
  SendChatResult
} from '@shared/types/chat'
import type { ApplyFileEditResult, EditSession, FileEdit } from '@shared/types/edit'
import type { GitDiffResult, GitStatus } from '@shared/types/git'
import type { ErrorCode, IpcErrorPayload, IpcResult } from '@shared/types/ipc'
import type {
  FileContent,
  FileTreeResult,
  FileWriteResult,
  RepositorySummary
} from '@shared/types/repository'

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
    }
  },
  settings: {
    async getAiConfigStatus(): Promise<AiConfigStatus> {
      return unwrap(await window.devPilot.settings.getAiConfigStatus())
    },
    async testConnection(): Promise<AiConnectionTestResult> {
      return unwrap(await window.devPilot.settings.testConnection())
    }
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
    async send(input: {
      requestId: string
      conversationId: string
      content: string
    }): Promise<SendChatResult> {
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
    }
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
    }
  },
  file: {
    async read(repositoryId: string, relativePath: string): Promise<FileContent> {
      return unwrap(await window.devPilot.file.read(repositoryId, relativePath))
    },
    async write(
      repositoryId: string,
      relativePath: string,
      content: string,
      expectedHash: string
    ): Promise<FileWriteResult> {
      return unwrap(
        await window.devPilot.file.write(repositoryId, relativePath, content, expectedHash)
      )
    }
  },
  git: {
    async getStatus(repositoryId: string): Promise<GitStatus> {
      return unwrap(await window.devPilot.git.status(repositoryId))
    },
    async getDiff(repositoryId: string, relativePath: string): Promise<GitDiffResult> {
      return unwrap(await window.devPilot.git.diff(repositoryId, relativePath))
    }
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
    }
  }
}
