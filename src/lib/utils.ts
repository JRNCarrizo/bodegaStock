import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { isNativeApp, loadSavedServerUrl } from '@/lib/nativeServer'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

const DEFAULT_API_URL = 'http://127.0.0.1:3847'

let apiUrl = DEFAULT_API_URL

export function getApiUrl(): string {
  return apiUrl
}

export function setApiUrl(url: string): void {
  apiUrl = url.replace(/\/$/, '')
}

export async function initApiFromBridge(): Promise<void> {
  if (window.bodegaStock?.getNetworkInfo) {
    const info = await window.bodegaStock.getNetworkInfo()
    setApiUrl(info.apiUrl)
    return
  }

  // APK / iOS (Capacitor): URL del PC servidor guardada en el dispositivo
  if (isNativeApp()) {
    const saved = await loadSavedServerUrl()
    if (saved) setApiUrl(saved)
    return
  }

  // Navegador / celular: misma PC y puerto que sirven la UI (API + web en :3847)
  if (typeof window !== 'undefined' && window.location?.origin) {
    const { protocol, hostname, port } = window.location
    if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
      // Vite en :5173 → API en :3847; UI empaquetada ya viene en :3847
      if (port === '5173' || port === '4173') {
        setApiUrl(`${protocol}//${hostname}:3847`)
      } else {
        setApiUrl(window.location.origin)
      }
    }
  }
}

export async function api<T>(
  path: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  const { timeoutMs = 12000, ...fetchOptions } = options
  const token = localStorage.getItem('token')
  const headers: Record<string, string> = {
    ...((fetchOptions.headers as Record<string, string> | undefined) ?? {})
  }

  const hasBody = fetchOptions.body !== undefined && fetchOptions.body !== null && fetchOptions.body !== ''
  if (hasBody && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const controller = new AbortController()
  const externalSignal = fetchOptions.signal
  const onExternalAbort = () => controller.abort()
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort()
    else externalSignal.addEventListener('abort', onExternalAbort, { once: true })
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let res: Response
  try {
    res = await fetch(`${getApiUrl()}${path}`, {
      ...fetchOptions,
      headers,
      signal: controller.signal
    })
  } catch (e) {
    const aborted =
      (e instanceof DOMException && e.name === 'AbortError') ||
      (e instanceof Error && e.name === 'AbortError')
    throw new Error(
      aborted
        ? 'Tiempo agotado al conectar con el servidor. Verificá red e IP del PC.'
        : 'No se pudo conectar con el servidor. Verificá la configuración de red en Configuración.'
    )
  } finally {
    clearTimeout(timer)
    if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort)
  }

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw new Error(
      (data as { error?: string }).error ??
        (data as { message?: string }).message ??
        `Error en la solicitud (${res.status})`
    )
  }

  return data as T
}

/** SQLite datetime('now') se guarda en UTC sin sufijo de zona horaria. */
export function parseDbDateTimeUtc(value: string): Date {
  const trimmed = value.trim()
  if (!trimmed) return new Date(Number.NaN)

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-').map(Number)
    return new Date(y, m - 1, d)
  }

  const normalized = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T')
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(normalized)) {
    return new Date(normalized)
  }

  return new Date(`${normalized}Z`)
}

export function formatDbDateTimeLocal(
  value: string,
  options: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }
): string {
  const d = parseDbDateTimeUtc(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('es-AR', options)
}
