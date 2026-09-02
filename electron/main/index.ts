import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { getAppIcon } from './icon'
import { bootstrapNetworkServer, setupNetworkIpc, shutdownNetworkServer } from './network'
import { setupMigracionIpc } from './migracion'
import { setupHelpPdfIpc } from './helpPdf'
import { setupAutoUpdater, isInstallingUpdate } from './updater'
import { setupApkDownloadIpc } from './apkDownload'

const isDev = !app.isPackaged

// GitHub CDN / redes locales a veces fallan con HTTP/2 al bajar el Setup (~100MB).
if (!isDev) {
  app.commandLine.appendSwitch('disable-http2')
}

let mainWindow: BrowserWindow | null = null
let isShuttingDown = false

async function gracefulShutdown(timeoutMs = 1200): Promise<void> {
  try {
    await Promise.race([
      shutdownNetworkServer(),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))
    ])
  } catch {
    /* ignore */
  }
}

function forceQuitSoon(): void {
  app.exit(0)
  setTimeout(() => process.exit(0), 800)
}

function quitForUpdate(): void {
  app.exit(0)
  setTimeout(() => process.exit(0), 600)
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
  setupApkDownloadIpc(() => mainWindow)
  await bootstrapNetworkServer()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform === 'darwin') return
  if (isInstallingUpdate()) {
    quitForUpdate()
    return
  }
  if (isShuttingDown) return
  isShuttingDown = true
  void gracefulShutdown().finally(() => {
    forceQuitSoon()
  })
})

app.on('before-quit', (event) => {
  // Durante update el Setup se lanza desde un script externo tras cerrar el proceso.
  if (isInstallingUpdate()) return
  if (isShuttingDown) return
  event.preventDefault()
  isShuttingDown = true
  void gracefulShutdown().finally(() => {
    forceQuitSoon()
  })
})
