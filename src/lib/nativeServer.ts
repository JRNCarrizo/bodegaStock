import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

/** Clave de Preferences / localStorage para la URL del PC servidor o nube. */
export const SERVER_URL_KEY = 'bodega_server_url'
export const CONNECTION_MODE_KEY = 'bodega_connection_mode'

export type ConnectionMode = 'local' | 'cloud'

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform()
}

/** Normaliza host/IP/URL sin barra final. HTTPS no fuerza :3847. */
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

  const protocol = url.protocol === 'https:' ? 'https:' : 'http:'
  if (protocol === 'https:') {
    return url.port ? `${protocol}//${url.hostname}:${url.port}` : `${protocol}//${url.hostname}`
  }

  const port = url.port || String(defaultPort)
  return `${protocol}//${url.hostname}:${port}`
}

export async function loadConnectionMode(): Promise<ConnectionMode> {
  if (isNativeApp()) {
    const { value } = await Preferences.get({ key: CONNECTION_MODE_KEY })
    if (value === 'cloud' || value === 'local') return value
  }

  const fromLs = localStorage.getItem(CONNECTION_MODE_KEY)
  if (fromLs === 'cloud' || fromLs === 'local') return fromLs

  const saved = await loadSavedServerUrl()
  if (saved?.startsWith('https://')) return 'cloud'
  return 'local'
}

export async function saveConnectionMode(mode: ConnectionMode): Promise<void> {
  if (isNativeApp()) {
    await Preferences.set({ key: CONNECTION_MODE_KEY, value: mode })
  }
  localStorage.setItem(CONNECTION_MODE_KEY, mode)
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
  const timer = setTimeout(() => controller.abort(), 10000)

  try {
    const res = await fetch(`${base}/api/health`, { signal: controller.signal })
    if (!res.ok) {
      return { ok: false, message: `El servidor respondió con error (${res.status})` }
    }
    const data = (await res.json().catch(() => ({}))) as { version?: string; ok?: boolean }
    return { ok: true, version: data.version }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return {
        ok: false,
        message: base.startsWith('https://')
          ? 'Tiempo agotado. Verificá la URL de Railway y tu conexión a internet.'
          : 'Tiempo agotado. Verificá IP, WiFi y que el PC esté en modo servidor.',
      }
    }
    return {
      ok: false,
      message: base.startsWith('https://')
        ? 'No se pudo conectar a la nube. Revisá la URL (https://….up.railway.app).'
        : 'No se pudo conectar. Misma WiFi, PC en modo servidor y puerto 3847 abierto.',
    }
  } finally {
    clearTimeout(timer)
  }
}
