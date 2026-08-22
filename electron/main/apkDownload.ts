import { BrowserWindow, dialog, ipcMain } from 'electron'
import { createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { basename } from 'path'

const GITHUB_OWNER = 'JRNCarrizo'
const GITHUB_REPO = 'bodegaStock'

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

function normalizeVersion(v: string): string {
  return v.trim().replace(/^v/i, '')
}

async function fetchLatestApk(): Promise<{
  version: string
  url: string
  filename: string
  size?: number
}> {
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
      throw new Error('GitHub limitó las consultas. Probá en unos minutos.')
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
