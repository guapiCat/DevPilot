import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/constants/app'
import { chatService } from '../services/chat.service'
import { readAiConfigStatus } from '../services/settings.service'
import { ipcErrorFrom } from '../utils/ipc-error'
import { ipcOk } from '../utils/ipc-result'

export function registerSettingsIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.settingsGetAiConfig, () => ipcOk(readAiConfigStatus(process.env)))

  ipcMain.handle(IPC_CHANNELS.settingsTestConnection, async () => {
    try {
      return ipcOk(await chatService.testConnection())
    } catch (error) {
      return ipcErrorFrom(error)
    }
  })
}
