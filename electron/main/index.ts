import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { getAppIcon } from './icon'
import { bootstrapNetworkServer, setupNetworkIpc, shutdownNetworkServer } from './network'
import { setupMigracionIpc } from './migracion'
import { setupHelpPdfIpc } from './helpPdf'
import { setupAutoUpdater, isInstallingUpdate } from './updater'
import { setupApkDownloadIpc } from './apkDownload'
import {
  launchedAtLogin,
  loadDesktopPrefs,
  setupDesktopPrefsIpc,
  syncOpenAtLoginFromPrefs
} from './desktopPrefs'
import { destroyTray, ensureTray } from './tray'

const isDev = !app.isPackaged

// GitHub CDN / redes locales a veces fallan con HTTP/2 al bajar el Setup (~100MB).
if (!isDev) {
  app.commandLine.appendSwitch('disable-http2')
}

let mainWindow: BrowserWindow | null = null
let isShuttingDown = false
/** true = el usuario eligió Salir (bandeja) o update; no ocultar a bandeja. */
let allowQuit = false

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
  destroyTray()
  app.exit(0)
  setTimeout(() => process.exit(0), 800)
}

function quitForUpdate(): void {
  allowQuit = true
  destroyTray()
  app.exit(0)
  setTimeout(() => process.exit(0), 600)
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow({ show: true })
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function hideToTray(): void {
  ensureTray({
    getWindow: () => mainWindow,
    showWindow: showMainWindow,
    quitApp: requestQuit
  })
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide()
  }
}

function requestQuit(): void {
  if (isShuttingDown) return
  allowQuit = true
  isShuttingDown = true
  void gracefulShutdown().finally(() => {
    forceQuitSoon()
  })
}

function createWindow(opts?: { show?: boolean }): void {
  const icon = getAppIcon()
  const startHidden = opts?.show === false

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
    if (startHidden) {
      hideToTray()
      return
    }
    mainWindow?.show()
  })

  mainWindow.on('close', (event) => {
    if (allowQuit || isInstallingUpdate() || isShuttingDown) return
    const prefs = loadDesktopPrefs()
    if (prefs.closeToTray) {
      event.preventDefault()
      hideToTray()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    if (!startHidden) {
      mainWindow.webContents.openDevTools({ mode: 'detach' })
    }
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showMainWindow()
  })

  app.whenReady().then(async () => {
    setupNetworkIpc()
    setupMigracionIpc()
    setupHelpPdfIpc()
    setupDesktopPrefsIpc()
    syncOpenAtLoginFromPrefs()
    setupAutoUpdater(() => mainWindow)
    setupApkDownloadIpc(() => mainWindow)
    await bootstrapNetworkServer()

    const startHidden = launchedAtLogin() && loadDesktopPrefs().openAtLogin
    createWindow({ show: !startHidden })

    // Bandeja siempre disponible en escritorio para reabrir / salir limpio.
    ensureTray({
      getWindow: () => mainWindow,
      showWindow: showMainWindow,
      quitApp: requestQuit
    })

    app.on('activate', () => {
      showMainWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform === 'darwin') return
    if (isInstallingUpdate()) {
      quitForUpdate()
      return
    }
    // Si closeToTray, la ventana se oculta con preventDefault y no debería llegar acá.
    // Si llega (p. ej. closeToTray off), salir de verdad.
    requestQuit()
  })

  app.on('before-quit', (event) => {
    // Update / Salir desde bandeja / apagado de Windows: apagar API limpio.
    if (isInstallingUpdate()) return
    if (isShuttingDown) return
    event.preventDefault()
    allowQuit = true
    isShuttingDown = true
    void gracefulShutdown().finally(() => {
      forceQuitSoon()
    })
  })
}
