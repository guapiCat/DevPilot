import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/constants/app'
import { modelProfileIdInputSchema, modelProfileInputSchema, testModelProfileInputSchema } from '@shared/schemas/model'
import { testAdapterConnection } from '../ai/connection-test'
import { chatService } from '../services/chat.service'
import { getModelProfileService } from '../services/model-profile.service'
import { ipcErrorFrom } from '../utils/ipc-error'
import { ipcFail, ipcOk } from '../utils/ipc-result'

function validationMessage(error: { issues: Array<{ message: string }> }): string {
  return error.issues[0]?.message ?? '模型配置参数不合法'
}

export function registerSettingsIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.settingsGetAiConfig, () => {
    try {
      return ipcOk(getModelProfileService().getStatus())
    } catch (error) {
      return ipcErrorFrom(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.settingsTestConnection, async () => {
    try {
      return ipcOk(await chatService.testConnection())
    } catch (error) {
      return ipcErrorFrom(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.settingsSaveModelProfile, (_event, input: unknown) => {
    const parsed = modelProfileInputSchema.safeParse(input)
    if (!parsed.success) return ipcFail('VALIDATION_ERROR', validationMessage(parsed.error))

    try {
      return ipcOk(getModelProfileService().save(parsed.data))
    } catch (error) {
      return ipcErrorFrom(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.settingsDeleteModelProfile, (_event, input: unknown) => {
    const parsed = modelProfileIdInputSchema.safeParse(input)
    if (!parsed.success) return ipcFail('VALIDATION_ERROR', validationMessage(parsed.error))

    try {
      return ipcOk(getModelProfileService().remove(parsed.data.profileId))
    } catch (error) {
      return ipcErrorFrom(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.settingsActivateModelProfile, (_event, input: unknown) => {
    const parsed = modelProfileIdInputSchema.safeParse(input)
    if (!parsed.success) return ipcFail('VALIDATION_ERROR', validationMessage(parsed.error))

    try {
      return ipcOk(getModelProfileService().activate(parsed.data.profileId))
    } catch (error) {
      return ipcErrorFrom(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.settingsTestModelProfile, async (_event, input: unknown) => {
    const parsed = testModelProfileInputSchema.safeParse(input)
    if (!parsed.success) return ipcFail('VALIDATION_ERROR', validationMessage(parsed.error))

    try {
      const config = getModelProfileService().resolveDraft(parsed.data)
      return ipcOk(await testAdapterConnection(config))
    } catch (error) {
      return ipcErrorFrom(error)
    }
  })
}
