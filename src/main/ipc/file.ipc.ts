import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/constants/app'
import { fileReadInputSchema } from '@shared/schemas/ipc'
import { fileService } from '../services/file.service'
import { ipcErrorFrom } from '../utils/ipc-error'
import { ipcFail, ipcOk } from '../utils/ipc-result'

export function registerFileIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.fileRead, async (_event, input: unknown) => {
    const parsed = fileReadInputSchema.safeParse(input)
    if (!parsed.success) {
      return ipcFail('VALIDATION_ERROR', '文件读取参数不合法')
    }

    try {
      return ipcOk(await fileService.read(parsed.data.repositoryId, parsed.data.relativePath))
    } catch (error) {
      return ipcErrorFrom(error)
    }
  })
}
