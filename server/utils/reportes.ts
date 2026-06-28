import type Database from 'better-sqlite3'
import { getProductoDefaults, lineaTotalEnCajas } from './stock'

export interface MovimientosDiaReport {
  fecha_desde: string
  fecha_hasta: string
  stock_inicial: number
  ingresos: number
  retornos: number
  planillas: number
  roturas: number
  balance_final: number
  perdidos_retornos: number
}

export interface RetornoPerdidoDiaItem {
  retorno_id: number
  codigo_interno: string
  nombre: string
  sector_nombre: string
  cantidad_cajas: number
  estado: string
}

export type ReporteDetalleTipo =
  | 'ingresos'
  | 'retornos'
  | 'planillas'
  | 'roturas'
  | 'stock_inicial'
  | 'balance_final'

export interface ReporteDetalleItem {
  codigo_interno: string
  nombre: string
  cantidad_cajas: number
}

export interface ReporteDetalle {
  tipo: ReporteDetalleTipo
  titulo: string
  fecha_desde: string
  fecha_hasta: string
  total: number
  items: ReporteDetalleItem[]
}

type LineaStockRow = {
  producto_id: number
  codigo_interno?: string
  nombre?: string
  tipo_bulto: string
  cantidad_bultos: number | null
  unidades_por_bulto: number | null
  cantidad_suelta: number | null
  total_unidades: number
  cantidad_cajas?: number | null
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function todayIsoDateLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addIsoDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + days)
  const ny = date.getFullYear()
  const nm = String(date.getMonth() + 1).padStart(2, '0')
  const nd = String(date.getDate()).padStart(2, '0')
  return `${ny}-${nm}-${nd}`
}

export function resolveReporteDateRange(
  fechaDesde?: string,
  fechaHasta?: string,
  today = todayIsoDateLocal()
): { desde: string; hasta: string } {
  let desde = fechaDesde?.trim() ?? ''
  let hasta = fechaHasta?.trim() ?? ''

  if (desde && !ISO_DATE.test(desde)) throw new Error('Fecha desde inválida')
  if (hasta && !ISO_DATE.test(hasta)) throw new Error('Fecha hasta inválida')

  if (desde && !hasta) hasta = desde
  else if (hasta && !desde) desde = hasta
  else if (!desde && !hasta) {
    desde = today
    hasta = today
  }

  if (desde > hasta) [desde, hasta] = [hasta, desde]
  return { desde, hasta }
}

function roundCajas(n: number): number {
  return Math.round(n * 1000) / 1000
}

function lineaEnCajas(db: Database.Database, row: LineaStockRow): number {
  if (row.cantidad_cajas != null) return Number(row.cantidad_cajas)
  const { botellasPorCaja } = getProductoDefaults(db, row.producto_id)
  return lineaTotalEnCajas(row, botellasPorCaja)
}

function getStockTotalCajas(db: Database.Database): number {
  const row = db.prepare(`
    SELECT COALESCE(SUM(cantidad_total), 0) AS total FROM stock_sector
  `).get() as { total: number }
  return row.total
}

function sumIngresoCajasInRange(db: Database.Database, desde: string, hasta: string): number {
  const rows = db.prepare(`
    SELECT
      il.producto_id, il.tipo_bulto, il.cantidad_bultos, il.unidades_por_bulto,
      il.cantidad_suelta, il.total_unidades
    FROM ingreso_lineas il
    JOIN ingresos i ON i.id = il.ingreso_id
    WHERE i.fecha >= ? AND i.fecha <= ?
  `).all(desde, hasta) as LineaStockRow[]
  return rows.reduce((sum, row) => sum + lineaEnCajas(db, row), 0)
}

function sumIngresoCajasAfter(db: Database.Database, fecha: string): number {
  const rows = db.prepare(`
    SELECT
      il.producto_id, il.tipo_bulto, il.cantidad_bultos, il.unidades_por_bulto,
      il.cantidad_suelta, il.total_unidades
    FROM ingreso_lineas il
    JOIN ingresos i ON i.id = il.ingreso_id
    WHERE i.fecha > ?
  `).all(fecha) as LineaStockRow[]
  return rows.reduce((sum, row) => sum + lineaEnCajas(db, row), 0)
}

