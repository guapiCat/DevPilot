import { BrowserWindow, dialog, ipcMain } from 'electron'
import type { OpenDialogOptions } from 'electron'
import { IPC_CHANNELS } from '@shared/constants/app'
import { repositoryIdInputSchema } from '@shared/schemas/ipc'
import { repositoryService } from '../services/repository.service'
import { ipcErrorFrom } from '../utils/ipc-error'
import { ipcFail, ipcOk } from '../utils/ipc-result'

export function registerRepositoryIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.repositorySelect, async (event) => {
    try {
      const options: OpenDialogOptions = {
        title: '选择本地仓库',
        properties: ['openDirectory']
      }
      const window = BrowserWindow.fromWebContents(event.sender)
      const result = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options)

      if (result.canceled || result.filePaths.length === 0) {
        return ipcOk(null)
      }

      return ipcOk(await repositoryService.register(result.filePaths[0]))
    } catch (error) {
      return ipcErrorFrom(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.repositoryList, () => ipcOk(repositoryService.list()))

  ipcMain.handle(IPC_CHANNELS.repositoryRemove, (_event, input: unknown) => {
    const parsed = repositoryIdInputSchema.safeParse(input)
    if (!parsed.success) {
      return ipcFail('VALIDATION_ERROR', '仓库参数不合法')
    }

    try {
      repositoryService.remove(parsed.data.repositoryId)
      return ipcOk(null)
    } catch (error) {
      return ipcErrorFrom(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.repositoryGetTree, async (_event, input: unknown) => {
    const parsed = repositoryIdInputSchema.safeParse(input)
    if (!parsed.success) {
      return ipcFail('VALIDATION_ERROR', '仓库参数不合法')
    }

    try {
      return ipcOk(await repositoryService.getTree(parsed.data.repositoryId))
    } catch (error) {
      return ipcErrorFrom(error)
    }
  })
}
