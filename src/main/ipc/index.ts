import { registerAppIpcHandlers } from './app.ipc'
import { registerChatIpcHandlers } from './chat.ipc'
import { registerFileIpcHandlers } from './file.ipc'
import { registerGitIpcHandlers } from './git.ipc'
import { registerRepositoryIpcHandlers } from './repository.ipc'
import { registerSettingsIpcHandlers } from './settings.ipc'

export function registerIpcHandlers(): void {
  registerAppIpcHandlers()
  registerSettingsIpcHandlers()
  registerRepositoryIpcHandlers()
  registerFileIpcHandlers()
  registerGitIpcHandlers()
  registerChatIpcHandlers()
}
