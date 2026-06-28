import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { bootstrapNetworkServer, setupNetworkIpc, shutdownNetworkServer } from './network'
import { setupAutoUpdater } from './updater'

const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null

function appIconPath(): string {
  if (isDev) {
    return join(app.getAppPath(), 'build', 'icon.png')
  }
  return join(process.resourcesPath, 'icons', 'icon.png')
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    title: 'ControlStock',
    icon: appIconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.jrncarrizo.bodegastock')
  }

  setupNetworkIpc()
  setupAutoUpdater(() => mainWindow)
  await bootstrapNetworkServer()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  void shutdownNetworkServer()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  void shutdownNetworkServer()
})
