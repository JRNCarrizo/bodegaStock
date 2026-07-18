import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Preferences } from '@capacitor/preferences'
import { Capacitor } from '@capacitor/core'
import type { OfflineEstadoLocal, OfflinePaquete, OfflineSyncPayload } from './types'

const KEY_PREFIX = 'inv_off_'

function paqueteKey(sectorInvId: number) {
  return `${KEY_PREFIX}pkg_${sectorInvId}`
}

function estadoKey(sectorInvId: number) {
  return `${KEY_PREFIX}st_${sectorInvId}`
}

async function writeJson(path: string, data: unknown): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await Filesystem.writeFile({
      path,
      data: JSON.stringify(data),
      directory: Directory.Data,
      encoding: Encoding.UTF8,
      recursive: true
    })
    return
  }
  localStorage.setItem(`fs:${path}`, JSON.stringify(data))
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    if (Capacitor.isNativePlatform()) {
      const res = await Filesystem.readFile({
        path,
        directory: Directory.Data,
        encoding: Encoding.UTF8
      })
      const raw = typeof res.data === 'string' ? res.data : ''
      return JSON.parse(raw) as T
    }
    const raw = localStorage.getItem(`fs:${path}`)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export async function savePaquete(paquete: OfflinePaquete): Promise<void> {
  const id = paquete.inventario_sector.id
  await writeJson(`inventario-offline/${id}/paquete.json`, paquete)
  await Preferences.set({ key: paqueteKey(id), value: '1' })
}

export async function loadPaquete(sectorInvId: number): Promise<OfflinePaquete | null> {
  return readJson<OfflinePaquete>(`inventario-offline/${sectorInvId}/paquete.json`)
}

export async function hasPaquete(sectorInvId: number): Promise<boolean> {
  const { value } = await Preferences.get({ key: paqueteKey(sectorInvId) })
  if (value) {
    const p = await loadPaquete(sectorInvId)
    return !!p
  }
  return !!(await loadPaquete(sectorInvId))
}

export async function saveEstado(estado: OfflineEstadoLocal): Promise<void> {
  const id = estado.inventario_sector_id
  estado.actualizado_at = new Date().toISOString()
  await writeJson(`inventario-offline/${id}/estado.json`, estado)
  await Preferences.set({ key: estadoKey(id), value: '1' })
}

export async function loadEstado(sectorInvId: number): Promise<OfflineEstadoLocal | null> {
  return readJson<OfflineEstadoLocal>(`inventario-offline/${sectorInvId}/estado.json`)
}

export function emptyEstado(
  sectorInvId: number,
  rondaActual = 1
): OfflineEstadoLocal {
  return {
    inventario_sector_id: sectorInvId,
    ronda_actual: rondaActual,
    mi_finalizo: false,
    companero_finalizo: false,
    mis_lineas: [],
    lineas_companero: [],
    actualizado_at: new Date().toISOString()
  }
}

export async function ensureEstado(
  sectorInvId: number,
  rondaActual = 1
): Promise<OfflineEstadoLocal> {
  const existing = await loadEstado(sectorInvId)
  if (existing) return existing
  const created = emptyEstado(sectorInvId, rondaActual)
  await saveEstado(created)
  return created
}

/** Guarda un payload de sync recibido (para compartir archivo / pegar JSON). */
export async function saveSyncInbox(
  sectorInvId: number,
  payload: OfflineSyncPayload
): Promise<void> {
  await writeJson(
    `inventario-offline/${sectorInvId}/inbox-${payload.contador_id}.json`,
    payload
  )
}

export async function loadSyncInbox(
  sectorInvId: number,
  companeroId: number
): Promise<OfflineSyncPayload | null> {
  return readJson<OfflineSyncPayload>(
    `inventario-offline/${sectorInvId}/inbox-${companeroId}.json`
  )
}

export async function exportSyncJson(payload: OfflineSyncPayload): Promise<string> {
  return JSON.stringify(payload, null, 2)
}

/** Escribe el payload en un archivo compartible y devuelve URI + nombre. */
export async function writeSyncShareFile(payload: OfflineSyncPayload): Promise<{
  json: string
  fileName: string
  uri: string | null
}> {
  const json = await exportSyncJson(payload)
  const fileName = `conteo-s${payload.inventario_sector_id}-c${payload.contador_id}-r${payload.ronda_actual}.json`

  if (!Capacitor.isNativePlatform()) {
    return { json, fileName, uri: null }
  }

  const path = `inventario-offline/share/${fileName}`
  await Filesystem.writeFile({
    path,
    data: json,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
    recursive: true
  })
  const { uri } = await Filesystem.getUri({
    path,
    directory: Directory.Cache
  })
  return { json, fileName, uri }
}

