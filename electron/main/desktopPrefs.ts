import { app, ipcMain } from 'electron'
import { execFile } from 'child_process'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'

export type DesktopPrefs = {
  /** Arrancar ControlStock al iniciar sesión de Windows. */
  openAtLogin: boolean
  /** Al cerrar la ventana (X), minimizar a bandeja en vez de salir. */
  closeToTray: boolean
}

export type DesktopPrefsStatus = DesktopPrefs & {
  /** Si Windows tiene la app en el inicio (registro o carpeta Startup). */
  registeredAtLogin: boolean
  isPackaged: boolean
}

const DEFAULT_PREFS: DesktopPrefs = {
  openAtLogin: false,
  closeToTray: true
}

const STARTUP_BAT_NAME = 'ControlStock.bat'

function prefsPath(): string {
  const dir = join(app.getPath('userData'), 'data')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'desktop-prefs.json')
}

function startupDir(): string {
  return join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup')
}

function startupBatPath(): string {
  return join(startupDir(), STARTUP_BAT_NAME)
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

/** Detecta si este proceso se abrió por el arranque de Windows. */
export function launchedAtLogin(): boolean {
  if (process.argv.includes('--hidden') || process.argv.includes('--startup')) return true
  try {
    const settings = app.getLoginItemSettings({
      path: process.execPath,
      args: ['--hidden']
    })
    return Boolean(settings.wasOpenedAtLogin || settings.wasOpenedAsHidden)
  } catch {
    return false
  }
}

function isRegisteredAtLogin(): boolean {
  if (process.platform !== 'win32') return false
  if (existsSync(startupBatPath())) return true
  try {
    const settings = app.getLoginItemSettings({
      path: process.execPath,
      args: ['--hidden']
    })
    return Boolean(settings.openAtLogin)
  } catch {
    return false
  }
}

/**
 * Registro dual en Windows:
 * 1) setLoginItemSettings (HKCU Run)
 * 2) .bat en la carpeta Startup (más fiable en algunos PCs)
 */
function applyOpenAtLogin(enabled: boolean): void {
  if (process.platform !== 'win32') return

  // En desarrollo el path es electron.exe: no registrar.
  if (!app.isPackaged) {
    removeStartupBat()
    return
  }

  const exe = process.execPath

  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      // openAsHidden no aplica bien en Windows; usamos --hidden en args.
      path: exe,
      args: enabled ? ['--hidden'] : []
    })
  } catch {
    /* seguir con el .bat */
  }

  if (enabled) {
    writeStartupBat(exe)
  } else {
    removeStartupBat()
  }
}

function writeStartupBat(exePath: string): void {
  try {
    const dir = startupDir()
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const bat = startupBatPath()
    // start lanza el exe sin dejar la ventana de cmd abierta.
    const body = [
      '@echo off',
      `start "" "${exePath}" --hidden`,
      ''
    ].join('\r\n')
    writeFileSync(bat, body, 'utf8')
  } catch (err) {
    console.error('[ControlStock] No se pudo crear Startup bat:', err)
  }
}

function removeStartupBat(): void {
  try {
    const bat = startupBatPath()
    if (existsSync(bat)) unlinkSync(bat)
  } catch {
    /* ignore */
  }
}

export function saveDesktopPrefs(partial: Partial<DesktopPrefs>): DesktopPrefsStatus {
  const next: DesktopPrefs = {
    ...loadDesktopPrefs(),
    ...partial
  }
  writeFileSync(prefsPath(), JSON.stringify(next, null, 2), 'utf8')
  applyOpenAtLogin(next.openAtLogin)
  return getDesktopPrefsStatus()
}

export function getDesktopPrefsStatus(): DesktopPrefsStatus {
  const prefs = loadDesktopPrefs()
  return {
    ...prefs,
    registeredAtLogin: prefs.openAtLogin && isRegisteredAtLogin(),
    isPackaged: app.isPackaged
  }
}

export function syncOpenAtLoginFromPrefs(): void {
  applyOpenAtLogin(loadDesktopPrefs().openAtLogin)
}

/** Abre la carpeta Startup de Windows (para que el usuario verifique el acceso). */
function openStartupFolder(): void {
  const dir = startupDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  execFile('explorer.exe', [dir], { windowsHide: true }, () => undefined)
}

export function setupDesktopPrefsIpc(): void {
  ipcMain.handle('desktop:get-prefs', () => getDesktopPrefsStatus())
  ipcMain.handle('desktop:set-prefs', (_event, partial: Partial<DesktopPrefs>) => {
    return saveDesktopPrefs(partial ?? {})
  })
  ipcMain.handle('desktop:open-startup-folder', () => {
    openStartupFolder()
    return { ok: true as const }
  })
}
