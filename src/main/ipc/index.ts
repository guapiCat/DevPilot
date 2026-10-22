import { registerAppIpcHandlers } from './app.ipc'
import { registerSettingsIpcHandlers } from './settings.ipc'

export function registerIpcHandlers(): void {
  registerAppIpcHandlers()
  registerSettingsIpcHandlers()
}
