import { app, ipcMain } from 'electron'
import { APP_NAME, IPC_CHANNELS } from '@shared/constants/app'
import { pingInputSchema } from '@shared/schemas/ipc'
import { buildAppInfo, createPingResponse } from '../services/app.service'
import { ipcFail, ipcOk } from '../utils/ipc-result'

export function registerAppIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.appGetInfo, () =>
    ipcOk(
      buildAppInfo({
        name: APP_NAME,
        version: app.getVersion(),
        platform: process.platform,
        electronVersion: process.versions.electron ?? 'unknown',
        chromeVersion: process.versions.chrome ?? 'unknown',
        nodeVersion: process.versions.node,
        userDataPath: app.getPath('userData')
      })
    )
  )

  ipcMain.handle(IPC_CHANNELS.appPing, (_event, input: unknown) => {
    const parsed = pingInputSchema.safeParse(input)

    if (!parsed.success) {
      return ipcFail('VALIDATION_ERROR', '消息参数不合法')
    }

    return ipcOk(createPingResponse(parsed.data.message))
  })
}
