import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/constants/app'
import { gitDiffInputSchema, repositoryIdInputSchema } from '@shared/schemas/ipc'
import { gitService } from '../services/git.service'
import { ipcErrorFrom } from '../utils/ipc-error'
import { ipcFail, ipcOk } from '../utils/ipc-result'

export function registerGitIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.gitStatus, async (_event, input: unknown) => {
    const parsed = repositoryIdInputSchema.safeParse(input)
    if (!parsed.success) {
      return ipcFail('VALIDATION_ERROR', 'Git 状态参数不合法')
    }

    try {
      return ipcOk(await gitService.getStatus(parsed.data.repositoryId))
    } catch (error) {
      return ipcErrorFrom(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.gitDiff, async (_event, input: unknown) => {
    const parsed = gitDiffInputSchema.safeParse(input)
    if (!parsed.success) {
      return ipcFail('VALIDATION_ERROR', 'Git Diff 参数不合法')
    }

    try {
      return ipcOk(await gitService.getDiff(parsed.data.repositoryId, parsed.data.relativePath))
    } catch (error) {
      return ipcErrorFrom(error)
    }
  })
}
