import { App } from '@capacitor/app'
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Preferences } from '@capacitor/preferences'
import { ApkInstaller } from '@/plugins/apkInstaller'
import {
  fetchLatestReleaseVersion,
  latestApkDownloadUrl,
  normalizeReleaseVersion
} from '@/lib/githubLatestRelease'

const APK_FILENAME = 'ControlStock-update.apk'
const COOLDOWN_KEY = 'controlstock.apkUpdateCooldown'
/** Evita doble clic seguido. */
const CHECK_DEBOUNCE_MS = 45 * 1000

export type ApkUpdateInfo = {
  version: string
  downloadUrl: string
  releaseNotes?: string
  size?: number
}

type CooldownState = {
  lastCheckAt: number
}

function normalizeVersion(v: string): string {
  return normalizeReleaseVersion(v)
}

function minutesLeft(ms: number): number {
  return Math.max(1, Math.ceil(ms / 60_000))
}

async function readCooldown(): Promise<CooldownState> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { value } = await Preferences.get({ key: COOLDOWN_KEY })
      if (value) {
        const parsed = JSON.parse(value) as Partial<CooldownState>
        return {
          lastCheckAt: typeof parsed.lastCheckAt === 'number' ? parsed.lastCheckAt : 0
        }
      }
    } else {
      const raw = localStorage.getItem(COOLDOWN_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<CooldownState>
        return {
          lastCheckAt: typeof parsed.lastCheckAt === 'number' ? parsed.lastCheckAt : 0
        }
      }
    }
  } catch {
    /* ignore */
  }
  return { lastCheckAt: 0 }
}

async function writeCooldown(state: CooldownState): Promise<void> {
  const json = JSON.stringify(state)
  try {
    if (Capacitor.isNativePlatform()) {
      await Preferences.set({ key: COOLDOWN_KEY, value: json })
    }
    localStorage.setItem(COOLDOWN_KEY, json)
  } catch {
    /* ignore */
  }
}

function remainingMs(state: CooldownState, now = Date.now()): number {
  return Math.max(0, state.lastCheckAt + CHECK_DEBOUNCE_MS - now)
}

/** Compara semver simple a.b.c. >0 si a>b. */
export function compareSemver(a: string, b: string): number {
  const pa = normalizeVersion(a).split(/[.+-]/).map((x) => Number.parseInt(x, 10) || 0)
  const pb = normalizeVersion(b).split(/[.+-]/).map((x) => Number.parseInt(x, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

export async function getNativeAppVersion(): Promise<string> {
  const info = await App.getInfo()
  return normalizeVersion(info.version)
}

export async function checkLatestApkRelease(): Promise<{
  currentVersion: string
  latest: ApkUpdateInfo | null
  updateAvailable: boolean
}> {
  const state = await readCooldown()
  const wait = remainingMs(state)
  if (wait > 0) {
    throw new Error(`Esperá ~${minutesLeft(wait)} min antes de volver a buscar.`)
  }

  const currentVersion = await getNativeAppVersion()
  const now = Date.now()
  await writeCooldown({ lastCheckAt: now })

  let version: string
  try {
    version = normalizeVersion(
      await fetchLatestReleaseVersion(async (url) => {
        const res = await CapacitorHttp.get({
          url,
          headers: {
            Accept: 'text/plain',
            'User-Agent': 'ControlStock-Android'
          }
        })
        if (res.status < 200 || res.status >= 300) {
          throw new Error(`No se pudo leer latest.yml (HTTP ${res.status}).`)
        }
        return typeof res.data === 'string' ? res.data : String(res.data ?? '')
      })
    )
  } catch (err) {
    throw err instanceof Error ? err : new Error('No se pudo consultar el release')
  }

  const downloadUrl = latestApkDownloadUrl(version)

  const latest: ApkUpdateInfo = {
    version,
    downloadUrl,
    releaseNotes: undefined
  }

  return {
    currentVersion,
    latest,
    updateAvailable: compareSemver(version, currentVersion) > 0
  }
}

/**
 * Descarga el APK a la caché de la app y devuelve una URI usable por el instalador.
 */
export async function downloadApkToCache(downloadUrl: string): Promise<string> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('La descarga de APK solo está disponible en Android.')
  }

  const res = await CapacitorHttp.get({
    url: downloadUrl,
    headers: {
      Accept: 'application/octet-stream',
      'User-Agent': 'ControlStock-Android'
    },
    responseType: 'blob'
  })

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Falló la descarga del APK (HTTP ${res.status}).`)
  }

  const data = typeof res.data === 'string' ? res.data : ''
  if (!data) throw new Error('La descarga del APK vino vacía.')

  await Filesystem.writeFile({
    path: APK_FILENAME,
    data,
    directory: Directory.Cache
  })

  const { uri } = await Filesystem.getUri({
    path: APK_FILENAME,
    directory: Directory.Cache
  })

  return uri
}

export async function installDownloadedApk(pathOrUri: string): Promise<void> {
  const allowed = await ApkInstaller.canRequestPackageInstalls()
  if (!allowed.value) {
    await ApkInstaller.openInstallSettings()
    throw new Error(
      'Activá el permiso “Instalar apps desconocidas” para ControlStock y volvé a tocar Instalar.'
    )
  }
  await ApkInstaller.install({ path: pathOrUri })
}
