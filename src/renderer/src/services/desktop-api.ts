import type { AiConfigStatus, AppInfo } from '@shared/types/app'
import type { PingResponse } from '@shared/types/api'
import type { ErrorCode, IpcErrorPayload, IpcResult } from '@shared/types/ipc'
import type { FileContent, FileTreeResult, RepositorySummary } from '@shared/types/repository'

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
    }
  },
  file: {
    async read(repositoryId: string, relativePath: string): Promise<FileContent> {
      return unwrap(await window.devPilot.file.read(repositoryId, relativePath))
    }
  }
}
