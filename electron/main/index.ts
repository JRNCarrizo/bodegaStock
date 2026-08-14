import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { getAppIcon } from './icon'
import { bootstrapNetworkServer, setupNetworkIpc, shutdownNetworkServer } from './network'
import { setupMigracionIpc } from './migracion'
import { setupHelpPdfIpc } from './helpPdf'
import { setupAutoUpdater } from './updater'

const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null
let isShuttingDown = false

async function gracefulShutdown(timeoutMs = 2500): Promise<void> {
  try {
    await Promise.race([
      shutdownNetworkServer(),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))
    ])
  } catch {
    /* ignore */
  }
}

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
  setupMigracionIpc()
  setupHelpPdfIpc()
  setupAutoUpdater(() => mainWindow)
  await bootstrapNetworkServer()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform === 'darwin') return
  if (isShuttingDown) return
  isShuttingDown = true
  void gracefulShutdown().finally(() => {
    app.exit(0)
  })
})

app.on('before-quit', (event) => {
  if (isShuttingDown) return
  event.preventDefault()
  isShuttingDown = true
  void gracefulShutdown().finally(() => {
    app.exit(0)
  })
})
