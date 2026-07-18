import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

/** Clave de Preferences / localStorage para la URL del PC servidor. */
export const SERVER_URL_KEY = 'bodega_server_url'

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform()
}

/** Normaliza host/IP/URL a `http://host:port` sin barra final. */
export function normalizeServerUrl(raw: string, defaultPort = 3847): string {
  const value = raw.trim()
  if (!value) throw new Error('Ingresá la IP o URL del servidor')

  let url: URL
  try {
    url = value.includes('://') ? new URL(value) : new URL(`http://${value}`)
  } catch {
    throw new Error('URL o IP inválida')
  }

  if (!url.hostname) throw new Error('URL o IP inválida')

  const port = url.port || String(defaultPort)
  const protocol = url.protocol === 'https:' ? 'https:' : 'http:'
  return `${protocol}//${url.hostname}:${port}`
}

export async function loadSavedServerUrl(): Promise<string | null> {
  if (isNativeApp()) {
    const { value } = await Preferences.get({ key: SERVER_URL_KEY })
    if (value?.trim()) return value.trim().replace(/\/$/, '')
  }

  const fromLs = localStorage.getItem(SERVER_URL_KEY)
  if (fromLs?.trim()) return fromLs.trim().replace(/\/$/, '')
  return null
}

export async function saveServerUrl(url: string): Promise<string> {
  const normalized = normalizeServerUrl(url)
  if (isNativeApp()) {
    await Preferences.set({ key: SERVER_URL_KEY, value: normalized })
  }
  localStorage.setItem(SERVER_URL_KEY, normalized)
  return normalized
}

export async function clearServerUrl(): Promise<void> {
  if (isNativeApp()) {
    await Preferences.remove({ key: SERVER_URL_KEY })
  }
  localStorage.removeItem(SERVER_URL_KEY)
}

/** Prueba GET /api/health contra la URL base. */
export async function testServerConnection(
  rawUrl: string
): Promise<{ ok: true; version?: string } | { ok: false; message: string }> {
  let base: string
  try {
    base = normalizeServerUrl(rawUrl)
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'URL inválida' }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)

  try {
    const res = await fetch(`${base}/api/health`, { signal: controller.signal })
    if (!res.ok) {
      return { ok: false, message: `El servidor respondió con error (${res.status})` }
    }
    const data = (await res.json().catch(() => ({}))) as { version?: string; ok?: boolean }
    return { ok: true, version: data.version }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return { ok: false, message: 'Tiempo agotado. Verificá IP, WiFi y que el PC esté en modo servidor.' }
    }
    return {
      ok: false,
      message: 'No se pudo conectar. Misma WiFi, PC en modo servidor y puerto 3847 abierto.'
    }
  } finally {
    clearTimeout(timer)
  }
}
