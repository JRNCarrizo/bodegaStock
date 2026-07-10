import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { getAppIcon } from './icon'
import { bootstrapNetworkServer, setupNetworkIpc, shutdownNetworkServer } from './network'
import { setupAutoUpdater } from './updater'

const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const icon = getAppIcon()

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    title: 'ControlStock',
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (!icon.isEmpty()) {
    mainWindow.setIcon(icon)
  }

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
