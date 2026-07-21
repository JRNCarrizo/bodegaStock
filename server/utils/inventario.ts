import type Database from 'better-sqlite3'
import {
  calcTotalInventarioLinea,
  calcTotalUnidades,
  formatEtiquetaLinea,
  formatTotalesInventarioResumen,
  getProductoDefaults,
  refreshStockSectorTotal,
  STOCK_SECTOR_VISIBLE_SQL,
  sumarTotalesInventarioLineas,
  totalesInventarioCoinciden,
  totalCajasLineaConteo,
  totalSueltoLineaConteo,
  validateLineaDesglose,
  type LineaDesgloseInput,
  type TotalesInventarioDesglose
} from './stock'

export type InventarioSesionEstado = 'ABIERTA' | 'EN_PROGRESO' | 'CERRADA' | 'CANCELADA'
export type InventarioSectorEstado =
  | 'PENDIENTE'
  | 'EN_CONTEO'
  | 'ESPERANDO_COMPANERO'
  | 'CON_DIFERENCIAS'
  | 'CERRADO_OK'

export interface ConteoLineaInput extends LineaDesgloseInput {
  producto_id: number
  ubicacion?: string | null
  ubicacion_id?: number | null
}

export type CierreDecisionModo = 'CONTADO' | 'SISTEMA' | 'MANUAL'

export interface CierreDecisionInput {
  producto_id: number
  sector_id: number
  modo: CierreDecisionModo
  lineas?: Array<Omit<ConteoLineaInput, 'producto_id'>>
}

function cierreDecisionKey(productoId: number, sectorId: number): string {
  return `${productoId}:${sectorId}`
}

interface ConteoLineaRow {
  id: number
  inventario_sector_id: number
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
}

function lineaInputFromRow(row: ConteoLineaRow): LineaDesgloseInput {
  return {
    tipo_bulto: row.tipo_bulto as LineaDesgloseInput['tipo_bulto'],
    cantidad_bultos: row.cantidad_bultos,
    unidades_por_bulto: row.unidades_por_bulto,
    cantidad_suelta: row.cantidad_suelta
  }
}

function totalLineaInventarioDesdeRow(row: ConteoLineaRow, botellasPorCaja: number): number {
  const linea = lineaInputFromRow(row)
  if (linea.tipo_bulto === 'SUELTO') {
    return calcTotalUnidades(linea)
  }
  return calcTotalInventarioLinea(linea, botellasPorCaja)
}

function totalesDesdeLineasConteo(
  db: Database.Database,
  lineas: ConteoLineaRow[],
  productoId?: number
): TotalesInventarioDesglose {
  let cajas = 0
  let suelto = 0
  for (const row of lineas) {
    const pid = productoId ?? row.producto_id
    const { botellasPorCaja } = getProductoDefaults(db, pid)
    const linea = lineaInputFromRow(row)
    cajas += totalCajasLineaConteo(linea, botellasPorCaja)
    suelto += totalSueltoLineaConteo(linea)
  }
  return { cajas, suelto }
}

function totalesDesdeSnapshotLineas(
  db: Database.Database,
  productoId: number,
  lineas: Array<Record<string, unknown>>,
  fallbackCajas: number
): TotalesInventarioDesglose {
  if (lineas.length === 0) {
    return { cajas: fallbackCajas, suelto: 0 }
  }
  const { botellasPorCaja } = getProductoDefaults(db, productoId)
  const rows = lineas.map((l) => snapshotLineaToConteoRow(l, botellasPorCaja))
  return totalesDesdeLineasConteo(db, rows, productoId)
}

export function mapConteoLinea(
  row: ConteoLineaRow,
  botellasPorCaja: number
) {
  const linea = lineaInputFromRow(row)
  const total_cajas = totalCajasLineaConteo(linea, botellasPorCaja)
  const total_suelto = totalSueltoLineaConteo(linea)
  return {
    id: row.id,
    producto_id: row.producto_id,
    contador_id: row.contador_id,
    ronda: row.ronda,
    tipo_bulto: row.tipo_bulto,
    cantidad_bultos: row.cantidad_bultos,
    unidades_por_bulto: row.unidades_por_bulto,
    cantidad_suelta: row.cantidad_suelta,
    ubicacion: row.ubicacion,
    ubicacion_id: row.ubicacion_id,
    total_cajas,
    total_suelto,
    total_unidades: totalLineaInventarioDesdeRow(row, botellasPorCaja),
    orden: row.orden,
    codigo_interno: row.codigo_interno,
    nombre: row.nombre,
    etiqueta: formatEtiquetaLinea(linea, row.unidad)
  }
}

export function getInventarioSector(
  db: Database.Database,
  inventarioSectorId: number
) {
  const row = db.prepare(`
    SELECT
      isec.*,
      s.nombre AS sector_nombre,
      s.codigo AS sector_codigo,
      u1.nombre AS contador_1_nombre,
      u2.nombre AS contador_2_nombre
    FROM inventario_sectores isec
    JOIN sectores s ON s.id = isec.sector_id
    JOIN usuarios u1 ON u1.id = isec.contador_1_id
    JOIN usuarios u2 ON u2.id = isec.contador_2_id
    WHERE isec.id = ?
  `).get(inventarioSectorId) as Record<string, unknown> | undefined
  if (!row) throw new Error('Sector de inventario no encontrado')
  return row
}

export function getSesionOrThrow(db: Database.Database, sesionId: number) {
  const sesion = db.prepare(`
    SELECT s.*, u.nombre AS creado_por_nombre
    FROM inventario_sesiones s
    JOIN usuarios u ON u.id = s.creado_por_id
    WHERE s.id = ?
  `).get(sesionId) as Record<string, unknown> | undefined
  if (!sesion) throw new Error('Sesión de inventario no encontrada')
  return sesion
}

