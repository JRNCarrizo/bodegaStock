import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { createWriteStream, existsSync, readFileSync, writeFileSync } from 'fs'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { basename, join } from 'path'
import {
  fetchLatestReleaseVersion,
  latestApkDownloadUrl,
  normalizeReleaseVersion
} from '@/lib/githubLatestRelease'

const CHECK_DEBOUNCE_MS = 20 * 1000

type CooldownState = {
  lastCheckAt: number
}

function waitLabel(ms: number): string {
  const secs = Math.max(1, Math.ceil(ms / 1000))
  if (secs < 60) return `~${secs} s`
  return `~${Math.ceil(secs / 60)} min`
}

function cooldownPath(): string {
  return join(app.getPath('userData'), 'apk-download-cooldown.json')
}

function readCooldown(): CooldownState {
  try {
    if (!existsSync(cooldownPath())) return { lastCheckAt: 0 }
    const parsed = JSON.parse(readFileSync(cooldownPath(), 'utf8')) as Partial<CooldownState>
    return {
      lastCheckAt: typeof parsed.lastCheckAt === 'number' ? parsed.lastCheckAt : 0
    }
  } catch {
    return { lastCheckAt: 0 }
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
  return Math.max(0, state.lastCheckAt + CHECK_DEBOUNCE_MS - now)
}

async function fetchLatestApk(force = false): Promise<{
  version: string
  url: string
  filename: string
}> {
  const state = readCooldown()
  const wait = force ? 0 : remainingMs(state)
  if (wait > 0) {
    throw new Error(`Esperá ${waitLabel(wait)} antes de volver a descargar el APK.`)
  }

  const now = Date.now()
  writeCooldown({ lastCheckAt: now })

  const version = normalizeReleaseVersion(await fetchLatestReleaseVersion())
  const url = latestApkDownloadUrl(version)
  const filename = `ControlStock-${version}.apk`

  return { version, url, filename }
}

export function setupApkDownloadIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('apk:download-latest', async (_event, payload?: { force?: boolean }) => {
    const win = getWindow()
    try {
      const latest = await fetchLatestApk(Boolean(payload?.force))

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
