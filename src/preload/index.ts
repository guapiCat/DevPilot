import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import { IPC_CHANNELS } from '@shared/constants/app'
import type { DevPilotApi } from '@shared/types/api'
import type { ChatEvent } from '@shared/types/chat'
import type { IpcResult } from '@shared/types/ipc'

// invoke 的返回值由主进程 handler 按 IpcResult 约定构造，这里是唯一的类型断言边界。
function invoke<T>(channel: string, ...args: unknown[]): Promise<IpcResult<T>> {
  return ipcRenderer.invoke(channel, ...args) as Promise<IpcResult<T>>
}

const api: DevPilotApi = {
  app: {
    getInfo: () => invoke(IPC_CHANNELS.appGetInfo),
    ping: (message) => invoke(IPC_CHANNELS.appPing, { message }),
  },
  settings: {
    getAiConfigStatus: () => invoke(IPC_CHANNELS.settingsGetAiConfig),
    testConnection: () => invoke(IPC_CHANNELS.settingsTestConnection),
    saveModelProfile: (input) => invoke(IPC_CHANNELS.settingsSaveModelProfile, input),
    deleteModelProfile: (profileId) => invoke(IPC_CHANNELS.settingsDeleteModelProfile, { profileId }),
    activateModelProfile: (profileId) => invoke(IPC_CHANNELS.settingsActivateModelProfile, { profileId }),
    testModelProfile: (input) => invoke(IPC_CHANNELS.settingsTestModelProfile, input),
  },
  chat: {
    listConversations: () => invoke(IPC_CHANNELS.chatListConversations),
    createConversation: (repositoryId) => invoke(IPC_CHANNELS.chatCreateConversation, { repositoryId }),
    deleteConversation: (conversationId) => invoke(IPC_CHANNELS.chatDeleteConversation, { conversationId }),
    getMessages: (conversationId) => invoke(IPC_CHANNELS.chatGetMessages, { conversationId }),
    send: (input) => invoke(IPC_CHANNELS.chatSend, input),
    retry: (input) => invoke(IPC_CHANNELS.chatRetry, input),
    cancel: (requestId) => invoke(IPC_CHANNELS.chatCancel, { requestId }),
    onEvent: (listener) => {
      const handler = (_event: IpcRendererEvent, payload: ChatEvent): void => listener(payload)
      ipcRenderer.on(IPC_CHANNELS.chatEvent, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.chatEvent, handler)
    },
  },
  repository: {
    select: () => invoke(IPC_CHANNELS.repositorySelect),
    list: () => invoke(IPC_CHANNELS.repositoryList),
    getTree: (repositoryId) => invoke(IPC_CHANNELS.repositoryGetTree, { repositoryId }),
    remove: (repositoryId) => invoke(IPC_CHANNELS.repositoryRemove, { repositoryId }),
  },
  file: {
    read: (repositoryId, relativePath) => invoke(IPC_CHANNELS.fileRead, { repositoryId, relativePath }),
    write: (repositoryId, relativePath, content, expectedHash) =>
      invoke(IPC_CHANNELS.fileWrite, { repositoryId, relativePath, content, expectedHash }),
  },
  git: {
    status: (repositoryId) => invoke(IPC_CHANNELS.gitStatus, { repositoryId }),
    diff: (repositoryId, relativePath) => invoke(IPC_CHANNELS.gitDiff, { repositoryId, relativePath }),
    listBranches: (repositoryId) => invoke(IPC_CHANNELS.gitListBranches, { repositoryId }),
    stage: (repositoryId, input) => invoke(IPC_CHANNELS.gitStage, { repositoryId, ...input }),
    unstage: (repositoryId, input) => invoke(IPC_CHANNELS.gitUnstage, { repositoryId, ...input }),
    commit: (repositoryId, message) => invoke(IPC_CHANNELS.gitCommit, { repositoryId, message }),
    createBranch: (repositoryId, branchName, checkout) =>
      invoke(IPC_CHANNELS.gitCreateBranch, { repositoryId, branchName, checkout }),
    switchBranch: (repositoryId, branchName) => invoke(IPC_CHANNELS.gitSwitchBranch, { repositoryId, branchName }),
    log: (repositoryId, options) => invoke(IPC_CHANNELS.gitLog, { repositoryId, ...options }),
    commitDetail: (repositoryId, sha) => invoke(IPC_CHANNELS.gitCommitDetail, { repositoryId, sha }),
    remoteStatus: (repositoryId) => invoke(IPC_CHANNELS.gitRemoteStatus, { repositoryId }),
    fetch: (repositoryId) => invoke(IPC_CHANNELS.gitFetch, { repositoryId }),
    pull: (repositoryId) => invoke(IPC_CHANNELS.gitPull, { repositoryId }),
    push: (repositoryId) => invoke(IPC_CHANNELS.gitPush, { repositoryId }),
  },
  edit: {
    listPending: (conversationId) => invoke(IPC_CHANNELS.editListPending, { conversationId }),
    applyFile: (editSessionId, fileEditId) => invoke(IPC_CHANNELS.editApplyFile, { editSessionId, fileEditId }),
    rejectFile: (editSessionId, fileEditId) => invoke(IPC_CHANNELS.editRejectFile, { editSessionId, fileEditId }),
  },
}

contextBridge.exposeInMainWorld('devPilot', api)
