import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { HttpServer } from '@cantoo/capacitor-http-server'
import { buildMiSyncPayload, recibirSyncCompanero } from './index'
import { ensureEstado } from './storage'
import type { OfflineSyncPayload } from './types'

export const P2P_PORT = 3850
/** Gateway típico del hotspot Android; útil si aún no se midió la IP real. */
export const HOTSPOT_IP_TIPICA = '192.168.43.1'
const LAST_HOST_IP_KEY = 'inv_off_last_p2p_host_ip'

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type'
}

let requestHandle: PluginListenerHandle | null = null
let errorHandle: PluginListenerHandle | null = null
let hostSectorId: number | null = null
let onHostSynced: ((companion: OfflineSyncPayload) => void) | null = null

export type P2PHostInfo = {
  url: string
  localIp: string
  port: number
}

function parsePath(path: string): string {
  // Normalize trailing slash
  if (path.length > 1 && path.endsWith('/')) return path.slice(0, -1)
  return path
}

async function respondJson(
  requestId: string,
  status: number,
  body: unknown
): Promise<void> {
  await HttpServer.respond({
    requestId,
    status,
    headers: JSON_HEADERS,
    bodyText: JSON.stringify(body)
  })
}

/**
 * Un celular activa hotspot y corre el servidor.
 * El compañero se conecta a esa red y llama a `syncConHost`.
 *
 * Importante: la IP del QR se toma al iniciar. Si el hotspot todavía no está
 * activo, el plugin suele devolver la IP de la WiFi de oficina (no alcanzable
 * para el compañero). Usá `refreshP2PHostInfo` para actualizar cuando el
 * hotspot ya esté prendido.
 */
export async function startP2PHost(
  sectorInvId: number,
  onSynced: (companion: OfflineSyncPayload) => void
): Promise<P2PHostInfo> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('El sync por hotspot solo funciona en la APK (Android/iOS)')
  }

  await stopP2PHost()
  hostSectorId = sectorInvId
  onHostSynced = onSynced

  requestHandle = await HttpServer.addListener('request', async (req) => {
    try {
      const path = parsePath(req.path)
      if (req.method === 'OPTIONS') {
        await HttpServer.respond({
          requestId: req.requestId,
          status: 204,
          headers: JSON_HEADERS
        })
        return
      }

      if (path === '/bodega/info' && req.method === 'GET') {
        const mine = await buildMiSyncPayload(sectorInvId)
        const estado = await ensureEstado(sectorInvId)
        const yaRecibiCompanero =
          estado.companero_finalizo ||
          estado.lineas_companero.some((l) => l.ronda === estado.ronda_actual)
        await respondJson(req.requestId, 200, {
          app: 'ControlStock',
          inventario_sector_id: mine.inventario_sector_id,
          sesion_id: mine.sesion_id,
          contador_id: mine.contador_id,
          rol: mine.rol,
          ronda_actual: mine.ronda_actual,
          finalizo: mine.finalizo,
          ya_recibi_companero: yaRecibiCompanero
        })
        return
      }

      // Recuperación: el host ya guardó el sync del cliente pero la respuesta
      // no llegó (corte de red / cambio de WiFi). El cliente puede pedir el payload.
      if (path === '/bodega/payload' && req.method === 'GET') {
        const estado = await ensureEstado(sectorInvId)
        const yaRecibiCompanero =
          estado.companero_finalizo ||
          estado.lineas_companero.some((l) => l.ronda === estado.ronda_actual)
        if (!yaRecibiCompanero) {
          await respondJson(req.requestId, 404, {
            error: 'Todavía no recibí tu conteo. Reintentá el sync completo.'
          })
          return
        }
        const mine = await buildMiSyncPayload(sectorInvId)
        await respondJson(req.requestId, 200, {
          ok: true,
          payload: mine
        })
        return
      }

      if (path === '/bodega/sync' && req.method === 'POST') {
        if (!req.bodyText) {
          await respondJson(req.requestId, 400, { error: 'Body JSON requerido' })
          return
        }
        let companion: OfflineSyncPayload
        try {
          companion = JSON.parse(req.bodyText) as OfflineSyncPayload
        } catch {
          await respondJson(req.requestId, 400, { error: 'JSON inválido' })
          return
        }

        if (companion.inventario_sector_id !== sectorInvId) {
          await respondJson(req.requestId, 400, {
            error: 'El sector del compañero no coincide con este host'
          })
          return
        }

        // Armar mi payload antes de guardar el del compañero (no depende de él).
        const mine = await buildMiSyncPayload(sectorInvId)
        await recibirSyncCompanero(sectorInvId, companion)

        // Responder primero. El host NO se apaga acá: el cliente necesita
        // recibir el body completo y poder reintentar si la red corta.
        await respondJson(req.requestId, 200, {
          ok: true,
          payload: mine
        })

        const notify = onHostSynced
        // Dar margen a que el SO envíe la respuesta HTTP antes de tocar la UI.
        setTimeout(() => {
          notify?.(companion)
        }, 800)
        return
      }

      await respondJson(req.requestId, 404, { error: 'Ruta no encontrada' })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Error en el servidor local'
      try {
        await respondJson(req.requestId, 500, { error: message })
      } catch {
        /* ignore */
      }
    }
  })

  errorHandle = await HttpServer.addListener('server-error', ({ message, fatal }) => {
    console.warn('[p2p] server-error', message, fatal)
  })

  const result = await HttpServer.start({
    port: P2P_PORT,
    android: {
      notificationTitle: 'ControlStock',
      notificationText: 'Esperando al compañero (sync inventario)',
      channelId: 'controlstock_p2p',
      channelName: 'Sync inventario offline'
    }
  })

  const info = toHostInfo(result)
  await saveLastHostIp(info)
  return info
}

