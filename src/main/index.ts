import { app, BrowserWindow, dialog, Menu, shell } from 'electron'
import { join } from 'node:path'
import icon from '../../resources/icon.png?asset'
import { ChatStore } from './database/chat.store'
import { openDatabase } from './database/database'
import { EditStore } from './database/edit.store'
import { ModelProfileStore } from './database/model-profile.store'
import { RepositoryStore } from './database/repository.store'
import { registerIpcHandlers } from './ipc'
import { ElectronSecretCipher } from './security/electron-secret-cipher'
import { chatService } from './services/chat.service'
import { editService } from './services/edit.service'
import { initModelProfileService } from './services/model-profile.service'
import { repositoryService } from './services/repository.service'
import { loadEnvFiles } from './utils/env'

let mainWindow: BrowserWindow | null = null
let database: ReturnType<typeof openDatabase> | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    title: 'DevPilot',
    backgroundColor: '#15171c',
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault()
  })

  // Renderer 在存在未保存修改时会阻止卸载，这里用原生对话框确认是否放弃修改。
  mainWindow.webContents.on('will-prevent-unload', (event) => {
    if (!mainWindow) return

    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      title: '未保存的修改',
      message: '有未保存的文件修改',
      detail: '退出应用将丢失这些修改。是否仍要退出？',
      buttons: ['退出', '取消'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    })

    if (choice === 0) {
      event.preventDefault()
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null)

    const loadedEnvFiles = loadEnvFiles([join(app.getAppPath(), '.env'), join(app.getPath('userData'), '.env')])
    console.info(`[env] 已加载 ${loadedEnvFiles.length} 个配置文件`)

    const modelProfileService = initModelProfileService({
      cipher: new ElectronSecretCipher(),
    })

    try {
      database = openDatabase(app.getPath('userData'))
      repositoryService.initialize(new RepositoryStore(database))
      chatService.initialize(new ChatStore(database))
      editService.initialize(new EditStore(database))
      modelProfileService.initialize(new ModelProfileStore(database))
      console.info('[db] SQLite 已就绪')
    } catch {
      database = null
      editService.initialize(null)
      modelProfileService.initialize(null)
      console.error('[db] SQLite 初始化失败，本次运行不会持久化仓库信息')
    }

    chatService.setConfigProvider(() => modelProfileService.resolveActive())
    registerIpcHandlers()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('will-quit', () => {
    chatService.cancelAll()
    database?.close()
    database = null
  })
}
