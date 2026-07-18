import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import { HttpServer } from '@cantoo/capacitor-http-server'
import { buildMiSyncPayload, recibirSyncCompanero } from './index'
import type { OfflineSyncPayload } from './types'

export const P2P_PORT = 3850

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
        await respondJson(req.requestId, 200, {
          app: 'ControlStock',
          inventario_sector_id: mine.inventario_sector_id,
          sesion_id: mine.sesion_id,
          contador_id: mine.contador_id,
          rol: mine.rol,
          ronda_actual: mine.ronda_actual,
          finalizo: mine.finalizo
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

  // Si no hay IP LAN (hotspot aún no activo), igual escuchamos el puerto.
  // El cliente suele usar 192.168.43.1 (gateway típico del hotspot Android).
  const localIp = result.localIp || '192.168.43.1'
  const port = result.port || P2P_PORT
  const url = result.url || `http://${localIp}:${port}`

  return { url, localIp, port }
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
  }
  if (info.inventario_sector_id !== sectorInvId) {
    throw new Error('El compañero no está en el mismo sector de inventario')
  }
  if (info.contador_id === mine.contador_id) {
    throw new Error('Estás conectando a tu propio host; usá el otro celular')
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
    throw new Error('El sync con el compañero falló (timeout o red)')
  }
  const data = (await syncRes.json().catch(() => ({}))) as {
    ok?: boolean
    payload?: OfflineSyncPayload
    error?: string
  }
  if (!syncRes.ok || !data.payload) {
    throw new Error(data.error || 'El sync con el compañero falló')
  }

  await recibirSyncCompanero(sectorInvId, data.payload)
  return data.payload
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
  for (let attempt = 1; attempt <= 3; attempt++) {
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
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 800 * attempt))
      }
    }
  }
  throw lastError ?? new Error('El sync con el compañero falló')
}