export function assertContadorEnSector(
  db: Database.Database,
  inventarioSectorId: number,
  userId: number
): { rol: 1 | 2; sector: ReturnType<typeof getInventarioSector> } {
  const sector = getInventarioSector(db, inventarioSectorId)
  const c1 = Number(sector.contador_1_id)
  const c2 = Number(sector.contador_2_id)
  if (userId === c1) return { rol: 1, sector }
  if (userId === c2) return { rol: 2, sector }
  throw new Error('No estás asignado como contador en este sector')
}

export function assertSectorEditable(
  sector: Record<string, unknown>,
  rol: 1 | 2
): void {
  const estado = String(sector.estado)
  if (estado === 'CERRADO_OK') {
    throw new Error('Este sector ya está cerrado')
  }
  if (estado === 'CON_DIFERENCIAS') {
    throw new Error('Hay diferencias con tu compañero; iniciá el reconteo para continuar')
  }
  const finalizo = rol === 1 ? Number(sector.contador_1_finalizo) : Number(sector.contador_2_finalizo)
  if (finalizo) {
    throw new Error('Ya finalizaste este sector en la ronda actual')
  }
}

export function assertSectorFinalizable(
  sector: Record<string, unknown>,
  rol: 1 | 2
): void {
  const estado = String(sector.estado)
  if (estado === 'CERRADO_OK') {
    throw new Error('Este sector ya está cerrado')
  }
  const finalizo = rol === 1 ? Number(sector.contador_1_finalizo) : Number(sector.contador_2_finalizo)
  if (finalizo) {
    throw new Error('Ya finalizaste este sector en la ronda actual')
  }
}

/** Volver a editar el propio conteo solo si el compañero aún no finalizó. */
export function reabrirConteoPropio(
  db: Database.Database,
  inventarioSectorId: number,
  userId: number
): { ok: true; estado: string } {
  const { rol, sector } = assertContadorEnSector(db, inventarioSectorId, userId)

  if (String(sector.modo_conectividad ?? 'ONLINE') === 'OFFLINE') {
    throw new Error(
      'Este sector es offline: el conteo se reabre desde la APK antes de sincronizar.'
    )
  }

  const estado = String(sector.estado)
  if (estado === 'CERRADO_OK' || estado === 'CON_DIFERENCIAS') {
    throw new Error(
      'El sector ya se comparó entre contadores. Si hay que corregir, usá el reconteo.'
    )
  }

  const miFinalizo = rol === 1 ? Number(sector.contador_1_finalizo) : Number(sector.contador_2_finalizo)
  const otroFinalizo = rol === 1 ? Number(sector.contador_2_finalizo) : Number(sector.contador_1_finalizo)

  if (!miFinalizo) {
    throw new Error('Todavía no finalizaste; ya podés editar el conteo')
  }
  if (otroFinalizo) {
    throw new Error(
      'Tu compañero ya finalizó. No se puede reabrir el conteo; esperá la comparación o el reconteo.'
    )
  }

  const col = rol === 1 ? 'contador_1_finalizo' : 'contador_2_finalizo'
  db.prepare(
    `
    UPDATE inventario_sectores
    SET ${col} = 0,
        estado = 'EN_CONTEO'
    WHERE id = ?
  `
  ).run(inventarioSectorId)

  return { ok: true, estado: 'EN_CONTEO' }
}

function lineasDelContador(
  db: Database.Database,
  inventarioSectorId: number,
  contadorId: number,
  ronda: number
): ConteoLineaRow[] {
  return db.prepare(`
    SELECT
      icl.*, p.codigo_interno, p.nombre, p.unidad
    FROM inventario_conteo_lineas icl
    JOIN productos p ON p.id = icl.producto_id
    WHERE icl.inventario_sector_id = ?
      AND icl.contador_id = ?
      AND icl.ronda = ?
    ORDER BY icl.producto_id, icl.orden, icl.id
  `).all(inventarioSectorId, contadorId, ronda) as ConteoLineaRow[]
}

export function totalesPorProducto(
  db: Database.Database,
  lineas: ConteoLineaRow[]
): Map<number, TotalesInventarioDesglose> {
  const map = new Map<number, TotalesInventarioDesglose>()
  for (const l of lineas) {
    const { botellasPorCaja } = getProductoDefaults(db, l.producto_id)
    const linea = lineaInputFromRow(l)
    const prev = map.get(l.producto_id) ?? { cajas: 0, suelto: 0 }
    map.set(l.producto_id, {
      cajas: prev.cajas + totalCajasLineaConteo(linea, botellasPorCaja),
      suelto: prev.suelto + totalSueltoLineaConteo(linea)
    })
  }
  return map
}

