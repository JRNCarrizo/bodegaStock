import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'

export type UpdateStatusPayload =
  | { type: 'checking' }
  | { type: 'available'; version: string; releaseNotes?: string }
  | { type: 'not-available'; version: string }
  | { type: 'download-progress'; percent: number; transferred: number; total: number }
  | { type: 'downloaded'; version: string }
  | { type: 'error'; message: string }

function sendStatus(win: BrowserWindow, status: UpdateStatusPayload) {
  if (!win.isDestroyed()) {
    win.webContents.send('update-status', status)
  }
}

let handlersRegistered = false

export function setupAutoUpdater(getWindow: () => BrowserWindow | null) {
  if (handlersRegistered) return
  handlersRegistered = true

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    const win = getWindow()
    if (win) sendStatus(win, { type: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    const win = getWindow()
    if (!win) return
    const notes =
      typeof info.releaseNotes === 'string'
        ? info.releaseNotes
        : Array.isArray(info.releaseNotes)
          ? info.releaseNotes.map((n) => (typeof n === 'string' ? n : n.note)).join('\n')
          : undefined
    sendStatus(win, { type: 'available', version: info.version, releaseNotes: notes })
  })

  autoUpdater.on('update-not-available', (info) => {
    const win = getWindow()
    if (win) sendStatus(win, { type: 'not-available', version: info.version })
  })

  autoUpdater.on('download-progress', (progress) => {
    const win = getWindow()
    if (win) {
      sendStatus(win, {
        type: 'download-progress',
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total
      })
    }
  })

  autoUpdater.on('update-downloaded', (info) => {
    const win = getWindow()
    if (win) sendStatus(win, { type: 'downloaded', version: info.version })
  })

  autoUpdater.on('error', (err) => {
    const win = getWindow()
    if (win) sendStatus(win, { type: 'error', message: err.message })
  })

  ipcMain.handle('app:get-info', () => ({
    version: app.getVersion(),
    name: app.getName(),
    isPackaged: app.isPackaged,
    platform: process.platform
  }))

  ipcMain.handle('update:check', async () => {
    if (!app.isPackaged) {
      return { ok: false as const, reason: 'dev' as const }
    }
    try {
      const result = await autoUpdater.checkForUpdates()
      return { ok: true as const, updateInfo: result?.updateInfo?.version }
    } catch (err) {
      return {
        ok: false as const,
        reason: 'error' as const,
        message: err instanceof Error ? err.message : String(err)
      }
    }
  })

  ipcMain.handle('update:download', async () => {
    if (!app.isPackaged) {
      return { ok: false as const, reason: 'dev' as const }
    }
    try {
      await autoUpdater.downloadUpdate()
      return { ok: true as const }
    } catch (err) {
      return {
        ok: false as const,
        message: err instanceof Error ? err.message : String(err)
      }
    }
  })

  ipcMain.handle('update:install', () => {
    if (!app.isPackaged) {
      return { ok: false as const, reason: 'dev' as const }
    }
    autoUpdater.quitAndInstall()
    return { ok: true as const }
  })
}
