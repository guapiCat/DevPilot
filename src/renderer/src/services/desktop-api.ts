import type { AiConfigStatus, AppInfo } from '@shared/types/app'
import type { PingResponse } from '@shared/types/api'
import type { ErrorCode, IpcErrorPayload, IpcResult } from '@shared/types/ipc'

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
  }
}
