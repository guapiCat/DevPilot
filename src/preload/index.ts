import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '@shared/constants/app'
import type { DevPilotApi } from '@shared/types/api'
import type { IpcResult } from '@shared/types/ipc'

// invoke 的返回值由主进程 handler 按 IpcResult 约定构造，这里是唯一的类型断言边界。
function invoke<T>(channel: string, ...args: unknown[]): Promise<IpcResult<T>> {
  return ipcRenderer.invoke(channel, ...args) as Promise<IpcResult<T>>
}

const api: DevPilotApi = {
  app: {
    getInfo: () => invoke(IPC_CHANNELS.appGetInfo),
    ping: (message) => invoke(IPC_CHANNELS.appPing, { message })
  },
  settings: {
    getAiConfigStatus: () => invoke(IPC_CHANNELS.settingsGetAiConfig)
  },
  repository: {
    select: () => invoke(IPC_CHANNELS.repositorySelect),
    list: () => invoke(IPC_CHANNELS.repositoryList),
    getTree: (repositoryId) => invoke(IPC_CHANNELS.repositoryGetTree, { repositoryId })
  },
  file: {
    read: (repositoryId, relativePath) =>
      invoke(IPC_CHANNELS.fileRead, { repositoryId, relativePath }),
    write: (repositoryId, relativePath, content, expectedHash) =>
      invoke(IPC_CHANNELS.fileWrite, { repositoryId, relativePath, content, expectedHash })
  },
  git: {
    status: (repositoryId) => invoke(IPC_CHANNELS.gitStatus, { repositoryId }),
    diff: (repositoryId, relativePath) =>
      invoke(IPC_CHANNELS.gitDiff, { repositoryId, relativePath })
  }
}

contextBridge.exposeInMainWorld('devPilot', api)
