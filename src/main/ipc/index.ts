import { registerAppIpcHandlers } from './app.ipc'
import { registerFileIpcHandlers } from './file.ipc'
import { registerRepositoryIpcHandlers } from './repository.ipc'
import { registerSettingsIpcHandlers } from './settings.ipc'

export function registerIpcHandlers(): void {
  registerAppIpcHandlers()
  registerSettingsIpcHandlers()
  registerRepositoryIpcHandlers()
  registerFileIpcHandlers()
}
