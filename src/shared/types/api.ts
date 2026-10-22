import type { AiConfigStatus, AppInfo } from './app'
import type { IpcResult } from './ipc'

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
}
