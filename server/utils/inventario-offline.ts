import type Database from 'better-sqlite3'
import {
  assertContadorEnSector,
  compararContadores,
  ejecutarComparacionSector,
  getInventarioSector,
  getSesionOrThrow,
  mapConteoLinea,
  validarYCalcularLinea,
  type ConteoLineaInput,
  type InventarioSectorEstado
} from './inventario'
import { getProductoDefaults } from './stock'

export type ModoConectividadInventario = 'ONLINE' | 'OFFLINE'

export const PAQUETE_OFFLINE_VERSION = 1

export interface OfflineLineaInput {
  producto_id: number
  contador_id: number
  ronda: number
  tipo_bulto: 'PALLET' | 'CAJA' | 'SUELTO'
  cantidad_bultos?: number | null
  unidades_por_bulto?: number | null
  cantidad_suelta?: number | null
  ubicacion?: string | null
  ubicacion_id?: number | null
  orden?: number
}

export interface ImportarOfflineBody {
  ronda_actual: number
  contador_1_finalizo?: boolean
  contador_2_finalizo?: boolean
  lineas: OfflineLineaInput[]
}

function modoDe(sector: Record<string, unknown>): ModoConectividadInventario {
  const raw = String(sector.modo_conectividad ?? 'ONLINE').toUpperCase()
  return raw === 'OFFLINE' ? 'OFFLINE' : 'ONLINE'
}

export function assertModoOffline(sector: Record<string, unknown>): void {
  if (modoDe(sector) !== 'OFFLINE') {
    throw new Error('Este sector no está en modo offline')
  }
}

export function assertNoConteoOnlineEnOffline(sector: Record<string, unknown>): void {
  if (modoDe(sector) === 'OFFLINE') {
    throw new Error(
      'Este sector es offline: el conteo se hace en la APK. Descargá el paquete e importá el resultado.'
    )
  }
}

