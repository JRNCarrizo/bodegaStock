import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { createWriteStream, existsSync, readFileSync, writeFileSync } from 'fs'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { basename, join } from 'path'

const GITHUB_OWNER = 'JRNCarrizo'
const GITHUB_REPO = 'bodegaStock'
const CHECK_COOLDOWN_MS = 5 * 60 * 1000
const RATE_LIMIT_COOLDOWN_MS = 30 * 60 * 1000

type GhAsset = {
  name?: string
  browser_download_url?: string
  size?: number
}

type GhRelease = {
  tag_name?: string
  name?: string
  assets?: GhAsset[]
}

type CooldownState = {
  lastCheckAt: number
  blockedUntil: number
}

function normalizeVersion(v: string): string {
  return v.trim().replace(/^v/i, '')
}

function minutesLeft(ms: number): number {
  return Math.max(1, Math.ceil(ms / 60_000))
}

function cooldownPath(): string {
  return join(app.getPath('userData'), 'apk-download-cooldown.json')
}

function readCooldown(): CooldownState {
  try {
    if (!existsSync(cooldownPath())) return { lastCheckAt: 0, blockedUntil: 0 }
    const parsed = JSON.parse(readFileSync(cooldownPath(), 'utf8')) as Partial<CooldownState>
    return {
      lastCheckAt: typeof parsed.lastCheckAt === 'number' ? parsed.lastCheckAt : 0,
      blockedUntil: typeof parsed.blockedUntil === 'number' ? parsed.blockedUntil : 0
    }
  } catch {
    return { lastCheckAt: 0, blockedUntil: 0 }
  }
}

function writeCooldown(state: CooldownState): void {
  try {
    writeFileSync(cooldownPath(), JSON.stringify(state), 'utf8')
  } catch {
    /* ignore */
  }
}

function remainingMs(state: CooldownState, now = Date.now()): number {
  const until = Math.max(state.lastCheckAt + CHECK_COOLDOWN_MS, state.blockedUntil)
  return Math.max(0, until - now)
}

async function fetchLatestApk(): Promise<{
  version: string
  url: string
  filename: string
  size?: number
}> {
  const state = readCooldown()
  const wait = remainingMs(state)
  if (wait > 0) {
    const rateLimited = state.blockedUntil > Date.now()
    throw new Error(
      rateLimited
        ? `GitHub limitó las consultas. Esperá ~${minutesLeft(wait)} min.`
        : `Esperá ~${minutesLeft(wait)} min antes de volver a descargar el APK.`
    )
  }

  const now = Date.now()
  writeCooldown({ ...state, lastCheckAt: now })

  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'ControlStock-Desktop'
      }
    }
  )

  if (!res.ok) {
    if (res.status === 403 || res.status === 429) {
      writeCooldown({
        lastCheckAt: now,
        blockedUntil: now + RATE_LIMIT_COOLDOWN_MS
      })
      throw new Error(
        `GitHub limitó las consultas. Esperá ~${minutesLeft(RATE_LIMIT_COOLDOWN_MS)} min.`
      )
    }
    throw new Error(`No se pudo consultar releases (HTTP ${res.status}).`)
  }

  const body = (await res.json()) as GhRelease
  const version = normalizeVersion(String(body.tag_name ?? body.name ?? ''))
  if (!version) throw new Error('El release no tiene versión válida')

  const apk = (body.assets ?? []).find((a) =>
    String(a.name ?? '')
      .toLowerCase()
      .endsWith('.apk')
  )
  if (!apk?.browser_download_url) {
    throw new Error('El último release no incluye un APK.')
  }

  const filename =
    apk.name && apk.name.toLowerCase().endsWith('.apk')
      ? apk.name
      : `ControlStock-${version}.apk`

  return {
    version,
    url: apk.browser_download_url,
    filename,
    size: typeof apk.size === 'number' ? apk.size : undefined
  }
}

export function setupApkDownloadIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('apk:download-latest', async () => {
    const win = getWindow()
    try {
      const latest = await fetchLatestApk()

      const result = await dialog.showSaveDialog(win ?? undefined, {
        title: 'Guardar APK para celulares',
        defaultPath: latest.filename,
        filters: [{ name: 'Android APK', extensions: ['apk'] }]
      })

      if (result.canceled || !result.filePath) {
        return { ok: false as const, cancelled: true as const }
      }

      const savePath = result.filePath.endsWith('.apk')
        ? result.filePath
        : `${result.filePath}.apk`

      const downloadRes = await fetch(latest.url, {
        headers: {
          Accept: 'application/octet-stream',
          'User-Agent': 'ControlStock-Desktop'
        },
        redirect: 'follow'
      })

      if (!downloadRes.ok || !downloadRes.body) {
        throw new Error(`Falló la descarga del APK (HTTP ${downloadRes.status}).`)
      }

      const nodeStream = Readable.fromWeb(
        downloadRes.body as import('stream/web').ReadableStream
      )
      await pipeline(nodeStream, createWriteStream(savePath))

      return {
        ok: true as const,
        version: latest.version,
        path: savePath,
        filename: basename(savePath)
      }
    } catch (err) {
      return {
        ok: false as const,
        message: err instanceof Error ? err.message : 'No se pudo descargar el APK'
      }
    }
  })
}
