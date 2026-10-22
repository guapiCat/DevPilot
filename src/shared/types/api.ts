import type { AiConfigStatus, AppInfo } from './app'
import type { IpcResult } from './ipc'
import type { FileContent, FileTreeResult, RepositorySummary } from './repository'

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
  }
  repository: {
    select(): Promise<IpcResult<RepositorySummary | null>>
    list(): Promise<IpcResult<RepositorySummary[]>>
    getTree(repositoryId: string): Promise<IpcResult<FileTreeResult>>
  }
  file: {
    read(repositoryId: string, relativePath: string): Promise<IpcResult<FileContent>>
  }
}
