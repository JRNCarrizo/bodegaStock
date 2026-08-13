import { existsSync, mkdirSync, readFileSync } from 'fs'
import { join } from 'path'

/**
 * Directorio de datos de la app.
 * - Electron: userData
 * - Cloud / standalone: BODEGA_DATA_DIR o ./data
 */
export function getUserDataDir(): string {
  const fromEnv = process.env.BODEGA_DATA_DIR?.trim()
  if (fromEnv) {
    if (!existsSync(fromEnv)) mkdirSync(fromEnv, { recursive: true })
    return fromEnv
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron') as typeof import('electron')
    if (electron?.app?.getPath) {
      return electron.app.getPath('userData')
    }
  } catch {
    // API standalone (sin Electron)
  }

  const fallback = join(process.cwd(), 'data')
  if (!existsSync(fallback)) mkdirSync(fallback, { recursive: true })
  return fallback
}

export function getAppVersion(): string {
  if (process.env.npm_package_version?.trim()) {
    return process.env.npm_package_version.trim()
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron') as typeof import('electron')
    if (electron?.app?.getVersion) {
      return electron.app.getVersion()
    }
  } catch {
    // ignore
  }

  try {
    const pkgPath = join(__dirname, '..', 'package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string }
    if (pkg.version) return pkg.version
  } catch {
    // ignore
  }

  return '0.0.0'
}

export function getJwtSecret(): string {
  const fromEnv = process.env.JWT_SECRET?.trim()
  if (fromEnv) return fromEnv
  if (process.env.NODE_ENV === 'production' && process.env.BODEGA_REQUIRE_JWT_SECRET === '1') {
    throw new Error('JWT_SECRET es obligatorio en producción')
  }
  return 'bodegastock-dev-secret-change-in-production'
}
