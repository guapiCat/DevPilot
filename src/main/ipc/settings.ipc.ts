import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/constants/app'
import { readAiConfigStatus } from '../services/settings.service'
import { ipcOk } from '../utils/ipc-result'

export function registerSettingsIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.settingsGetAiConfig, () => ipcOk(readAiConfigStatus(process.env)))
}
