import type { ErrorCode, IpcResult } from '@shared/types/ipc'

export function ipcOk<T>(data: T): IpcResult<T> {
  return { ok: true, data }
}

export function ipcFail(code: ErrorCode, message: string): IpcResult<never> {
  return { ok: false, error: { code, message } }
}