export function compararContadores(
  db: Database.Database,
  inventarioSectorId: number,
  ronda: number
) {
  const sector = getInventarioSector(db, inventarioSectorId)
  const c1 = Number(sector.contador_1_id)
  const c2 = Number(sector.contador_2_id)

  const lineas1 = lineasDelContador(db, inventarioSectorId, c1, ronda)
  const lineas2 = lineasDelContador(db, inventarioSectorId, c2, ronda)
  const tot1 = totalesPorProducto(db, lineas1)
  const tot2 = totalesPorProducto(db, lineas2)

  const productoIds = new Set([...tot1.keys(), ...tot2.keys()])
  const ok: Array<{
    producto_id: number
    codigo_interno: string
    nombre: string
    total: number
    resumen: string
  }> = []
  const diferencias: Array<{
    producto_id: number
    codigo_interno: string
    nombre: string
    total_contador_1: number
    total_contador_2: number
    total_suelto_contador_1: number
    total_suelto_contador_2: number
    resumen_contador_1: string
    resumen_contador_2: string
    diferencia: number
    diferencia_suelto: number
    lineas_contador_1: ReturnType<typeof mapConteoLinea>[]
    lineas_contador_2: ReturnType<typeof mapConteoLinea>[]
  }> = []

  for (const productoId of productoIds) {
    const t1 = tot1.get(productoId) ?? { cajas: 0, suelto: 0 }
    const t2 = tot2.get(productoId) ?? { cajas: 0, suelto: 0 }
    const prod = db.prepare(`
      SELECT codigo_interno, nombre, unidad FROM productos WHERE id = ?
    `).get(productoId) as { codigo_interno: string; nombre: string; unidad: string }

    const l1 = lineas1.filter((l) => l.producto_id === productoId)
    const l2 = lineas2.filter((l) => l.producto_id === productoId)
    const { botellasPorCaja: bp1 } = getProductoDefaults(db, productoId)
    const mapped1 = l1.map((l) => mapConteoLinea(l, bp1))
    const mapped2 = l2.map((l) => mapConteoLinea(l, bp1))
    const resumen1 = formatTotalesInventarioResumen(t1, prod.unidad)
    const resumen2 = formatTotalesInventarioResumen(t2, prod.unidad)

    if (totalesInventarioCoinciden(t1, t2)) {
      ok.push({
        producto_id: productoId,
        codigo_interno: prod.codigo_interno,
        nombre: prod.nombre,
        total: t1.cajas,
        resumen: resumen1
      })
    } else {
      diferencias.push({
        producto_id: productoId,
        codigo_interno: prod.codigo_interno,
        nombre: prod.nombre,
        total_contador_1: t1.cajas,
        total_contador_2: t2.cajas,
        total_suelto_contador_1: t1.suelto,
        total_suelto_contador_2: t2.suelto,
        resumen_contador_1: resumen1,
        resumen_contador_2: resumen2,
        diferencia: t1.cajas - t2.cajas,
        diferencia_suelto: t1.suelto - t2.suelto,
        lineas_contador_1: mapped1,
        lineas_contador_2: mapped2
      })
    }
  }

  return {
    ronda,
    ok,
    diferencias,
    coincide: diferencias.length === 0
  }
}

export function ejecutarComparacionSector(
  db: Database.Database,
  inventarioSectorId: number
): ReturnType<typeof compararContadores> {
  const sector = getInventarioSector(db, inventarioSectorId)
  const ronda = Number(sector.ronda_actual)
  const resultado = compararContadores(db, inventarioSectorId, ronda)
  const sesionId = Number(sector.sesion_id)

  db.prepare(`
    DELETE FROM inventario_diferencias
    WHERE sesion_id = ? AND inventario_sector_id = ? AND tipo = 'ENTRE_CONTADORES'
  `).run(sesionId, inventarioSectorId)

  const insertDiff = db.prepare(`
    INSERT INTO inventario_diferencias (
      sesion_id, inventario_sector_id, producto_id, tipo,
      cantidad_contador_1, cantidad_contador_2, diferencia,
      desglose_sistema, desglose_contado, resuelta
    ) VALUES (?, ?, ?, 'ENTRE_CONTADORES', ?, ?, ?, ?, ?, ?)
  `)

  for (const d of resultado.diferencias) {
    insertDiff.run(
      sesionId,
      inventarioSectorId,
      d.producto_id,
      d.total_contador_1,
      d.total_contador_2,
      d.diferencia,
      JSON.stringify(d.lineas_contador_1),
      JSON.stringify(d.lineas_contador_2),
      0
    )
  }

  const nuevoEstado: InventarioSectorEstado = resultado.coincide ? 'CERRADO_OK' : 'CON_DIFERENCIAS'
  db.prepare(`
    UPDATE inventario_sectores SET estado = ? WHERE id = ?
  `).run(nuevoEstado, inventarioSectorId)

  return resultado
}