/**
 * Relee la IP LAN sin reiniciar el servidor (útil cuando el hotspot se activó
 * después de haber generado el QR).
 */
export async function refreshP2PHostInfo(): Promise<P2PHostInfo | null> {
  if (!Capacitor.isNativePlatform() || hostSectorId == null) return null
  try {
    // Si el server ya corre, start() solo vuelve a resolver localIp().
    const result = await HttpServer.start({ port: P2P_PORT })
    const info = toHostInfo(result)
    await saveLastHostIp(info)
    return info
  } catch {
    return null
  }
}

function toHostInfo(result: { localIp?: string; port?: number; url?: string }): P2PHostInfo {
  // Si no hay IP LAN (hotspot aún no activo), igual escuchamos el puerto.
  // El cliente suele usar 192.168.43.1 (gateway típico del hotspot Android).
  const localIp = result.localIp || HOTSPOT_IP_TIPICA
  const port = result.port || P2P_PORT
  const url = result.url || `http://${localIp}:${port}`
  return { url, localIp, port }
}

export async function saveLastHostIp(info: { localIp: string; port: number }): Promise<void> {
  try {
    await Preferences.set({
      key: LAST_HOST_IP_KEY,
      value: JSON.stringify({ localIp: info.localIp, port: info.port })
    })
  } catch {
    /* ignore */
  }
}

export async function loadLastHostIp(): Promise<{ localIp: string; port: number } | null> {
  try {
    const { value } = await Preferences.get({ key: LAST_HOST_IP_KEY })
    if (!value) return null
    const parsed = JSON.parse(value) as { localIp?: string; port?: number }
    if (!parsed.localIp) return null
    return { localIp: parsed.localIp, port: parsed.port || P2P_PORT }
  } catch {
    return null
  }
}

/** Intenta leer la IP LAN del dispositivo (WebRTC). No inicia el servidor P2P. */
async function peekLanIpViaWebRtc(): Promise<string | null> {
  if (typeof RTCPeerConnection === 'undefined') return null
  return new Promise((resolve) => {
    let done = false
    const finish = (ip: string | null) => {
      if (done) return
      done = true
      try {
        pc.close()
      } catch {
        /* ignore */
      }
      resolve(ip)
    }
    const pc = new RTCPeerConnection({ iceServers: [] })
    try {
      pc.createDataChannel('ip')
    } catch {
      finish(null)
      return
    }
    pc.onicecandidate = (ev) => {
      const cand = ev.candidate?.candidate
      if (!cand) return
      const m = /([0-9]{1,3}(?:\.[0-9]{1,3}){3})/.exec(cand)
      if (!m) return
      const ip = m[1]
      if (ip.startsWith('127.') || ip.startsWith('0.')) return
      finish(ip)
    }
    void pc
      .createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .catch(() => finish(null))
    setTimeout(() => finish(null), 2500)
  })
}

/**
 * Resuelve la IP a mostrar al compañero: host activo → Preferences → WebRTC → tip hotspot.
 */
export async function resolveDeviceLanIp(): Promise<{ localIp: string; port: number; source: string }> {
  if (hostSectorId != null) {
    const fresh = await refreshP2PHostInfo()
    if (fresh?.localIp) {
      await saveLastHostIp(fresh)
      return { localIp: fresh.localIp, port: fresh.port, source: 'host' }
    }
  }

  const saved = await loadLastHostIp()
  if (saved) return { ...saved, source: 'saved' }

  const rtc = await peekLanIpViaWebRtc()
  if (rtc) {
    const info = { localIp: rtc, port: P2P_PORT }
    await saveLastHostIp(info)
    return { ...info, source: 'webrtc' }
  }

  return { localIp: HOTSPOT_IP_TIPICA, port: P2P_PORT, source: 'tipica' }
}

