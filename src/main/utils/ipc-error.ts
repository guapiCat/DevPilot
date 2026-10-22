import type { IpcResult } from '@shared/types/ipc'
import { ipcFail } from './ipc-result'
import { ServiceError } from './service-error'

export function ipcErrorFrom(error: unknown): IpcResult<never> {
  if (error instanceof ServiceError) {
    return ipcFail(error.code, error.message)
  }

  const summary = error instanceof Error ? error.message : 'unknown error'
  console.error(`[ipc] 未处理的主进程错误: ${summary}`)
  return ipcFail('INTERNAL_ERROR', '操作失败，请稍后重试')
}