async function deletePath(path: string, directory: Directory = Directory.Data): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      await Filesystem.deleteFile({ path, directory })
    } else {
      localStorage.removeItem(`fs:${path}`)
    }
  } catch {
    /* ignore missing */
  }
}

async function deleteDirectoryRecursive(path: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    const prefix = `fs:${path}/`
    const keys = Object.keys(localStorage).filter((k) => k === `fs:${path}` || k.startsWith(prefix))
    for (const k of keys) localStorage.removeItem(k)
    return
  }
  try {
    const listing = await Filesystem.readdir({ path, directory: Directory.Data })
    for (const entry of listing.files) {
      const child = `${path}/${entry.name}`
      if (entry.type === 'directory') {
        await deleteDirectoryRecursive(child)
      } else {
        await deletePath(child)
      }
    }
    await Filesystem.rmdir({ path, directory: Directory.Data })
  } catch {
    /* ignore missing */
  }
}

/** Borra paquete, estado e inbox locales de un sector. */
export async function clearOfflineSectorLocal(sectorInvId: number): Promise<void> {
  await deleteDirectoryRecursive(`inventario-offline/${sectorInvId}`)
  try {
    await Preferences.remove({ key: paqueteKey(sectorInvId) })
  } catch {
    /* ignore */
  }
  try {
    await Preferences.remove({ key: estadoKey(sectorInvId) })
  } catch {
    /* ignore */
  }
}

/** IDs de sectores con datos offline en el dispositivo. */
export async function listLocalOfflineSectorIds(): Promise<number[]> {
  const ids = new Set<number>()

  if (Capacitor.isNativePlatform()) {
    try {
      const listing = await Filesystem.readdir({
        path: 'inventario-offline',
        directory: Directory.Data
      })
      for (const entry of listing.files) {
        if (entry.type === 'directory' && /^\d+$/.test(entry.name)) {
          ids.add(Number(entry.name))
        }
      }
    } catch {
      /* sin carpeta aún */
    }
  } else {
    const re = /^fs:inventario-offline\/(\d+)\//
    for (const key of Object.keys(localStorage)) {
      const m = re.exec(key)
      if (m) ids.add(Number(m[1]))
    }
  }

  const { keys } = await Preferences.keys()
  for (const key of keys) {
    if (key.startsWith(`${KEY_PREFIX}pkg_`)) {
      const id = Number(key.slice(`${KEY_PREFIX}pkg_`.length))
      if (Number.isFinite(id)) ids.add(id)
    }
  }

  return [...ids]
}

/**
 * Elimina paquetes/estados de sesiones anteriores.
 * Conserva los de `keepSesionId` (sesión actual).
 */
export async function purgeOfflineExceptSesion(keepSesionId: number): Promise<number> {
  const ids = await listLocalOfflineSectorIds()
  let removed = 0
  for (const id of ids) {
    const paquete = await loadPaquete(id)
    if (!paquete || paquete.sesion.id !== keepSesionId) {
      await clearOfflineSectorLocal(id)
      removed += 1
    }
  }
  return removed
}

/**
 * Al sincronizar con el PC: borra paquetes locales que ya no existen en el servidor
 * (sesión cancelada, sector cerrado/importado, etc.).
 * `serverSectorIds` vacío = no hay sectores activos → limpia todo lo local.
 */
export async function purgeOfflineNotInServerSectores(
  serverSectorIds: number[]
): Promise<number> {
  const keep = new Set(serverSectorIds)
  const ids = await listLocalOfflineSectorIds()
  let removed = 0
  for (const id of ids) {
    if (!keep.has(id)) {
      await clearOfflineSectorLocal(id)
      removed += 1
    }
  }
  return removed
}

/** Respaldo post-import (fuera de la carpeta del sector, sobrevive al clear). */
export async function saveImportBackup(
  sectorInvId: number,
  data: {
    paquete: OfflinePaquete
    estado: OfflineEstadoLocal
    confirmado_at: string
    lineas_enviadas: number
  }
): Promise<void> {
  await writeJson(`inventario-offline-backups/import-${sectorInvId}.json`, {
    ...data,
    guardado_at: new Date().toISOString()
  })
}

export async function loadImportBackup(sectorInvId: number): Promise<{
  paquete: OfflinePaquete
  estado: OfflineEstadoLocal
  confirmado_at: string
  lineas_enviadas: number
  guardado_at: string
} | null> {
  return readJson(`inventario-offline-backups/import-${sectorInvId}.json`)
}
