import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import type { Usuario } from '@/types'

const OFFLINE_AUTH_KEY = 'cs_offline_auth'

export type OfflineAuthCache = {
  token: string
  usuario: Usuario
  username: string
  /** SHA-256 hex of `${salt}:${password}` */
  passwordHash: string
  salt: string
  updated_at: string
}

function bytesToHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function randomSalt(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return bytesToHex(bytes.buffer)
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const payload = `${salt}:${password}`
  if (crypto?.subtle?.digest) {
    const data = new TextEncoder().encode(payload)
    const digest = await crypto.subtle.digest('SHA-256', data)
    return bytesToHex(digest)
  }
  // Fallback por si el WebView no expone SubtleCrypto
  let h = 2166136261
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `fb_${(h >>> 0).toString(16)}`
}

async function readRaw(): Promise<string | null> {
  if (Capacitor.isNativePlatform()) {
    const { value } = await Preferences.get({ key: OFFLINE_AUTH_KEY })
    if (value) return value
  }
  return localStorage.getItem(OFFLINE_AUTH_KEY)
}

async function writeRaw(json: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await Preferences.set({ key: OFFLINE_AUTH_KEY, value: json })
  }
  localStorage.setItem(OFFLINE_AUTH_KEY, json)
}

export async function loadOfflineAuth(): Promise<OfflineAuthCache | null> {
  try {
    const raw = await readRaw()
    if (!raw) return null
    return JSON.parse(raw) as OfflineAuthCache
  } catch {
    return null
  }
}

export async function hasOfflineAuth(): Promise<boolean> {
  return !!(await loadOfflineAuth())
}

/** Guarda sesión para poder reabrir sin red al PC (mismo usuario/clave). */
export async function saveOfflineAuth(
  token: string,
  usuario: Usuario,
  username: string,
  password: string
): Promise<void> {
  const salt = randomSalt()
  const passwordHash = await hashPassword(password, salt)
  const payload: OfflineAuthCache = {
    token,
    usuario,
    username: username.trim().toLowerCase(),
    passwordHash,
    salt,
    updated_at: new Date().toISOString()
  }
  await writeRaw(JSON.stringify(payload))
}

/** Actualiza solo el perfil cacheado (p. ej. tras /me online). */
export async function updateOfflineAuthUsuario(usuario: Usuario, token?: string): Promise<void> {
  const existing = await loadOfflineAuth()
  if (!existing) return
  existing.usuario = usuario
  if (token) existing.token = token
  existing.updated_at = new Date().toISOString()
  await writeRaw(JSON.stringify(existing))
}

export async function verifyOfflineLogin(
  username: string,
  password: string
): Promise<OfflineAuthCache | null> {
  const cached = await loadOfflineAuth()
  if (!cached) return null
  if (cached.username !== username.trim().toLowerCase()) return null
  const hash = await hashPassword(password, cached.salt)
  if (hash !== cached.passwordHash) return null
  return cached
}

/** Borra credenciales offline (olvido de dispositivo). El logout normal NO llama esto. */
export async function clearOfflineAuth(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await Preferences.remove({ key: OFFLINE_AUTH_KEY })
    } catch {
      /* ignore */
    }
  }
  localStorage.removeItem(OFFLINE_AUTH_KEY)
}
