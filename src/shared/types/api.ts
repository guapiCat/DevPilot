import type { AiConfigStatus, AppInfo } from './app'
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
  }
  repository: {
    select(): Promise<IpcResult<RepositorySummary | null>>
    list(): Promise<IpcResult<RepositorySummary[]>>
    getTree(repositoryId: string): Promise<IpcResult<FileTreeResult>>
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
}