function copiarLineasReconteoContador(
  db: Database.Database,
  inventarioSectorId: number,
  contadorId: number,
  rondaDestino: number,
  rondaOrigen: number,
  productoIds: number[]
): number {
  const insertLinea = db.prepare(`
    INSERT INTO inventario_conteo_lineas (
      inventario_sector_id, producto_id, contador_id, ronda,
      tipo_bulto, cantidad_bultos, unidades_por_bulto, cantidad_suelta,
      ubicacion, ubicacion_id, total_unidades, orden
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  let lineasCopiadas = 0

  for (const productoId of productoIds) {
    const yaTiene = db.prepare(`
      SELECT 1 FROM inventario_conteo_lineas
      WHERE inventario_sector_id = ? AND contador_id = ? AND ronda = ? AND producto_id = ?
      LIMIT 1
    `).get(inventarioSectorId, contadorId, rondaDestino, productoId)
    if (yaTiene) continue

    const lineasPrevias = db.prepare(`
      SELECT
        tipo_bulto, cantidad_bultos, unidades_por_bulto, cantidad_suelta,
        ubicacion, ubicacion_id, orden
      FROM inventario_conteo_lineas
      WHERE inventario_sector_id = ? AND contador_id = ? AND ronda = ? AND producto_id = ?
      ORDER BY orden, id
    `).all(inventarioSectorId, contadorId, rondaOrigen, productoId) as Array<{
      tipo_bulto: string
      cantidad_bultos: number | null
      unidades_por_bulto: number | null
      cantidad_suelta: number | null
      ubicacion: string | null
      ubicacion_id: number | null
      orden: number
    }>

    for (const l of lineasPrevias) {
      const { total } = validarYCalcularLinea(db, productoId, {
        producto_id: productoId,
        tipo_bulto: l.tipo_bulto as LineaDesgloseInput['tipo_bulto'],
        cantidad_bultos: l.cantidad_bultos,
        unidades_por_bulto: l.unidades_por_bulto,
        cantidad_suelta: l.cantidad_suelta
      })
      insertLinea.run(
        inventarioSectorId,
        productoId,
        contadorId,
        rondaDestino,
        l.tipo_bulto,
        l.tipo_bulto === 'SUELTO' ? null : l.cantidad_bultos,
        l.tipo_bulto === 'SUELTO' ? null : l.unidades_por_bulto,
        l.tipo_bulto === 'SUELTO' ? l.cantidad_suelta : l.cantidad_suelta ?? null,
        l.ubicacion,
        l.ubicacion_id,
        total,
        l.orden
      )
      lineasCopiadas += 1
    }
  }

  return lineasCopiadas
}

/** Si el sector está en reconteo pero faltan líneas precargadas, las copia desde la ronda anterior. */
export function asegurarPrecargaReconteo(db: Database.Database, inventarioSectorId: number): void {
  const sector = getInventarioSector(db, inventarioSectorId)
  const ronda = Number(sector.ronda_actual)
  if (ronda <= 1 || String(sector.estado) !== 'EN_CONTEO') return

  const rondaAnterior = ronda - 1
  const resultado = compararContadores(db, inventarioSectorId, rondaAnterior)
  const productoIds = resultado.diferencias.map((d) => d.producto_id)
  if (productoIds.length === 0) return

  const c1 = Number(sector.contador_1_id)
  const c2 = Number(sector.contador_2_id)

  const tx = db.transaction(() => {
    copiarLineasReconteoContador(db, inventarioSectorId, c1, ronda, rondaAnterior, productoIds)
    copiarLineasReconteoContador(db, inventarioSectorId, c2, ronda, rondaAnterior, productoIds)
  })
  tx()
}

export function iniciarReconteoSector(db: Database.Database, inventarioSectorId: number): {
  ronda: number
  productos_precargados: number
} {
  const sector = getInventarioSector(db, inventarioSectorId)
  if (String(sector.estado) !== 'CON_DIFERENCIAS') {
    throw new Error('El sector no tiene diferencias pendientes')
  }
  const rondaAnterior = Number(sector.ronda_actual)
  const nuevaRonda = rondaAnterior + 1
  const c1 = Number(sector.contador_1_id)
  const c2 = Number(sector.contador_2_id)

  const resultado = compararContadores(db, inventarioSectorId, rondaAnterior)
  const productoIds = resultado.diferencias.map((d) => d.producto_id)
  if (productoIds.length === 0) {
    throw new Error('No hay productos con diferencias para reconteo')
  }

  let lineasCopiadas = 0

  const tx = db.transaction(() => {
    lineasCopiadas += copiarLineasReconteoContador(
      db,
      inventarioSectorId,
      c1,
      nuevaRonda,
      rondaAnterior,
      productoIds
    )
    lineasCopiadas += copiarLineasReconteoContador(
      db,
      inventarioSectorId,
      c2,
      nuevaRonda,
      rondaAnterior,
      productoIds
    )

    db.prepare(`
      UPDATE inventario_sectores
      SET
        estado = 'EN_CONTEO',
        ronda_actual = ?,
        contador_1_finalizo = 0,
        contador_2_finalizo = 0
      WHERE id = ?
    `).run(nuevaRonda, inventarioSectorId)
  })

  tx()

  return {
    ronda: nuevaRonda,
    productos_precargados: productoIds.length
  }
}

export function crearSnapshotInventario(
  db: Database.Database,
  sesionId: number,
  sectorIds: number[]
): void {
  const placeholders = sectorIds.map(() => '?').join(',')
  const stocks = db.prepare(`
    SELECT ss.id, ss.producto_id, ss.sector_id, ss.cantidad_total
    FROM stock_sector ss
    WHERE ss.sector_id IN (${placeholders}) AND ${STOCK_SECTOR_VISIBLE_SQL}
  `).all(...sectorIds) as Array<{
    id: number
    producto_id: number
    sector_id: number
    cantidad_total: number
  }>

  const insertSnap = db.prepare(`
    INSERT INTO inventario_snapshot (sesion_id, producto_id, sector_id, cantidad_total)
    VALUES (?, ?, ?, ?)
  `)
  const insertLinea = db.prepare(`
    INSERT INTO inventario_snapshot_lineas (
      snapshot_id, tipo_bulto, cantidad_bultos, unidades_por_bulto,
      cantidad_suelta, ubicacion, ubicacion_id, total_unidades, orden
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  for (const ss of stocks) {
    const snap = insertSnap.run(sesionId, ss.producto_id, ss.sector_id, ss.cantidad_total)
    const snapshotId = Number(snap.lastInsertRowid)
    const lineas = db.prepare(`
      SELECT tipo_bulto, cantidad_bultos, unidades_por_bulto, cantidad_suelta,
             ubicacion, ubicacion_id, total_unidades, orden
      FROM stock_lineas WHERE stock_sector_id = ?
      ORDER BY orden, id
    `).all(ss.id) as Array<{
      tipo_bulto: string
      cantidad_bultos: number | null
      unidades_por_bulto: number | null
      cantidad_suelta: number | null
      ubicacion: string | null
      ubicacion_id: number | null
      total_unidades: number
      orden: number
    }>

    for (const l of lineas) {
      insertLinea.run(
        snapshotId,
        l.tipo_bulto,
        l.cantidad_bultos,
        l.unidades_por_bulto,
        l.cantidad_suelta,
        l.ubicacion,
        l.ubicacion_id,
        l.total_unidades,
        l.orden
      )
    }

    if (lineas.length === 0 && Number(ss.cantidad_total) > 0) {
      const { botellasPorCaja } = getProductoDefaults(db, ss.producto_id)
      insertLinea.run(
        snapshotId,
        'CAJA',
        ss.cantidad_total,
        botellasPorCaja,
        null,
        null,
        null,
        ss.cantidad_total,
        0
      )
    }
  }
}

function snapshotLineaToConteoRow(
  l: Record<string, unknown>,
  botellasPorCaja: number
): ConteoLineaRow {
  const tipo = String(l.tipo_bulto ?? 'CAJA')
  let cantidad_bultos = l.cantidad_bultos as number | null
  let unidades_por_bulto = l.unidades_por_bulto as number | null
  let cantidad_suelta = l.cantidad_suelta as number | null
  const totalStored = Number(l.total_unidades ?? 0)

  if (tipo === 'SUELTO') {
    if ((!cantidad_suelta || Number(cantidad_suelta) <= 0) && totalStored > 0) {
      cantidad_suelta = totalStored
    }
  } else {
    const hasBultos = cantidad_bultos != null && Number(cantidad_bultos) > 0
    const hasPorBulto = unidades_por_bulto != null && Number(unidades_por_bulto) > 0
    if (!hasBultos && !hasPorBulto && totalStored > 0) {
      if (tipo === 'PALLET') {
        cantidad_bultos = 1
        unidades_por_bulto = totalStored
      } else {
        cantidad_bultos = totalStored
        unidades_por_bulto = botellasPorCaja
      }
    } else if (hasBultos && !hasPorBulto && totalStored > 0) {
      unidades_por_bulto =
        Math.round(totalStored / Number(cantidad_bultos)) || botellasPorCaja
    }
  }

  return {
    id: 0,
    inventario_sector_id: 0,
    producto_id: 0,
    contador_id: 0,
    ronda: 0,
    tipo_bulto: tipo,
    cantidad_bultos,
    unidades_por_bulto,
    cantidad_suelta,
    ubicacion: (l.ubicacion as string | null) ?? null,
    ubicacion_id: (l.ubicacion_id as number | null) ?? null,
    total_unidades: totalStored,
    orden: Number(l.orden ?? 0)
  }
}

function mapSnapshotLineas(
  lineas: Array<Record<string, unknown>>,
  botellasPorCaja: number,
  unidad: string,
  totalFallback = 0
) {
  let rows = lineas
  if (rows.length === 0 && totalFallback > 0) {
    rows = [
      {
        tipo_bulto: 'CAJA',
        cantidad_bultos: totalFallback,
        unidades_por_bulto: botellasPorCaja,
        cantidad_suelta: null,
        total_unidades: totalFallback,
        orden: 0
      }
    ]
  }

  return rows.map((l) => {
    const mapped = mapConteoLinea(snapshotLineaToConteoRow(l, botellasPorCaja), botellasPorCaja)
    return {
      tipo_bulto: mapped.tipo_bulto,
      cantidad_bultos: mapped.cantidad_bultos,
      unidades_por_bulto: mapped.unidades_por_bulto,
      cantidad_suelta: mapped.cantidad_suelta,
      ubicacion: mapped.ubicacion,
      ubicacion_id: mapped.ubicacion_id,
      etiqueta: formatEtiquetaLinea(
        {
          tipo_bulto: mapped.tipo_bulto as LineaDesgloseInput['tipo_bulto'],
          cantidad_bultos: mapped.cantidad_bultos,
          unidades_por_bulto: mapped.unidades_por_bulto,
          cantidad_suelta: mapped.cantidad_suelta
        },
        unidad
      ),
      total_unidades: mapped.total_unidades
    }
  })
}

function desgloseFromLineas(
  lineas: Array<{ etiqueta: string; total_unidades: number }>
): string {
  if (lineas.length === 0) return '—'
  return lineas.map((l) => `${l.etiqueta} (${l.total_unidades})`).join(' + ')
}

function getLineasAcordadasSector(
  db: Database.Database,
  inventarioSectorId: number,
  ronda: number
): Map<number, ConteoLineaRow[]> {
  const sector = getInventarioSector(db, inventarioSectorId)
  const contador1 = Number(sector.contador_1_id)
  const lineas = lineasDelContador(db, inventarioSectorId, contador1, ronda)
  const map = new Map<number, ConteoLineaRow[]>()
  for (const l of lineas) {
    const arr = map.get(l.producto_id) ?? []
    arr.push(l)
    map.set(l.producto_id, arr)
  }
  return map
}

function getSnapshotPorSector(
  db: Database.Database,
  sesionId: number,
  sectorId: number
): Map<number, { total: number; lineas: Array<Record<string, unknown>> }> {
  const snaps = db.prepare(`
    SELECT id, producto_id, cantidad_total FROM inventario_snapshot
    WHERE sesion_id = ? AND sector_id = ?
  `).all(sesionId, sectorId) as Array<{ id: number; producto_id: number; cantidad_total: number }>

  const map = new Map<number, { total: number; lineas: Array<Record<string, unknown>> }>()
  for (const s of snaps) {
    const lineas = db.prepare(`
      SELECT * FROM inventario_snapshot_lineas WHERE snapshot_id = ? ORDER BY orden, id
    `).all(s.id) as Array<Record<string, unknown>>
    map.set(s.producto_id, { total: Number(s.cantidad_total), lineas })
  }
  return map
}

export function compararVsSistema(db: Database.Database, sesionId: number) {
  const sectores = db.prepare(`
    SELECT isec.id, isec.sector_id, isec.ronda_actual, isec.estado,
           s.nombre AS sector_nombre
    FROM inventario_sectores isec
    JOIN sectores s ON s.id = isec.sector_id
    WHERE isec.sesion_id = ?
  `).all(sesionId) as Array<{
    id: number
    sector_id: number
    ronda_actual: number
    estado: string
    sector_nombre: string
  }>

  const pendientes = sectores.filter((s) => s.estado !== 'CERRADO_OK')
  if (pendientes.length > 0) {
    throw new Error(`Faltan ${pendientes.length} sector(es) por cerrar entre contadores`)
  }

  const items: Array<Record<string, unknown>> = []
  const productoIds = new Set<number>()

  for (const sec of sectores) {
    const contadoMap = getLineasAcordadasSector(db, sec.id, sec.ronda_actual)
    const sistemaMap = getSnapshotPorSector(db, sesionId, sec.sector_id)

    const ids = new Set([...contadoMap.keys(), ...sistemaMap.keys()])
    for (const productoId of ids) {
      productoIds.add(productoId)
      const prod = db.prepare(`
        SELECT codigo_interno, nombre, unidad FROM productos WHERE id = ?
      `).get(productoId) as { codigo_interno: string; nombre: string; unidad: string }
      const { botellasPorCaja } = getProductoDefaults(db, productoId)

      const contadoLineas = contadoMap.get(productoId) ?? []
      const sistemaData = sistemaMap.get(productoId)
      const sistemaLineas = sistemaData?.lineas ?? []

      const totalSistemaCajas = sistemaData?.total ?? 0
      const totalesContado = totalesDesdeLineasConteo(db, contadoLineas, productoId)
      const totalesSistema = totalesDesdeSnapshotLineas(
        db,
        productoId,
        sistemaLineas as Array<Record<string, unknown>>,
        totalSistemaCajas
      )

      const mappedContado = contadoLineas.map((l) => mapConteoLinea(l, botellasPorCaja))
      const mappedSistema = mapSnapshotLineas(
        sistemaLineas as Array<Record<string, unknown>>,
        botellasPorCaja,
        prod.unidad,
        totalSistemaCajas
      )

      const desgloseContado = desgloseFromLineas(mappedContado)
      const desgloseSistema = desgloseFromLineas(mappedSistema)
      const tipo = inventarioTipoDesdeTotales(
        totalesContado,
        totalesSistema,
        desgloseContado,
        desgloseSistema
      )

      items.push({
        producto_id: productoId,
        codigo_interno: prod.codigo_interno,
        nombre: prod.nombre,
        unidad: prod.unidad,
        botellas_por_caja: botellasPorCaja,
        inventario_sector_id: sec.id,
        sector_id: sec.sector_id,
        sector_nombre: sec.sector_nombre,
        total_sistema: totalesSistema.cajas,
        total_contado: totalesContado.cajas,
        total_suelto_sistema: totalesSistema.suelto,
        total_suelto_contado: totalesContado.suelto,
        resumen_sistema: formatTotalesInventarioResumen(totalesSistema, prod.unidad),
        resumen_contado: formatTotalesInventarioResumen(totalesContado, prod.unidad),
        diferencia: totalesContado.cajas - totalesSistema.cajas,
        diferencia_suelto: totalesContado.suelto - totalesSistema.suelto,
        desglose_sistema: desgloseSistema,
        desglose_contado: desgloseContado,
        lineas_contado: mappedContado,
        lineas_sistema: mappedSistema,
        tipo,
        requiere_ajuste: tipo !== 'SIN_CAMBIO'
      })
    }
  }

  const resumen = {
    productos_revisados: productoIds.size,
    sin_cambio: items.filter((i) => i.tipo === 'SIN_CAMBIO').length,
    ajustes_cantidad: items.filter((i) => i.tipo === 'FALTANTE' || i.tipo === 'SOBRANTE').length,
    reorganizaciones: items.filter((i) => i.tipo === 'REORGANIZACION').length,
    con_ajuste: items.filter((i) => i.requiere_ajuste).length
  }

  return { resumen, items }
}

function getOrCreateStockSector(
  db: Database.Database,
  productoId: number,
  sectorId: number
): number {
  let row = db.prepare(`
    SELECT id FROM stock_sector WHERE producto_id = ? AND sector_id = ?
  `).get(productoId, sectorId) as { id: number } | undefined
  if (!row) {
    const result = db.prepare(`
      INSERT INTO stock_sector (producto_id, sector_id, cantidad_total) VALUES (?, ?, 0)
    `).run(productoId, sectorId)
    return Number(result.lastInsertRowid)
  }
  return row.id
}

function replaceStockFromConteo(
  db: Database.Database,
  productoId: number,
  sectorId: number,
  lineas: ConteoLineaRow[],
  usuarioId: number,
  sesionId: number
): void {
  const stockSectorId = getOrCreateStockSector(db, productoId, sectorId)
  const antesRow = db.prepare(`
    SELECT cantidad_total FROM stock_sector WHERE id = ?
  `).get(stockSectorId) as { cantidad_total: number } | undefined
  const cajasAntes = Number(antesRow?.cantidad_total ?? 0)

  db.prepare('DELETE FROM stock_lineas WHERE stock_sector_id = ?').run(stockSectorId)

  const insert = db.prepare(`
    INSERT INTO stock_lineas (
      stock_sector_id, tipo_bulto, cantidad_bultos, unidades_por_bulto,
      cantidad_suelta, ubicacion, ubicacion_id, total_unidades, orden
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  let orden = 0
  for (const l of lineas) {
    insert.run(
      stockSectorId,
      l.tipo_bulto,
      l.cantidad_bultos,
      l.unidades_por_bulto,
      l.cantidad_suelta,
      l.ubicacion,
      l.ubicacion_id,
      l.total_unidades,
      orden++
    )
  }

  refreshStockSectorTotal(db, stockSectorId)

  const despuesRow = db.prepare(`
    SELECT cantidad_total FROM stock_sector WHERE id = ?
  `).get(stockSectorId) as { cantidad_total: number }
  const deltaCajas = Number(despuesRow.cantidad_total) - cajasAntes
  if (Math.abs(deltaCajas) > 0.0001) {
    db.prepare(`
      INSERT INTO movimientos (
        tipo, producto_id, cantidad, sector_destino_id,
        documento_tipo, documento_id, usuario_id, observacion
      ) VALUES ('AJUSTE_INVENTARIO', ?, ?, ?, 'inventario', ?, ?, ?)
    `).run(
      productoId,
      deltaCajas,
      sectorId,
      sesionId,
      usuarioId,
      `Ajuste por inventario sesión #${sesionId}`
    )
  }
}

function inventarioTipoDesdeTotales(
  contado: TotalesInventarioDesglose,
  sistema: TotalesInventarioDesglose,
  desgloseContado: string,
  desgloseSistema: string
): string {
  const cajasDif = contado.cajas - sistema.cajas
  const sueltoDif = contado.suelto - sistema.suelto
  if (Math.abs(cajasDif) > 0.0001) {
    return cajasDif > 0 ? 'SOBRANTE' : 'FALTANTE'
  }
  if (Math.abs(sueltoDif) > 0.0001) {
    return sueltoDif > 0 ? 'SOBRANTE' : 'FALTANTE'
  }
  if (
    desgloseContado !== desgloseSistema &&
    (contado.cajas > 0 ||
      contado.suelto > 0 ||
      sistema.cajas > 0 ||
      sistema.suelto > 0)
  ) {
    return 'REORGANIZACION'
  }
  return 'SIN_CAMBIO'
}

function calcTipoComparacion(
  totalAplicado: TotalesInventarioDesglose,
  totalSistema: TotalesInventarioDesglose,
  desgloseAplicado: string,
  desgloseSistema: string
): string {
  return inventarioTipoDesdeTotales(
    totalAplicado,
    totalSistema,
    desgloseAplicado,
    desgloseSistema
  )
}

function lineasManualesToRows(
  db: Database.Database,
  productoId: number,
  lineas: Array<Omit<ConteoLineaInput, 'producto_id'>>
): ConteoLineaRow[] {
  const rows: ConteoLineaRow[] = []
  let orden = 0
  for (const raw of lineas) {
    const { total, linea } = validarYCalcularLinea(db, productoId, {
      ...raw,
      producto_id: productoId
    })
    rows.push({
      id: 0,
      inventario_sector_id: 0,
      producto_id: productoId,
      contador_id: 0,
      ronda: 0,
      tipo_bulto: linea.tipo_bulto,
      cantidad_bultos: linea.cantidad_bultos ?? null,
      unidades_por_bulto: linea.unidades_por_bulto ?? null,
      cantidad_suelta: linea.cantidad_suelta ?? null,
      ubicacion: raw.ubicacion ?? null,
      ubicacion_id: raw.ubicacion_id ?? null,
      total_unidades: total,
      orden: orden++
    })
  }
  return rows
}

function validarDecisionesCierre(
  db: Database.Database,
  comparacion: ReturnType<typeof compararVsSistema>,
  decisiones: CierreDecisionInput[]
): Map<string, CierreDecisionInput> {
  const map = new Map<string, CierreDecisionInput>()
  const itemsConAjuste = new Set(
    comparacion.items
      .filter((i) => i.requiere_ajuste)
      .map((i) => cierreDecisionKey(Number(i.producto_id), Number(i.sector_id)))
  )

  for (const d of decisiones) {
    const key = cierreDecisionKey(d.producto_id, d.sector_id)
    if (!itemsConAjuste.has(key)) {
      throw new Error(
        `Decisión inválida para producto #${d.producto_id} en sector #${d.sector_id}`
      )
    }
    if (!['CONTADO', 'SISTEMA', 'MANUAL'].includes(d.modo)) {
      throw new Error(`Modo de cierre inválido: ${String(d.modo)}`)
    }
    if (d.modo === 'MANUAL') {
      if (!Array.isArray(d.lineas)) {
        throw new Error(
          `Faltan líneas manuales para producto #${d.producto_id} en sector #${d.sector_id}`
        )
      }
      lineasManualesToRows(db, d.producto_id, d.lineas)
    }
    map.set(key, d)
  }

  return map
}

export function aplicarCierreInventario(
  db: Database.Database,
  sesionId: number,
  usuarioId: number,
  decisiones: CierreDecisionInput[] = []
) {
  const comparacion = compararVsSistema(db, sesionId)
  const decisionMap = validarDecisionesCierre(db, comparacion, decisiones)
  const ajustes: Array<Record<string, unknown>> = []
  const detalleFinal: Array<Record<string, unknown>> = []
  let resumenFinal = comparacion.resumen

  const sectores = db.prepare(`
    SELECT id, sector_id, ronda_actual FROM inventario_sectores WHERE sesion_id = ?
  `).all(sesionId) as Array<{ id: number; sector_id: number; ronda_actual: number }>

  const tx = db.transaction(() => {
    db.prepare(`
      DELETE FROM inventario_diferencias
      WHERE sesion_id = ? AND tipo IN ('CANTIDAD', 'REORGANIZACION', 'FALTANTE', 'SOBRANTE')
    `).run(sesionId)

    for (const sec of sectores) {
      const contadoMap = getLineasAcordadasSector(db, sec.id, sec.ronda_actual)
      const sistemaMap = getSnapshotPorSector(db, sesionId, sec.sector_id)
      const productoIds = new Set([...contadoMap.keys(), ...sistemaMap.keys()])

      for (const productoId of productoIds) {
        const contadoLineas = contadoMap.get(productoId) ?? []
        const sistemaData = sistemaMap.get(productoId)
        const sistemaLineas = sistemaData?.lineas ?? []
        const totalesSistema = totalesDesdeSnapshotLineas(
          db,
          productoId,
          sistemaLineas as Array<Record<string, unknown>>,
          sistemaData?.total ?? 0
        )

        const item = comparacion.items.find(
          (i) => i.producto_id === productoId && i.sector_id === sec.sector_id
        )
        if (!item) continue

        const key = cierreDecisionKey(productoId, sec.sector_id)
        const decision = decisionMap.get(key)
        const modo: CierreDecisionModo = decision?.modo ?? 'CONTADO'

        const detalleItem: Record<string, unknown> = {
          ...item,
          decision_modo: modo
        }

        if (!item.requiere_ajuste) {
          detalleFinal.push(detalleItem)
          continue
        }

        if (modo === 'SISTEMA') {
          detalleItem.tipo = 'SIN_CAMBIO'
          detalleItem.requiere_ajuste = false
          detalleItem.total_aplicado = totalesSistema.cajas
          detalleItem.total_suelto_aplicado = totalesSistema.suelto
          detalleItem.resumen_aplicado = item.resumen_sistema
          detalleItem.desglose_aplicado = item.desglose_sistema
          detalleFinal.push(detalleItem)
          continue
        }

        let lineasFinales: ConteoLineaRow[]
        if (modo === 'MANUAL') {
          lineasFinales = lineasManualesToRows(db, productoId, decision!.lineas ?? [])
        } else {
          lineasFinales = contadoLineas
        }

        const totalesAplicado = totalesDesdeLineasConteo(db, lineasFinales, productoId)
        const { botellasPorCaja } = getProductoDefaults(db, productoId)
        const prod = db.prepare('SELECT unidad FROM productos WHERE id = ?').get(productoId) as
          | { unidad: string }
          | undefined
        const mappedAplicado = lineasFinales.map((l) =>
          mapConteoLinea(l, botellasPorCaja)
        )
        const desgloseAplicado = desgloseFromLineas(mappedAplicado)
        const resumenAplicado = formatTotalesInventarioResumen(
          totalesAplicado,
          prod?.unidad
        )
        const tipoFinal = calcTipoComparacion(
          totalesAplicado,
          totalesSistema,
          desgloseAplicado,
          String(item.desglose_sistema ?? '—')
        )

        detalleItem.tipo = tipoFinal
        detalleItem.requiere_ajuste = tipoFinal !== 'SIN_CAMBIO'
        detalleItem.total_aplicado = totalesAplicado.cajas
        detalleItem.total_suelto_aplicado = totalesAplicado.suelto
        detalleItem.resumen_aplicado = resumenAplicado
        detalleItem.desglose_aplicado = desgloseAplicado
        detalleItem.diferencia_aplicada = totalesAplicado.cajas - totalesSistema.cajas
        detalleItem.diferencia_suelto_aplicada =
          totalesAplicado.suelto - totalesSistema.suelto
        detalleFinal.push(detalleItem)

        if (tipoFinal === 'SIN_CAMBIO') continue

        replaceStockFromConteo(
          db,
          productoId,
          sec.sector_id,
          lineasFinales,
          usuarioId,
          sesionId
        )
        ajustes.push({
          producto_id: productoId,
          sector_id: sec.sector_id,
          antes: totalesSistema.cajas,
          despues: totalesAplicado.cajas,
          tipo: tipoFinal,
          decision_modo: modo
        })

        const tipoDb =
          tipoFinal === 'REORGANIZACION'
            ? 'REORGANIZACION'
            : tipoFinal === 'SOBRANTE'
              ? 'SOBRANTE'
              : tipoFinal === 'FALTANTE'
                ? 'FALTANTE'
                : 'CANTIDAD'

        db.prepare(`
          INSERT INTO inventario_diferencias (
            sesion_id, inventario_sector_id, producto_id, tipo, sector_id,
            cantidad_contada, cantidad_sistema, diferencia,
            desglose_sistema, desglose_contado, resuelta
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `).run(
          sesionId,
          sec.id,
          productoId,
          tipoDb,
          sec.sector_id,
          totalesAplicado.cajas,
          totalesSistema.cajas,
          totalesAplicado.cajas - totalesSistema.cajas,
          item.desglose_sistema ?? '',
          desgloseAplicado
        )
      }
    }

    resumenFinal = {
      productos_revisados: comparacion.resumen.productos_revisados,
      sin_cambio: detalleFinal.filter((i) => i.tipo === 'SIN_CAMBIO').length,
      ajustes_cantidad: detalleFinal.filter(
        (i) => i.tipo === 'FALTANTE' || i.tipo === 'SOBRANTE'
      ).length,
      reorganizaciones: detalleFinal.filter((i) => i.tipo === 'REORGANIZACION').length,
      con_ajuste: detalleFinal.filter((i) => i.requiere_ajuste).length,
      mantener_sistema: detalleFinal.filter((i) => i.decision_modo === 'SISTEMA').length,
      correccion_manual: detalleFinal.filter((i) => i.decision_modo === 'MANUAL').length
    }

    db.prepare(`
      UPDATE inventario_sesiones
      SET estado = 'CERRADA', cerrado_por_id = ?, fecha_cierre = datetime('now')
      WHERE id = ?
    `).run(usuarioId, sesionId)

    db.prepare(`
      INSERT INTO inventario_reportes (sesion_id, cerrado_por_id, resumen, detalle, ajustes_aplicados)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      sesionId,
      usuarioId,
      JSON.stringify(resumenFinal),
      JSON.stringify(detalleFinal),
      JSON.stringify(ajustes)
    )
  })

  tx()
  return { comparacion: { resumen: resumenFinal, items: detalleFinal }, ajustes }
}

export function validarYCalcularLinea(
  db: Database.Database,
  productoId: number,
  linea: ConteoLineaInput
): { total: number; linea: LineaDesgloseInput } {
  const err = validateLineaDesglose(linea)
  if (err) throw new Error(err)
  const prod = db.prepare('SELECT id, activo FROM productos WHERE id = ?').get(productoId) as
    | { id: number; activo: number }
    | undefined
  if (!prod || !prod.activo) throw new Error('Producto no válido o inactivo')
  const { botellasPorCaja } = getProductoDefaults(db, productoId)
  const total =
    linea.tipo_bulto === 'SUELTO'
      ? calcTotalUnidades(linea)
      : calcTotalInventarioLinea(linea, botellasPorCaja)
  if (total <= 0) throw new Error('La cantidad debe ser mayor a cero')
  return { total, linea }
}