export function buildPaqueteOffline(
  db: Database.Database,
  inventarioSectorId: number,
  userId: number
) {
  const { rol: miRol, sector } = assertContadorEnSector(db, inventarioSectorId, userId)
  const sesion = getSesionOrThrow(db, Number(sector.sesion_id))

  if (String(sesion.estado) !== 'EN_PROGRESO') {
    throw new Error('La sesión debe estar en progreso para descargar el paquete')
  }

  assertModoOffline(sector)

  const sectorMeta = db
    .prepare(`SELECT usa_ubicaciones FROM sectores WHERE id = ?`)
    .get(Number(sector.sector_id)) as { usa_ubicaciones: number } | undefined

  const ubicaciones = db
    .prepare(
      `
    SELECT id, codigo, nombre, orden
    FROM sector_ubicaciones
    WHERE sector_id = ? AND activo = 1
    ORDER BY orden, nombre
  `
    )
    .all(Number(sector.sector_id)) as Array<{
    id: number
    codigo: string
    nombre: string
    orden: number
  }>

  const productos = db
    .prepare(
      `
    SELECT
      id, codigo_interno, codigo_barras, nombre, unidad,
      unidades_por_pallet_default, unidades_por_caja_default
    FROM productos
    WHERE activo = 1
    ORDER BY nombre
  `
    )
    .all() as Array<Record<string, unknown>>

  const snapshot = db
    .prepare(
      `
    SELECT
      sn.id, sn.producto_id, sn.cantidad_total,
      p.codigo_interno, p.nombre
    FROM inventario_snapshot sn
    JOIN productos p ON p.id = sn.producto_id
    WHERE sn.sesion_id = ? AND sn.sector_id = ?
    ORDER BY p.nombre
  `
    )
    .all(Number(sector.sesion_id), Number(sector.sector_id)) as Array<Record<string, unknown>>

  const snapshotConLineas = snapshot.map((sn) => {
    const lineas = db
      .prepare(
        `
      SELECT
        tipo_bulto, cantidad_bultos, unidades_por_bulto, cantidad_suelta,
        ubicacion, ubicacion_id, total_unidades, orden
      FROM inventario_snapshot_lineas
      WHERE snapshot_id = ?
      ORDER BY orden, id
    `
      )
      .all(Number(sn.id))
    return {
      producto_id: Number(sn.producto_id),
      codigo_interno: String(sn.codigo_interno),
      nombre: String(sn.nombre),
      cantidad_total: Number(sn.cantidad_total),
      lineas
    }
  })

  const ahora = new Date().toISOString()
  const estadoActual = String(sector.estado)
  if (estadoActual === 'PENDIENTE') {
    db.prepare(
      `
      UPDATE inventario_sectores
      SET estado = 'EN_CONTEO', paquete_descargado_at = COALESCE(paquete_descargado_at, datetime('now'))
      WHERE id = ?
    `
    ).run(inventarioSectorId)
  } else if (!sector.paquete_descargado_at) {
    db.prepare(
      `
      UPDATE inventario_sectores
      SET paquete_descargado_at = datetime('now')
      WHERE id = ?
    `
    ).run(inventarioSectorId)
  }

  const sectorActualizado = getInventarioSector(db, inventarioSectorId)

  return {
    version: PAQUETE_OFFLINE_VERSION,
    descargado_at: ahora,
    sesion: {
      id: Number(sesion.id),
      nombre: String(sesion.nombre),
      estado: String(sesion.estado),
      fecha_inicio: sesion.fecha_inicio as string | null
    },
    inventario_sector: {
      id: Number(sectorActualizado.id),
      sector_id: Number(sectorActualizado.sector_id),
      sector_nombre: String(sectorActualizado.sector_nombre),
      sector_codigo: String(sectorActualizado.sector_codigo),
      modo_conectividad: 'OFFLINE' as const,
      estado: String(sectorActualizado.estado),
      ronda_actual: Number(sectorActualizado.ronda_actual),
      contador_1_id: Number(sectorActualizado.contador_1_id),
      contador_2_id: Number(sectorActualizado.contador_2_id),
      contador_1_nombre: String(sectorActualizado.contador_1_nombre),
      contador_2_nombre: String(sectorActualizado.contador_2_nombre),
      mi_rol: miRol,
      usa_ubicaciones: Number(sectorMeta?.usa_ubicaciones ?? 0) === 1
    },
    ubicaciones,
    productos: productos.map((p) => {
      const { botellasPorCaja } = getProductoDefaults(db, Number(p.id))
      return {
        id: Number(p.id),
        codigo_interno: String(p.codigo_interno),
        codigo_barras: (p.codigo_barras as string | null) ?? null,
        nombre: String(p.nombre),
        unidad: String(p.unidad ?? 'unidad'),
        unidades_por_pallet_default: p.unidades_por_pallet_default as number | null,
        unidades_por_caja_default: p.unidades_por_caja_default as number | null,
        botellas_por_caja: botellasPorCaja
      }
    }),
    snapshot_sector: snapshotConLineas
  }
}

