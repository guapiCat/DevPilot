import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/constants/app'
import { editFileInputSchema, editListPendingInputSchema } from '@shared/schemas/ipc'
import { editService } from '../services/edit.service'
import { ipcErrorFrom } from '../utils/ipc-error'
import { ipcFail, ipcOk } from '../utils/ipc-result'

export function registerEditIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.editListPending, (_event, input: unknown) => {
    const parsed = editListPendingInputSchema.safeParse(input)
    if (!parsed.success) return ipcFail('VALIDATION_ERROR', '会话参数不合法')

    try {
      return ipcOk(editService.listPendingSessions(parsed.data.conversationId))
    } catch (error) {
      return ipcErrorFrom(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.editApplyFile, async (_event, input: unknown) => {
    const parsed = editFileInputSchema.safeParse(input)
    if (!parsed.success) return ipcFail('VALIDATION_ERROR', '修改建议参数不合法')

    try {
      return ipcOk(await editService.applyFile(parsed.data.editSessionId, parsed.data.fileEditId))
    } catch (error) {
      return ipcErrorFrom(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.editRejectFile, (_event, input: unknown) => {
    const parsed = editFileInputSchema.safeParse(input)
    if (!parsed.success) return ipcFail('VALIDATION_ERROR', '修改建议参数不合法')

    try {
      return ipcOk(editService.rejectFile(parsed.data.editSessionId, parsed.data.fileEditId))
    } catch (error) {
      return ipcErrorFrom(error)
    }
  })
}