export async function stopP2PHost(): Promise<void> {
  try {
    await requestHandle?.remove()
  } catch {
    /* ignore */
  }
  try {
    await errorHandle?.remove()
  } catch {
    /* ignore */
  }
  requestHandle = null
  errorHandle = null
  hostSectorId = null
  onHostSynced = null
  try {
    await HttpServer.stop()
  } catch {
    /* ignore */
  }
}

export function isP2PHostRunning(): boolean {
  return hostSectorId != null
}

function normalizeBaseUrl(raw: string): string {
  let v = raw.trim()
  if (!v) throw new Error('Ingresá la IP o URL del compañero')
  if (!/^https?:\/\//i.test(v)) v = `http://${v}`
  const url = new URL(v)
  if (!url.port) url.port = String(P2P_PORT)
  return url.origin
}

function fetchWithTimeout(input: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
}

async function syncConHostOnce(
  sectorInvId: number,
  base: string,
  mine: OfflineSyncPayload
): Promise<OfflineSyncPayload> {
  let infoRes: Response
  try {
    infoRes = await fetchWithTimeout(`${base}/bodega/info`, { method: 'GET' }, 10000)
  } catch {
    throw new Error('No se pudo contactar al compañero. Revisá hotspot e IP.')
  }
  if (!infoRes.ok) {
    throw new Error('No se pudo contactar al compañero. Revisá hotspot e IP.')
  }
  const info = (await infoRes.json()) as {
    inventario_sector_id?: number
    contador_id?: number
    ya_recibi_companero?: boolean
  }
  if (info.inventario_sector_id !== sectorInvId) {
    throw new Error('El compañero no está en el mismo sector de inventario')
  }
  if (info.contador_id === mine.contador_id) {
    throw new Error('Estás conectando a tu propio host; usá el otro celular')
  }

  // Si el host ya tiene nuestro conteo (sync previo sin respuesta), solo pedimos el suyo.
  if (info.ya_recibi_companero) {
    const pulled = await pullHostPayload(base)
    if (pulled) {
      await recibirSyncCompanero(sectorInvId, pulled)
      return pulled
    }
  }

  let syncRes: Response
  try {
    syncRes = await fetchWithTimeout(
      `${base}/bodega/sync`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(mine)
      },
      45000
    )
  } catch {
    // Corte a mitad: el host puede haber guardado nuestro payload. Intentá recuperar el suyo.
    const pulled = await pullHostPayload(base)
    if (pulled) {
      await recibirSyncCompanero(sectorInvId, pulled)
      return pulled
    }
    throw new Error('El sync con el compañero falló (timeout o red)')
  }
  const data = (await syncRes.json().catch(() => ({}))) as {
    ok?: boolean
    payload?: OfflineSyncPayload
    error?: string
  }
  if (!syncRes.ok || !data.payload) {
    const pulled = await pullHostPayload(base)
    if (pulled) {
      await recibirSyncCompanero(sectorInvId, pulled)
      return pulled
    }
    throw new Error(data.error || 'El sync con el compañero falló')
  }

  await recibirSyncCompanero(sectorInvId, data.payload)
  return data.payload
}

async function pullHostPayload(base: string): Promise<OfflineSyncPayload | null> {
  try {
    const res = await fetchWithTimeout(`${base}/bodega/payload`, { method: 'GET' }, 15000)
    if (!res.ok) return null
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      payload?: OfflineSyncPayload
    }
    return data.payload ?? null
  } catch {
    return null
  }
}

/**
 * Celular cliente: ya conectado al hotspot del compañero.
 * Intercambia payloads y aplica el del host. Reintenta si la red corta a mitad.
 */
export async function syncConHost(
  sectorInvId: number,
  hostUrlOrIp: string
): Promise<OfflineSyncPayload> {
  const base = normalizeBaseUrl(hostUrlOrIp)
  const mine = await buildMiSyncPayload(sectorInvId)

  let lastError: Error | null = null
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      return await syncConHostOnce(sectorInvId, base, mine)
    } catch (e) {
      lastError = e instanceof Error ? e : new Error('El sync con el compañero falló')
      // No reintentar errores de lógica (sector / mismo celular)
      if (
        lastError.message.includes('mismo sector') ||
        lastError.message.includes('propio host')
      ) {
        throw lastError
      }
      if (attempt < 5) {
        await new Promise((r) => setTimeout(r, 1000 * attempt))
      }
    }
  }
  throw lastError ?? new Error('El sync con el compañero falló')
}