function sumPlanillaCajasInRange(db: Database.Database, desde: string, hasta: string): number {
  const rows = db.prepare(`
    SELECT
      pl.producto_id, pl.tipo_bulto, pl.cantidad_bultos, pl.unidades_por_bulto,
      pl.cantidad_suelta, pl.total_unidades
    FROM planilla_lineas pl
    JOIN planillas p ON p.id = pl.planilla_id
    WHERE p.fecha >= ? AND p.fecha <= ?
  `).all(desde, hasta) as LineaStockRow[]
  return rows.reduce((sum, row) => sum + lineaEnCajas(db, row), 0)
}

function sumPlanillaCajasAfter(db: Database.Database, fecha: string): number {
  const rows = db.prepare(`
    SELECT
      pl.producto_id, pl.tipo_bulto, pl.cantidad_bultos, pl.unidades_por_bulto,
      pl.cantidad_suelta, pl.total_unidades
    FROM planilla_lineas pl
    JOIN planillas p ON p.id = pl.planilla_id
    WHERE p.fecha > ?
  `).all(fecha) as LineaStockRow[]
  return rows.reduce((sum, row) => sum + lineaEnCajas(db, row), 0)
}

function sumRetornoCajasBuenEstadoInRange(db: Database.Database, desde: string, hasta: string): number {
  const rows = db.prepare(`
    SELECT
      rl.producto_id,
      rl.tipo_bulto,
      rl.cantidad_bultos,
      rl.unidades_por_bulto,
      rl.cantidad_suelta,
      COALESCE(rl.cantidad_verificada, rl.total_unidades) AS total_unidades
    FROM retorno_lineas rl
    JOIN retornos r ON r.id = rl.retorno_id
    WHERE r.estado = 'VERIFICADO'
      AND r.fecha >= ? AND r.fecha <= ?
      AND COALESCE(rl.estado_verificado, rl.estado_condicion) = 'BUEN_ESTADO'
      AND rl.linea_verificada = 1
  `).all(desde, hasta) as LineaStockRow[]

  return rows.reduce((sum, row) => {
    const { botellasPorCaja } = getProductoDefaults(db, row.producto_id)
    return sum + lineaTotalEnCajas(row, botellasPorCaja)
  }, 0)
}

function sumRetornoCajasBuenEstadoAfter(db: Database.Database, fecha: string): number {
  const rows = db.prepare(`
    SELECT
      rl.producto_id,
      rl.tipo_bulto,
      rl.cantidad_bultos,
      rl.unidades_por_bulto,
      rl.cantidad_suelta,
      COALESCE(rl.cantidad_verificada, rl.total_unidades) AS total_unidades
    FROM retorno_lineas rl
    JOIN retornos r ON r.id = rl.retorno_id
    WHERE r.estado = 'VERIFICADO'
      AND r.fecha > ?
      AND COALESCE(rl.estado_verificado, rl.estado_condicion) = 'BUEN_ESTADO'
      AND rl.linea_verificada = 1
  `).all(fecha) as LineaStockRow[]

  return rows.reduce((sum, row) => {
    const { botellasPorCaja } = getProductoDefaults(db, row.producto_id)
    return sum + lineaTotalEnCajas(row, botellasPorCaja)
  }, 0)
}

function sumRoturaCajasInRange(db: Database.Database, desde: string, hasta: string): number {
  const row = db.prepare(`
    SELECT COALESCE(SUM(rl.cantidad_cajas), 0) AS total
    FROM rotura_lineas rl
    JOIN roturas r ON r.id = rl.rotura_id
    WHERE r.fecha >= ? AND r.fecha <= ?
  `).get(desde, hasta) as { total: number }
  return row.total
}

function sumRoturaCajasAfter(db: Database.Database, fecha: string): number {
  const row = db.prepare(`
    SELECT COALESCE(SUM(rl.cantidad_cajas), 0) AS total
    FROM rotura_lineas rl
    JOIN roturas r ON r.id = rl.rotura_id
    WHERE r.fecha > ?
  `).get(fecha) as { total: number }
  return row.total
}

