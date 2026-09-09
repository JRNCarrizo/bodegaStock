import { app, ipcMain } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export type DesktopPrefs = {
  /** Arrancar ControlStock al iniciar sesión de Windows. */
  openAtLogin: boolean
  /** Al cerrar la ventana (X), minimizar a bandeja en vez de salir. */
  closeToTray: boolean
}

const DEFAULT_PREFS: DesktopPrefs = {
  openAtLogin: false,
  closeToTray: true
}

function prefsPath(): string {
  const dir = join(app.getPath('userData'), 'data')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'desktop-prefs.json')
}

export function loadDesktopPrefs(): DesktopPrefs {
  try {
    const raw = JSON.parse(readFileSync(prefsPath(), 'utf8')) as Partial<DesktopPrefs>
    return {
      openAtLogin: Boolean(raw.openAtLogin),
      closeToTray: raw.closeToTray === undefined ? true : Boolean(raw.closeToTray)
    }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function saveDesktopPrefs(partial: Partial<DesktopPrefs>): DesktopPrefs {
  const next: DesktopPrefs = {
    ...loadDesktopPrefs(),
    ...partial
  }
  writeFileSync(prefsPath(), JSON.stringify(next, null, 2), 'utf8')
  applyOpenAtLogin(next.openAtLogin)
  return next
}

/** Detecta si este proceso se abrió por el arranque de Windows. */
export function launchedAtLogin(): boolean {
  if (process.argv.includes('--hidden') || process.argv.includes('--startup')) return true
  try {
    // Electron en Windows a veces marca el launch settings.
    const settings = app.getLoginItemSettings()
    return Boolean(settings.wasOpenedAtLogin || settings.wasOpenedAsHidden)
  } catch {
    return false
  }
}

export function applyOpenAtLogin(enabled: boolean): void {
  if (process.platform !== 'win32') return
  // Solo en app instalada: en dev el path de electron.exe no sirve para producción.
  if (!app.isPackaged) return

  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: true,
    path: process.execPath,
    args: enabled ? ['--hidden'] : []
  })
}

export function syncOpenAtLoginFromPrefs(): void {
  applyOpenAtLogin(loadDesktopPrefs().openAtLogin)
}

export function setupDesktopPrefsIpc(): void {
  ipcMain.handle('desktop:get-prefs', () => loadDesktopPrefs())
  ipcMain.handle('desktop:set-prefs', (_event, partial: Partial<DesktopPrefs>) => {
    return saveDesktopPrefs(partial ?? {})
  })
}