export function importarConteoOffline(
  db: Database.Database,
  inventarioSectorId: number,
  body: ImportarOfflineBody
) {
  const sector = getInventarioSector(db, inventarioSectorId)
  const sesion = getSesionOrThrow(db, Number(sector.sesion_id))

  if (String(sesion.estado) !== 'EN_PROGRESO') {
    throw new Error('La sesión debe estar en progreso para importar')
  }
  assertModoOffline(sector)

  if (sector.importado_at && String(sector.estado) === 'CERRADO_OK') {
    throw new Error('Este sector offline ya fue importado y cerrado entre contadores')
  }

  const rondaActual = Number(body.ronda_actual)
  if (!Number.isFinite(rondaActual) || rondaActual < 1) {
    throw new Error('ronda_actual inválida')
  }

  const lineas = body.lineas ?? []
  if (lineas.length === 0) {
    throw new Error('El import no incluye líneas de conteo')
  }

  const c1 = Number(sector.contador_1_id)
  const c2 = Number(sector.contador_2_id)

  for (const l of lineas) {
    if (l.contador_id !== c1 && l.contador_id !== c2) {
      throw new Error(`contador_id ${l.contador_id} no corresponde a este sector`)
    }
    if (!l.producto_id || l.ronda < 1) {
      throw new Error('Cada línea requiere producto_id y ronda válidos')
    }
  }

  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM inventario_conteo_lineas WHERE inventario_sector_id = ?`).run(
      inventarioSectorId
    )

    const insert = db.prepare(`
      INSERT INTO inventario_conteo_lineas (
        inventario_sector_id, producto_id, contador_id, ronda,
        tipo_bulto, cantidad_bultos, unidades_por_bulto, cantidad_suelta,
        ubicacion, ubicacion_id, total_unidades, orden
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    let ordenAuto = 0
    for (const raw of lineas) {
      const input: ConteoLineaInput = {
        producto_id: raw.producto_id,
        tipo_bulto: raw.tipo_bulto,
        cantidad_bultos: raw.cantidad_bultos ?? null,
        unidades_por_bulto: raw.unidades_por_bulto ?? null,
        cantidad_suelta: raw.cantidad_suelta ?? null,
        ubicacion: raw.ubicacion ?? null,
        ubicacion_id: raw.ubicacion_id ?? null
      }
      const { total } = validarYCalcularLinea(db, raw.producto_id, input)
      ordenAuto += 1
      insert.run(
        inventarioSectorId,
        raw.producto_id,
        raw.contador_id,
        raw.ronda,
        raw.tipo_bulto,
        raw.tipo_bulto === 'SUELTO' ? null : raw.cantidad_bultos ?? null,
        raw.tipo_bulto === 'SUELTO' ? null : raw.unidades_por_bulto ?? null,
        raw.tipo_bulto === 'SUELTO' ? raw.cantidad_suelta ?? null : raw.cantidad_suelta ?? null,
        raw.ubicacion ?? null,
        raw.ubicacion_id ?? null,
        total,
        raw.orden ?? ordenAuto
      )
    }

    const c1Finalizo = body.contador_1_finalizo !== false ? 1 : 0
    const c2Finalizo = body.contador_2_finalizo !== false ? 1 : 0

    db.prepare(
      `
      UPDATE inventario_sectores
      SET
        ronda_actual = ?,
        contador_1_finalizo = ?,
        contador_2_finalizo = ?,
        importado_at = datetime('now')
      WHERE id = ?
    `
    ).run(rondaActual, c1Finalizo, c2Finalizo, inventarioSectorId)

    if (c1Finalizo && c2Finalizo) {
      return ejecutarComparacionSector(db, inventarioSectorId)
    }

    const estadoParcial: InventarioSectorEstado = 'ESPERANDO_COMPANERO'
    db.prepare(`UPDATE inventario_sectores SET estado = ? WHERE id = ?`).run(
      estadoParcial,
      inventarioSectorId
    )
    return compararContadores(db, inventarioSectorId, rondaActual)
  })

  const comparacion = tx()
  const sectorFinal = getInventarioSector(db, inventarioSectorId)

  const lineasGuardadas = db
    .prepare(
      `
    SELECT icl.*, p.codigo_interno, p.nombre, p.unidad
    FROM inventario_conteo_lineas icl
    JOIN productos p ON p.id = icl.producto_id
    WHERE icl.inventario_sector_id = ?
    ORDER BY icl.ronda, icl.contador_id, icl.producto_id, icl.orden, icl.id
  `
    )
    .all(inventarioSectorId) as Array<{
    id: number
    producto_id: number
    contador_id: number
    ronda: number
    tipo_bulto: string
    cantidad_bultos: number | null
    unidades_por_bulto: number | null
    cantidad_suelta: number | null
    ubicacion: string | null
    ubicacion_id: number | null
    total_unidades: number
    orden: number
    codigo_interno?: string
    nombre?: string
    unidad?: string
  }>

  return {
    ok: true,
    sector: {
      id: Number(sectorFinal.id),
      estado: String(sectorFinal.estado),
      ronda_actual: Number(sectorFinal.ronda_actual),
      modo_conectividad: modoDe(sectorFinal),
      importado_at: sectorFinal.importado_at as string | null,
      contador_1_finalizo: Boolean(sectorFinal.contador_1_finalizo),
      contador_2_finalizo: Boolean(sectorFinal.contador_2_finalizo)
    },
    comparacion,
    lineas: lineasGuardadas.map((row) => {
      const { botellasPorCaja } = getProductoDefaults(db, row.producto_id)
      return mapConteoLinea(row, botellasPorCaja)
    })
  }
}