function netMovimientoAfterDate(db: Database.Database, fecha: string): number {
  const ingresos = sumIngresoCajasAfter(db, fecha)
  const retornos = sumRetornoCajasBuenEstadoAfter(db, fecha)
  const planillas = sumPlanillaCajasAfter(db, fecha)
  const roturas = sumRoturaCajasAfter(db, fecha)
  return ingresos + retornos - planillas - roturas
}

/** Stock al cierre del día `fecha` (incluye movimientos de ese día). */
function getStockAtEndOfDay(db: Database.Database, fecha: string, today: string): number {
  if (fecha > today) return 0
  if (fecha >= today) return getStockTotalCajas(db)
  return getStockTotalCajas(db) - netMovimientoAfterDate(db, fecha)
}

/** Stock al inicio del día `fecha` (antes de movimientos de ese día). */
function getStockAtStartOfDay(db: Database.Database, fecha: string, today: string): number {
  return getStockAtEndOfDay(db, addIsoDays(fecha, -1), today)
}

function aggregateByProducto(
  db: Database.Database,
  rows: LineaStockRow[]
): ReporteDetalleItem[] {
  const map = new Map<number, ReporteDetalleItem>()

  for (const row of rows) {
    const cajas = lineaEnCajas(db, row)
    if (cajas <= 0) continue
    const existing = map.get(row.producto_id)
    if (existing) {
      existing.cantidad_cajas = roundCajas(existing.cantidad_cajas + cajas)
    } else {
      map.set(row.producto_id, {
        codigo_interno: row.codigo_interno ?? '',
        nombre: row.nombre ?? '',
        cantidad_cajas: roundCajas(cajas)
      })
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
  )
}

function detalleIngresos(
  db: Database.Database,
  desde: string,
  hasta: string
): ReporteDetalleItem[] {
  const rows = db.prepare(`
    SELECT
      il.producto_id, p.codigo_interno, p.nombre,
      il.tipo_bulto, il.cantidad_bultos, il.unidades_por_bulto,
      il.cantidad_suelta, il.total_unidades
    FROM ingreso_lineas il
    JOIN ingresos i ON i.id = il.ingreso_id
    JOIN productos p ON p.id = il.producto_id
    WHERE i.fecha >= ? AND i.fecha <= ?
  `).all(desde, hasta) as LineaStockRow[]
  return aggregateByProducto(db, rows)
}

function detallePlanillas(
  db: Database.Database,
  desde: string,
  hasta: string
): ReporteDetalleItem[] {
  const rows = db.prepare(`
    SELECT
      pl.producto_id, pr.codigo_interno, pr.nombre,
      pl.tipo_bulto, pl.cantidad_bultos, pl.unidades_por_bulto,
      pl.cantidad_suelta, pl.total_unidades
    FROM planilla_lineas pl
    JOIN planillas pln ON pln.id = pl.planilla_id
    JOIN productos pr ON pr.id = pl.producto_id
    WHERE pln.fecha >= ? AND pln.fecha <= ?
  `).all(desde, hasta) as LineaStockRow[]
  return aggregateByProducto(db, rows)
}

function itemsToMap(items: ReporteDetalleItem[]): Map<string, ReporteDetalleItem> {
  const map = new Map<string, ReporteDetalleItem>()
  for (const item of items) {
    const key = item.codigo_interno || item.nombre
    const existing = map.get(key)
    if (existing) {
      existing.cantidad_cajas = roundCajas(existing.cantidad_cajas + item.cantidad_cajas)
    } else {
      map.set(key, { ...item })
    }
  }
  return map
}

function qtyFromMap(map: Map<string, ReporteDetalleItem>, key: string): number {
  return map.get(key)?.cantidad_cajas ?? 0
}

function detalleStockInicial(
  db: Database.Database,
  desde: string,
  hasta: string
): ReporteDetalleItem[] {
  const actual = itemsToMap(detalleStockPorProducto(db))
  const ingresos = itemsToMap(detalleIngresos(db, desde, hasta))
  const retornos = itemsToMap(detalleRetornos(db, desde, hasta))
  const planillas = itemsToMap(detallePlanillas(db, desde, hasta))
  const roturas = itemsToMap(detalleRoturas(db, desde, hasta))

  const keys = new Set<string>([
    ...actual.keys(),
    ...ingresos.keys(),
    ...retornos.keys(),
    ...planillas.keys(),
    ...roturas.keys()
  ])

  const items: ReporteDetalleItem[] = []

  for (const key of keys) {
    const ref =
      actual.get(key) ??
      ingresos.get(key) ??
      retornos.get(key) ??
      planillas.get(key) ??
      roturas.get(key)
    if (!ref) continue

    const net =
      qtyFromMap(ingresos, key) +
      qtyFromMap(retornos, key) -
      qtyFromMap(planillas, key) -
      qtyFromMap(roturas, key)
    const inicial = roundCajas(qtyFromMap(actual, key) - net)
    if (inicial <= 0) continue

    items.push({
      codigo_interno: ref.codigo_interno,
      nombre: ref.nombre,
      cantidad_cajas: inicial
    })
  }

  return items.sort((a, b) =>
    a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
  )
}

function detalleRetornos(
  db: Database.Database,
  desde: string,
  hasta: string
): ReporteDetalleItem[] {
  const rows = db.prepare(`
    SELECT
      rl.producto_id, p.codigo_interno, p.nombre,
      rl.tipo_bulto, rl.cantidad_bultos, rl.unidades_por_bulto,
      rl.cantidad_suelta,
      COALESCE(rl.cantidad_verificada, rl.total_unidades) AS total_unidades
    FROM retorno_lineas rl
    JOIN retornos r ON r.id = rl.retorno_id
    JOIN productos p ON p.id = rl.producto_id
    WHERE r.estado = 'VERIFICADO'
      AND r.fecha >= ? AND r.fecha <= ?
      AND COALESCE(rl.estado_verificado, rl.estado_condicion) = 'BUEN_ESTADO'
      AND rl.linea_verificada = 1
  `).all(desde, hasta) as LineaStockRow[]
  return aggregateByProducto(db, rows)
}

function detalleRoturas(
  db: Database.Database,
  desde: string,
  hasta: string
): ReporteDetalleItem[] {
  const rows = db.prepare(`
    SELECT
      rl.producto_id, p.codigo_interno, p.nombre,
      rl.cantidad_cajas
    FROM rotura_lineas rl
    JOIN roturas r ON r.id = rl.rotura_id
    JOIN productos p ON p.id = rl.producto_id
    WHERE r.fecha >= ? AND r.fecha <= ?
  `).all(desde, hasta) as LineaStockRow[]
  return aggregateByProducto(db, rows)
}

function detalleStockPorProducto(db: Database.Database): ReporteDetalleItem[] {
  const rows = db.prepare(`
    SELECT
      p.id AS producto_id,
      p.codigo_interno,
      p.nombre,
      COALESCE(SUM(ss.cantidad_total), 0) AS cantidad_cajas
    FROM productos p
    JOIN stock_sector ss ON ss.producto_id = p.id
    WHERE p.activo = 1 AND ss.cantidad_total > 0
    GROUP BY p.id
    ORDER BY p.nombre COLLATE NOCASE ASC
  `).all() as LineaStockRow[]

  return rows.map((row) => ({
    codigo_interno: row.codigo_interno ?? '',
    nombre: row.nombre ?? '',
    cantidad_cajas: roundCajas(Number(row.cantidad_cajas ?? 0))
  }))
}

const DETALLE_TITULOS: Record<ReporteDetalleTipo, string> = {
  ingresos: 'Ingresos',
  retornos: 'Retornos y devoluciones',
  planillas: 'Carga de planillas',
  roturas: 'Roturas y pérdidas',
  stock_inicial: 'Stock inicial',
  balance_final: 'Balance final'
}

export function getMovimientosDiaReport(
  db: Database.Database,
  fechaDesde?: string,
  fechaHasta?: string
): MovimientosDiaReport {
  const today = todayIsoDateLocal()
  const { desde, hasta } = resolveReporteDateRange(fechaDesde, fechaHasta, today)

  const ingresos = sumIngresoCajasInRange(db, desde, hasta)
  const retornos = sumRetornoCajasBuenEstadoInRange(db, desde, hasta)
  const planillas = sumPlanillaCajasInRange(db, desde, hasta)
  const roturas = sumRoturaCajasInRange(db, desde, hasta)

  const stock_inicial = Math.max(0, getStockAtStartOfDay(db, desde, today))
  const balance_final = Math.max(0, getStockAtEndOfDay(db, hasta, today))

  const perdidosRow = db.prepare(`
    SELECT COALESCE(SUM(
      CASE
        WHEN rl.linea_verificada = 1 AND COALESCE(rl.cantidad_verificada, rl.total_unidades) > 0
        THEN COALESCE(rl.cantidad_verificada, rl.total_unidades)
        ELSE rl.total_unidades
      END
    ), 0) AS total
    FROM retorno_lineas rl
    JOIN retornos r ON r.id = rl.retorno_id
    WHERE r.fecha >= ? AND r.fecha <= ?
      AND r.estado = 'VERIFICADO'
      AND COALESCE(rl.estado_verificado, rl.estado_condicion) IN ('INCOMPLETA', 'MAL_ESTADO')
  `).get(desde, hasta) as { total: number }

  return {
    fecha_desde: desde,
    fecha_hasta: hasta,
    stock_inicial: roundCajas(stock_inicial),
    ingresos: roundCajas(ingresos),
    retornos: roundCajas(retornos),
    planillas: roundCajas(planillas),
    roturas: roundCajas(roturas),
    balance_final: roundCajas(balance_final),
    perdidos_retornos: roundCajas(perdidosRow.total)
  }
}

export function getReporteDetalle(
  db: Database.Database,
  tipo: ReporteDetalleTipo,
  fechaDesde?: string,
  fechaHasta?: string
): ReporteDetalle {
  const today = todayIsoDateLocal()
  const { desde, hasta } = resolveReporteDateRange(fechaDesde, fechaHasta, today)
  const report = getMovimientosDiaReport(db, desde, hasta)

  let items: ReporteDetalleItem[] = []
  let total = 0

  switch (tipo) {
    case 'ingresos':
      items = detalleIngresos(db, desde, hasta)
      total = report.ingresos
      break
    case 'retornos':
      items = detalleRetornos(db, desde, hasta)
      total = report.retornos
      break
    case 'planillas':
      items = detallePlanillas(db, desde, hasta)
      total = report.planillas
      break
    case 'roturas':
      items = detalleRoturas(db, desde, hasta)
      total = report.roturas
      break
    case 'stock_inicial':
      total = report.stock_inicial
      items = detalleStockInicial(db, desde, hasta)
      break
    case 'balance_final':
      total = report.balance_final
      items = detalleStockPorProducto(db)
      break
  }

  return {
    tipo,
    titulo: DETALLE_TITULOS[tipo],
    fecha_desde: desde,
    fecha_hasta: hasta,
    total,
    items
  }
}

export function getRetornosPerdidosDia(
  db: Database.Database,
  fechaDesde?: string,
  fechaHasta?: string
): RetornoPerdidoDiaItem[] {
  const { desde, hasta } = resolveReporteDateRange(fechaDesde, fechaHasta)

  return db.prepare(`
    SELECT
      r.id AS retorno_id,
      p.codigo_interno,
      p.nombre,
      s.nombre AS sector_nombre,
      CASE
        WHEN rl.linea_verificada = 1 THEN COALESCE(rl.cantidad_verificada, rl.total_unidades)
        ELSE rl.total_unidades
      END AS cantidad_cajas,
      COALESCE(rl.estado_verificado, rl.estado_condicion) AS estado
    FROM retorno_lineas rl
    JOIN retornos r ON r.id = rl.retorno_id
    JOIN productos p ON p.id = rl.producto_id
    JOIN sectores s ON s.id = rl.sector_id
    WHERE r.fecha >= ? AND r.fecha <= ?
      AND r.estado = 'VERIFICADO'
      AND COALESCE(rl.estado_verificado, rl.estado_condicion) IN ('INCOMPLETA', 'MAL_ESTADO')
    ORDER BY r.fecha ASC, p.nombre COLLATE NOCASE ASC, rl.id ASC
  `).all(desde, hasta) as RetornoPerdidoDiaItem[]
}
