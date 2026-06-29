import type Database from 'better-sqlite3'

export type TipoBulto = 'PALLET' | 'CAJA' | 'SUELTO'
export type ModoSalidaPlanilla = 'CAJA' | 'BOTELLA'

export interface LineaDesgloseInput {
  tipo_bulto: TipoBulto
  cantidad_bultos?: number | null
  unidades_por_bulto?: number | null
  cantidad_suelta?: number | null
}

export function calcTotalUnidades(linea: LineaDesgloseInput): number {
  if (linea.tipo_bulto === 'SUELTO') {
    return Number(linea.cantidad_suelta ?? 0)
  }
  const fromBultos =
    Number(linea.cantidad_bultos ?? 0) * Number(linea.unidades_por_bulto ?? 0)
  const extraSuelto = Number(linea.cantidad_suelta ?? 0)
  return fromBultos + extraSuelto
}

export function calcTotalEnCajas(
  linea: LineaDesgloseInput,
  botellasPorCaja = 6
): number {
  if (linea.tipo_bulto === 'PALLET') {
    return Number(linea.cantidad_bultos ?? 0) * Number(linea.unidades_por_bulto ?? 0)
  }
  if (linea.tipo_bulto === 'CAJA') {
    const b = Number(linea.cantidad_bultos ?? 0)
    const u = Number(linea.unidades_por_bulto ?? 0)
    if (b === 1 && u > 0 && u < botellasPorCaja) return 1
    return b
  }
  if (linea.tipo_bulto === 'SUELTO') {
    return Number(linea.cantidad_suelta ?? 0) > 0 ? 1 : 0
  }
  return 0
}

export function lineaTotalEnCajas(
  linea: {
    tipo_bulto: string
    cantidad_bultos?: number | null
    unidades_por_bulto?: number | null
    total_unidades?: number
    cantidad_suelta?: number | null
  },
  botellasPorCaja: number
): number {
  const u = Number(linea.unidades_por_bulto ?? 0)
  if (linea.tipo_bulto === 'PALLET') {
    return Number(linea.total_unidades ?? 0)
  }
  if (linea.tipo_bulto === 'CAJA') {
    if (linea.cantidad_bultos === 1 && u > 0 && u < botellasPorCaja) return 1
    if (Number(linea.cantidad_bultos ?? 0) > 0) {
      return Number(linea.cantidad_bultos ?? 0)
    }
  }
  if (linea.tipo_bulto === 'SUELTO') {
    return Number(linea.cantidad_suelta ?? linea.total_unidades ?? 0) > 0 ? 1 : 0
  }
  return 0
}

export function recalcAllStockSectorTotals(db: Database.Database): void {
  const sectors = db.prepare('SELECT id FROM stock_sector').all() as { id: number }[]
  for (const sector of sectors) {
    refreshStockSectorTotal(db, sector.id)
  }
}

export function recalcIngresoLineasTotalesEnCajas(db: Database.Database): void {
  const rows = db.prepare(`
    SELECT
      il.id, il.producto_id, il.tipo_bulto,
      il.cantidad_bultos, il.unidades_por_bulto, il.cantidad_suelta
    FROM ingreso_lineas il
  `).all() as Array<{
    id: number
    producto_id: number
    tipo_bulto: TipoBulto
    cantidad_bultos: number | null
    unidades_por_bulto: number | null
    cantidad_suelta: number | null
  }>

  const update = db.prepare('UPDATE ingreso_lineas SET total_unidades = ? WHERE id = ?')
  for (const row of rows) {
    const { botellasPorCaja } = getProductoDefaults(db, row.producto_id)
    const total = calcTotalEnCajas(
      {
        tipo_bulto: row.tipo_bulto,
        cantidad_bultos: row.cantidad_bultos,
        unidades_por_bulto: row.unidades_por_bulto,
        cantidad_suelta: row.cantidad_suelta
      },
      botellasPorCaja
    )
    update.run(total, row.id)
  }
}

export function recalcStockTotalsEnCajas(db: Database.Database): void {
  recalcIngresoLineasTotalesEnCajas(db)
  recalcAllStockSectorTotals(db)
}

export function normalizarUnidadProducto(unidad?: string | null): string {
  const u = (unidad ?? '').trim().toLowerCase()
  if (!u || u === 'unidad') return 'botella'
  return u
}

export function botellasPorCajaDefault(unidadesPorCajaDefault?: number | null): number {
  return unidadesPorCajaDefault && unidadesPorCajaDefault > 0 ? unidadesPorCajaDefault : 6
}

export function cajasPorPalletDefault(unidadesPorPalletDefault?: number | null): number {
  return unidadesPorPalletDefault && unidadesPorPalletDefault > 0 ? unidadesPorPalletDefault : 112
}

export function getProductoDefaults(
  db: Database.Database,
  producto_id: number
): { unidad: string; botellasPorCaja: number; cajasPorPallet: number } {
  const row = db.prepare(`
    SELECT unidad, unidades_por_pallet_default, unidades_por_caja_default
    FROM productos WHERE id = ?
  `).get(producto_id) as
    | {
        unidad: string
        unidades_por_pallet_default: number | null
        unidades_por_caja_default: number | null
      }
    | undefined

  return {
    unidad: row?.unidad ?? 'botella',
    botellasPorCaja: botellasPorCajaDefault(row?.unidades_por_caja_default),
    cajasPorPallet: cajasPorPalletDefault(row?.unidades_por_pallet_default)
  }
}

export function formatCantidadUnidad(cantidad: number, unidad?: string | null): string {
  return `${cantidad} ${normalizarUnidadProducto(unidad)}`
}

export function getProductoUnidad(db: Database.Database, producto_id: number): string {
  const row = db.prepare('SELECT unidad FROM productos WHERE id = ?').get(producto_id) as
    | { unidad: string }
    | undefined
  return row?.unidad ?? 'unidad'
}

export function formatEtiquetaLinea(
  linea: LineaDesgloseInput,
  unidadProducto?: string | null
): string {
  const unidad = normalizarUnidadProducto(unidadProducto)
  const bultos = Number(linea.cantidad_bultos ?? 0)
  const porBulto = Number(linea.unidades_por_bulto ?? 0)

  if (linea.tipo_bulto === 'PALLET') {
    return `${bultos} pallet × ${porBulto} cajas`
  }
  if (linea.tipo_bulto === 'CAJA') {
    return `${bultos} caja × ${porBulto} ${unidad}`
  }
  if (linea.tipo_bulto === 'SUELTO') {
    return formatCantidadUnidad(Number(linea.cantidad_suelta ?? 0), unidadProducto)
  }
  return `${bultos} × ${porBulto}`
}

export function formatPlanillaEtiqueta(
  modo: ModoSalidaPlanilla,
  cantidad: number,
  unidadProducto?: string | null
): string {
  if (modo === 'CAJA') {
    return `${cantidad} caja${cantidad === 1 ? '' : 's'}`
  }
  const unidad = normalizarUnidadProducto(unidadProducto)
  return `${cantidad} ${unidad}${cantidad === 1 ? '' : 's'}`
}

export function validateLineaDesglose(linea: LineaDesgloseInput): string | null {
  if (linea.tipo_bulto === 'SUELTO') {
    if (!linea.cantidad_suelta || linea.cantidad_suelta <= 0) {
      return 'Indicá la cantidad de unidades'
    }
    return null
  }
  if (!linea.cantidad_bultos || linea.cantidad_bultos <= 0) {
    return 'Indicá la cantidad de bultos'
  }
  if (!linea.unidades_por_bulto || linea.unidades_por_bulto <= 0) {
    return 'Indicá las unidades por bulto'
  }
  return null
}

export interface PlanillaLineaResolved extends LineaDesgloseInput {
  total_unidades: number
  etiqueta: string
  modo_salida: ModoSalidaPlanilla
  unidades_por_bulto_referencia: number | null
  tipo_bulto_referencia: 'PALLET' | 'CAJA' | null
}

export function resolvePlanillaLineaModo(
  db: Database.Database,
  producto_id: number,
  modo: ModoSalidaPlanilla,
  cantidad: number
): PlanillaLineaResolved {
  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    throw new Error('La cantidad debe ser mayor a cero')
  }

  const { unidad, botellasPorCaja } = getProductoDefaults(db, producto_id)

  if (modo === 'CAJA') {
    const linea: LineaDesgloseInput = {
      tipo_bulto: 'CAJA',
      cantidad_bultos: cantidad,
      unidades_por_bulto: botellasPorCaja
    }
    return {
      ...linea,
      total_unidades: cantidad,
      etiqueta: formatPlanillaEtiqueta('CAJA', cantidad, unidad),
      modo_salida: 'CAJA',
      unidades_por_bulto_referencia: botellasPorCaja,
      tipo_bulto_referencia: 'CAJA'
    }
  }

  const linea: LineaDesgloseInput = {
    tipo_bulto: 'CAJA',
    cantidad_bultos: 1,
    unidades_por_bulto: cantidad
  }
  return {
    ...linea,
    total_unidades: cantidad,
    etiqueta: formatPlanillaEtiqueta('BOTELLA', cantidad, unidad),
    modo_salida: 'BOTELLA',
    unidades_por_bulto_referencia: botellasPorCaja,
    tipo_bulto_referencia: 'CAJA'
  }
}

function findUnidadesPorBultoReferencia(
  db: Database.Database,
  producto_id: number
): { unidades_por_bulto: number; tipo_bulto: 'PALLET' | 'CAJA' } | null {
  const fromStock = db.prepare(`
    SELECT sl.tipo_bulto, sl.unidades_por_bulto, COUNT(*) AS cnt
    FROM stock_lineas sl
    JOIN stock_sector ss ON ss.id = sl.stock_sector_id
    JOIN sectores s ON s.id = ss.sector_id
    WHERE ss.producto_id = ? AND ss.cantidad_total > 0
      AND sl.tipo_bulto IN ('PALLET', 'CAJA')
      AND sl.unidades_por_bulto > 0
    GROUP BY sl.tipo_bulto, sl.unidades_por_bulto
    ORDER BY
      MAX(s.es_sector_descuento) DESC,
      MIN(COALESCE(s.prioridad_descuento, 9999)) ASC,
      cnt DESC,
      CASE sl.tipo_bulto WHEN 'PALLET' THEN 0 ELSE 1 END,
      sl.unidades_por_bulto DESC
    LIMIT 1
  `).get(producto_id) as
    | { tipo_bulto: 'PALLET' | 'CAJA'; unidades_por_bulto: number }
    | undefined

  if (fromStock) {
    return {
      unidades_por_bulto: fromStock.unidades_por_bulto,
      tipo_bulto: fromStock.tipo_bulto
    }
  }

  const prod = db.prepare(`
    SELECT unidades_por_pallet_default, unidades_por_caja_default
    FROM productos WHERE id = ?
  `).get(producto_id) as
    | {
        unidades_por_pallet_default: number | null
        unidades_por_caja_default: number | null
      }
    | undefined

  if (prod?.unidades_por_pallet_default) {
    return {
      unidades_por_bulto: prod.unidades_por_pallet_default,
      tipo_bulto: 'PALLET'
    }
  }
  if (prod?.unidades_por_caja_default) {
    return {
      unidades_por_bulto: prod.unidades_por_caja_default,
      tipo_bulto: 'CAJA'
    }
  }

  const fromIngreso = db.prepare(`
    SELECT il.tipo_bulto, il.unidades_por_bulto, COUNT(*) AS cnt
    FROM ingreso_lineas il
    WHERE il.producto_id = ? AND il.tipo_bulto IN ('PALLET', 'CAJA')
      AND il.unidades_por_bulto > 0
    GROUP BY il.tipo_bulto, il.unidades_por_bulto
    ORDER BY
      cnt DESC,
      CASE il.tipo_bulto WHEN 'PALLET' THEN 0 ELSE 1 END,
      il.unidades_por_bulto DESC
    LIMIT 1
  `).get(producto_id) as
    | { tipo_bulto: 'PALLET' | 'CAJA'; unidades_por_bulto: number }
    | undefined

  if (fromIngreso) {
    return {
      unidades_por_bulto: fromIngreso.unidades_por_bulto,
      tipo_bulto: fromIngreso.tipo_bulto
    }
  }

  return null
}

export interface ReferenciaBulto {
  tipo_bulto: 'PALLET' | 'CAJA'
  unidades_por_bulto: number
}

export function findReferenciasBultoProducto(
  db: Database.Database,
  producto_id: number
): ReferenciaBulto[] {
  const fromDb = db.prepare(`
    SELECT tipo_bulto, unidades_por_bulto, SUM(cnt) AS total_cnt
    FROM (
      SELECT sl.tipo_bulto, sl.unidades_por_bulto, 1 AS cnt
      FROM stock_lineas sl
      JOIN stock_sector ss ON ss.id = sl.stock_sector_id
      WHERE ss.producto_id = ? AND sl.tipo_bulto IN ('PALLET', 'CAJA')
        AND sl.unidades_por_bulto > 0
      UNION ALL
      SELECT il.tipo_bulto, il.unidades_por_bulto, 1 AS cnt
      FROM ingreso_lineas il
      WHERE il.producto_id = ? AND il.tipo_bulto IN ('PALLET', 'CAJA')
        AND il.unidades_por_bulto > 0
    )
    GROUP BY tipo_bulto, unidades_por_bulto
    ORDER BY
      total_cnt DESC,
      CASE tipo_bulto WHEN 'PALLET' THEN 0 ELSE 1 END,
      unidades_por_bulto DESC
  `).all(producto_id, producto_id) as Array<
    ReferenciaBulto & { total_cnt: number }
  >

  const seen = new Set<string>()
  const refs: ReferenciaBulto[] = []

  for (const row of fromDb) {
    const key = `${row.tipo_bulto}:${row.unidades_por_bulto}`
    if (seen.has(key)) continue
    seen.add(key)
    refs.push({ tipo_bulto: row.tipo_bulto, unidades_por_bulto: row.unidades_por_bulto })
  }

  const prod = db.prepare(`
    SELECT unidades_por_pallet_default, unidades_por_caja_default
    FROM productos WHERE id = ?
  `).get(producto_id) as
    | {
        unidades_por_pallet_default: number | null
        unidades_por_caja_default: number | null
      }
    | undefined

  if (prod?.unidades_por_pallet_default) {
    const key = `PALLET:${prod.unidades_por_pallet_default}`
    if (!seen.has(key)) {
      refs.push({
        tipo_bulto: 'PALLET',
        unidades_por_bulto: prod.unidades_por_pallet_default
      })
    }
  }
  if (prod?.unidades_por_caja_default) {
    const key = `CAJA:${prod.unidades_por_caja_default}`
    if (!seen.has(key)) {
      refs.push({
        tipo_bulto: 'CAJA',
        unidades_por_bulto: prod.unidades_por_caja_default
      })
    }
  }

  return refs
}

export interface ReorganizarLineaInfo {
  puede: boolean
  motivo?: string
  total_unidades: number
  referencias_bulto: ReferenciaBulto[]
}

export interface ReorganizarDesgloseInput {
  bultos: Array<{
    tipo_bulto: 'PALLET' | 'CAJA'
    cantidad_bultos: number
    unidades_por_bulto: number
  }>
  /** Unidades sueltas (cajas, botellas, etc.) */
  unidades_sueltas: number
}

export function getReorganizarLineaInfo(
  db: Database.Database,
  producto_id: number,
  linea: {
    tipo_bulto: string
    total_unidades: number
    cantidad_bultos?: number | null
    unidades_por_bulto?: number | null
    cantidad_suelta?: number | null
  }
): ReorganizarLineaInfo | null {
  if (!['SUELTO', 'PALLET', 'CAJA'].includes(linea.tipo_bulto)) return null

  const { botellasPorCaja } = getProductoDefaults(db, producto_id)
  const referencias = findReferenciasBultoProducto(db, producto_id)
  const total =
    linea.tipo_bulto === 'SUELTO'
      ? linea.total_unidades
      : lineaTotalEnCajas(linea, botellasPorCaja)

  if (total <= 0) {
    return {
      puede: false,
      motivo: 'Sin unidades para reorganizar',
      total_unidades: 0,
      referencias_bulto: referencias
    }
  }

  return {
    puede: true,
    total_unidades: total,
    referencias_bulto: referencias
  }
}

export function getReorganizarSectorInfo(
  db: Database.Database,
  producto_id: number,
  totalCajas: number
): ReorganizarLineaInfo {
  const referencias = findReferenciasBultoProducto(db, producto_id)

  if (totalCajas <= 0) {
    return {
      puede: false,
      motivo: 'Sin stock para reorganizar',
      total_unidades: 0,
      referencias_bulto: referencias
    }
  }

  return {
    puede: true,
    total_unidades: totalCajas,
    referencias_bulto: referencias
  }
}

function applyReorganizarDesgloseToStockSector(
  db: Database.Database,
  params: {
    stock_sector_id: number
    producto_id: number
    desglose: ReorganizarDesgloseInput
    ubicacion_id: number | null
    ubicacion: string | null
    startOrden: number
    sueltosModo: 'cajas' | 'botellas'
  }
): number {
  const { botellasPorCaja } = getProductoDefaults(db, params.producto_id)
  let orden = params.startOrden

  for (const b of params.desglose.bultos) {
    orden += 1
    const lineTotal = b.cantidad_bultos * b.unidades_por_bulto
    db.prepare(`
      INSERT INTO stock_lineas (
        stock_sector_id, tipo_bulto, cantidad_bultos, unidades_por_bulto,
        cantidad_suelta, ubicacion, ubicacion_id, total_unidades, orden
      ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)
    `).run(
      params.stock_sector_id,
      b.tipo_bulto,
      b.cantidad_bultos,
      b.unidades_por_bulto,
      params.ubicacion,
      params.ubicacion_id,
      lineTotal,
      orden
    )
  }

  if (params.desglose.unidades_sueltas > 0) {
    if (params.sueltosModo === 'botellas') {
      addPartialBultoToStockSector(
        db,
        params.stock_sector_id,
        'CAJA',
        params.desglose.unidades_sueltas,
        params.ubicacion_id,
        params.ubicacion
      )
    } else {
      addCajasFullToStockSector(
        db,
        params.stock_sector_id,
        params.desglose.unidades_sueltas,
        botellasPorCaja,
        params.ubicacion_id,
        params.ubicacion
      )
    }
  }

  refreshStockSectorTotal(db, params.stock_sector_id)
  return orden
}

function formatReorganizarEtiqueta(
  desglose: ReorganizarDesgloseInput,
  unidadProducto: string
): string {
  const partes: string[] = desglose.bultos.map((b) => formatEtiquetaLinea(b))
    if (desglose.unidades_sueltas > 0) {
      partes.push(
        formatEtiquetaLinea({
          tipo_bulto: 'CAJA',
          cantidad_bultos: 1,
          unidades_por_bulto: desglose.unidades_sueltas
        })
      )
    }
  return partes.join(' + ') || 'vacío'
}

function validateReorganizarDesglose(
  total: number,
  desglose: ReorganizarDesgloseInput
): string | null {
  if (!Number.isFinite(total) || total <= 0) {
    return 'Total inválido'
  }

  if (!Number.isFinite(desglose.unidades_sueltas) || desglose.unidades_sueltas < 0) {
    return 'La cantidad de unidades debe ser cero o mayor'
  }

  if (desglose.bultos.length === 0 && desglose.unidades_sueltas === 0) {
    return 'Agregá al menos pallets o unidades'
  }

  let asignado = desglose.unidades_sueltas
  for (const b of desglose.bultos) {
    if (b.cantidad_bultos <= 0 || !Number.isInteger(b.cantidad_bultos)) {
      return 'Cada línea debe tener cantidad entera mayor a cero'
    }
    if (b.unidades_por_bulto <= 0 || !Number.isInteger(b.unidades_por_bulto)) {
      return 'Las unidades por pallet deben ser un entero mayor a cero'
    }
    if (b.tipo_bulto !== 'PALLET') {
      return 'La reorganización solo admite líneas de pallet'
    }
    asignado += b.cantidad_bultos * b.unidades_por_bulto
  }

  if (asignado !== total) {
    return `La suma (${asignado} u) debe coincidir con el total (${total} u)`
  }

  return null
}

export function reorganizeStockLine(
  db: Database.Database,
  lineaId: number,
  usuario_id: number,
  desglose: ReorganizarDesgloseInput
): { etiqueta_resultante: string } {
  const linea = db.prepare(`
    SELECT
      sl.id, sl.tipo_bulto, sl.total_unidades, sl.stock_sector_id,
      sl.cantidad_bultos, sl.unidades_por_bulto, sl.cantidad_suelta,
      sl.ubicacion_id, sl.ubicacion,
      ss.producto_id, ss.sector_id
    FROM stock_lineas sl
    JOIN stock_sector ss ON ss.id = sl.stock_sector_id
    WHERE sl.id = ?
  `).get(lineaId) as
    | {
        id: number
        tipo_bulto: string
        total_unidades: number
        cantidad_bultos: number | null
        unidades_por_bulto: number | null
        cantidad_suelta: number | null
        stock_sector_id: number
        ubicacion_id: number | null
        ubicacion: string | null
        producto_id: number
        sector_id: number
      }
    | undefined

  if (!linea) throw new Error('Línea de stock no encontrada')
  if (!['SUELTO', 'PALLET', 'CAJA'].includes(linea.tipo_bulto)) {
    throw new Error('Tipo de línea no reorganizable')
  }

  const { botellasPorCaja } = getProductoDefaults(db, linea.producto_id)
  const totalParaValidar =
    linea.tipo_bulto === 'SUELTO'
      ? linea.total_unidades
      : lineaTotalEnCajas(linea, botellasPorCaja)

  const validationError = validateReorganizarDesglose(totalParaValidar, desglose)
  if (validationError) throw new Error(validationError)

  const unidad = getProductoUnidad(db, linea.producto_id)
  const etiqueta_resultante = formatReorganizarEtiqueta(desglose, unidad)
  const totalAnteriorEtiqueta =
    linea.tipo_bulto === 'SUELTO'
      ? `${linea.total_unidades} u`
      : formatEtiquetaLinea(
          {
            tipo_bulto: linea.tipo_bulto as 'PALLET' | 'CAJA' | 'SUELTO',
            cantidad_bultos: linea.cantidad_bultos,
            unidades_por_bulto: linea.unidades_por_bulto,
            cantidad_suelta: linea.cantidad_suelta
          },
          unidad
        )

  const tx = db.transaction(() => {
    const maxOrden = db.prepare(`
      SELECT COALESCE(MAX(orden), 0) AS m FROM stock_lineas WHERE stock_sector_id = ?
    `).get(linea.stock_sector_id) as { m: number }

    db.prepare('DELETE FROM stock_lineas WHERE id = ?').run(lineaId)

    applyReorganizarDesgloseToStockSector(db, {
      stock_sector_id: linea.stock_sector_id,
      producto_id: linea.producto_id,
      desglose,
      ubicacion_id: linea.ubicacion_id,
      ubicacion: linea.ubicacion,
      startOrden: maxOrden.m,
      sueltosModo: linea.tipo_bulto === 'SUELTO' ? 'botellas' : 'cajas'
    })

    db.prepare(`
      INSERT INTO movimientos (
        tipo, producto_id, cantidad, sector_origen_id,
        documento_tipo, documento_id, usuario_id, observacion
      ) VALUES ('AJUSTE', ?, 0, ?, 'stock_linea', ?, ?, ?)
    `).run(
      linea.producto_id,
      linea.sector_id,
      lineaId,
      usuario_id,
      `Reorganización: ${totalAnteriorEtiqueta} → ${etiqueta_resultante}`
    )
  })

  tx()
  return { etiqueta_resultante }
}

export function reorganizeStockSector(
  db: Database.Database,
  stockSectorId: number,
  usuario_id: number,
  desglose: ReorganizarDesgloseInput
): { etiqueta_resultante: string } {
  const sector = db.prepare(`
    SELECT ss.id, ss.producto_id, ss.sector_id
    FROM stock_sector ss WHERE ss.id = ?
  `).get(stockSectorId) as
    | { id: number; producto_id: number; sector_id: number }
    | undefined

  if (!sector) throw new Error('Stock del sector no encontrado')

  const lineas = db.prepare(`
    SELECT
      id, tipo_bulto, cantidad_bultos, unidades_por_bulto, cantidad_suelta,
      total_unidades, ubicacion_id, ubicacion
    FROM stock_lineas WHERE stock_sector_id = ?
    ORDER BY orden ASC, id ASC
  `).all(stockSectorId) as Array<{
    id: number
    tipo_bulto: string
    cantidad_bultos: number | null
    unidades_por_bulto: number | null
    cantidad_suelta: number | null
    total_unidades: number
    ubicacion_id: number | null
    ubicacion: string | null
  }>

  const { botellasPorCaja } = getProductoDefaults(db, sector.producto_id)
  const totalCajas = lineas.reduce(
    (sum, row) => sum + lineaTotalEnCajas(row, botellasPorCaja),
    0
  )

  const validationError = validateReorganizarDesglose(totalCajas, desglose)
  if (validationError) throw new Error(validationError)

  const unidad = getProductoUnidad(db, sector.producto_id)
  const etiqueta_resultante = formatReorganizarEtiqueta(desglose, unidad)
  const etiquetasAnteriores = lineas
    .map((row) =>
      formatEtiquetaLinea(
        {
          tipo_bulto: row.tipo_bulto as 'PALLET' | 'CAJA' | 'SUELTO',
          cantidad_bultos: row.cantidad_bultos,
          unidades_por_bulto: row.unidades_por_bulto,
          cantidad_suelta: row.cantidad_suelta
        },
        unidad
      )
    )
    .join(' + ')

  const ubicacionIds = [...new Set(lineas.map((l) => l.ubicacion_id))]
  const ubicacion_id = ubicacionIds.length === 1 ? ubicacionIds[0] ?? null : null
  const ubicacion =
    ubicacion_id != null && lineas.length > 0
      ? lineas.find((l) => l.ubicacion_id === ubicacion_id)?.ubicacion ?? null
      : null

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM stock_lineas WHERE stock_sector_id = ?').run(stockSectorId)

    applyReorganizarDesgloseToStockSector(db, {
      stock_sector_id: stockSectorId,
      producto_id: sector.producto_id,
      desglose,
      ubicacion_id,
      ubicacion,
      startOrden: 0,
      sueltosModo: 'cajas'
    })

    db.prepare(`
      INSERT INTO movimientos (
        tipo, producto_id, cantidad, sector_origen_id,
        documento_tipo, documento_id, usuario_id, observacion
      ) VALUES ('AJUSTE', ?, 0, ?, 'stock_sector', ?, ?, ?)
    `).run(
      sector.producto_id,
      sector.sector_id,
      stockSectorId,
      usuario_id,
      `Reorganización sector: ${etiquetasAnteriores || `${totalCajas} cajas`} → ${etiqueta_resultante}`
    )
  })

  tx()
  return { etiqueta_resultante }
}

/** @deprecated Use reorganizeStockLine */
export function reorganizeSueltoLine(
  db: Database.Database,
  lineaId: number,
  usuario_id: number,
  desglose: ReorganizarDesgloseInput
): { etiqueta_resultante: string } {
  return reorganizeStockLine(db, lineaId, usuario_id, desglose)
}

export function resolvePlanillaLineaFromTotal(
  db: Database.Database,
  producto_id: number,
  total: number
): PlanillaLineaResolved {
  if (!Number.isFinite(total) || total <= 0) {
    throw new Error('La cantidad debe ser mayor a cero')
  }

  const unidad = getProductoUnidad(db, producto_id)
  const ref = findUnidadesPorBultoReferencia(db, producto_id)

  if (!ref || ref.unidades_por_bulto <= 0) {
    const linea: LineaDesgloseInput = {
      tipo_bulto: 'SUELTO',
      cantidad_suelta: total
    }
    return {
      ...linea,
      total_unidades: total,
      etiqueta: formatEtiquetaLinea(linea, unidad),
      modo_salida: 'BOTELLA',
      unidades_por_bulto_referencia: null,
      tipo_bulto_referencia: null
    }
  }

  const { unidades_por_bulto: u, tipo_bulto } = ref
  const bultos = Math.floor(total / u)
  const suelto = total % u

  if (bultos === 0) {
    const linea: LineaDesgloseInput = {
      tipo_bulto: 'SUELTO',
      cantidad_suelta: total
    }
    return {
      ...linea,
      total_unidades: total,
      etiqueta: formatEtiquetaLinea(linea, unidad),
      modo_salida: 'BOTELLA',
      unidades_por_bulto_referencia: u,
      tipo_bulto_referencia: tipo_bulto
    }
  }

  const linea: LineaDesgloseInput = {
    tipo_bulto,
    cantidad_bultos: bultos,
    unidades_por_bulto: u,
    cantidad_suelta: suelto > 0 ? suelto : null
  }

  return {
    ...linea,
    total_unidades: total,
    etiqueta: formatEtiquetaLinea(linea, unidad),
    modo_salida: tipo_bulto === 'CAJA' ? 'CAJA' : 'BOTELLA',
    unidades_por_bulto_referencia: u,
    tipo_bulto_referencia: tipo_bulto
  }
}

export function applyIngresoLineToStock(
  db: Database.Database,
  params: {
    producto_id: number
    sector_id: number
    ubicacion_id: number | null
    ubicacion_nombre: string | null
    linea: LineaDesgloseInput
    ingreso_id: number
    usuario_id: number
    observacion: string | null
    orden: number
  }
): void {
  const { botellasPorCaja } = getProductoDefaults(db, params.producto_id)
  const totalStock = calcTotalUnidades(params.linea)
  const totalCajas = calcTotalEnCajas(params.linea, botellasPorCaja)
  if (totalStock <= 0 || totalCajas <= 0) throw new Error('Línea con total inválido')

  let stockSector = db.prepare(`
    SELECT id, cantidad_total FROM stock_sector
    WHERE producto_id = ? AND sector_id = ?
  `).get(params.producto_id, params.sector_id) as
    | { id: number; cantidad_total: number }
    | undefined

  if (!stockSector) {
    const result = db.prepare(`
      INSERT INTO stock_sector (producto_id, sector_id, cantidad_total)
      VALUES (?, ?, ?)
    `).run(params.producto_id, params.sector_id, totalCajas)
    stockSector = { id: Number(result.lastInsertRowid), cantidad_total: 0 }
  } else {
    db.prepare(`
      UPDATE stock_sector SET cantidad_total = cantidad_total + ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(totalCajas, stockSector.id)
  }

  const maxOrden = db.prepare(`
    SELECT COALESCE(MAX(orden), 0) AS m FROM stock_lineas WHERE stock_sector_id = ?
  `).get(stockSector.id) as { m: number }

  db.prepare(`
    INSERT INTO stock_lineas (
      stock_sector_id, tipo_bulto, cantidad_bultos, unidades_por_bulto,
      cantidad_suelta, ubicacion, ubicacion_id, total_unidades, orden
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    stockSector.id,
    params.linea.tipo_bulto,
    params.linea.tipo_bulto === 'SUELTO' ? null : params.linea.cantidad_bultos,
    params.linea.tipo_bulto === 'SUELTO' ? null : params.linea.unidades_por_bulto,
    params.linea.tipo_bulto === 'SUELTO' ? params.linea.cantidad_suelta : null,
    params.ubicacion_nombre,
    params.ubicacion_id,
    totalStock,
    maxOrden.m + 1
  )

  db.prepare(`
    INSERT INTO movimientos (
      tipo, producto_id, cantidad, sector_destino_id,
      documento_tipo, documento_id, usuario_id, observacion
    ) VALUES ('INGRESO', ?, ?, ?, 'ingreso', ?, ?, ?)
  `).run(
    params.producto_id,
    totalCajas,
    params.sector_id,
    params.ingreso_id,
    params.usuario_id,
    params.observacion
  )
}

export function applyRetornoLineToStock(
  db: Database.Database,
  params: {
    producto_id: number
    sector_id: number
    linea: LineaDesgloseInput
    retorno_id: number
    usuario_id: number
    camionero_id: number | null
    observacion: string | null
    orden: number
  }
): void {
  const { botellasPorCaja, cajasPorPallet } = getProductoDefaults(db, params.producto_id)
  const totalCajas = calcTotalEnCajas(params.linea, botellasPorCaja)
  if (totalCajas <= 0) throw new Error('Línea con total inválido')

  let stockSector = db.prepare(`
    SELECT id, cantidad_total FROM stock_sector
    WHERE producto_id = ? AND sector_id = ?
  `).get(params.producto_id, params.sector_id) as
    | { id: number; cantidad_total: number }
    | undefined

  if (!stockSector) {
    const result = db.prepare(`
      INSERT INTO stock_sector (producto_id, sector_id, cantidad_total)
      VALUES (?, ?, 0)
    `).run(params.producto_id, params.sector_id)
    stockSector = { id: Number(result.lastInsertRowid), cantidad_total: 0 }
  }

  if (params.linea.tipo_bulto === 'CAJA') {
    addCajasToStockSectorSmart(db, {
      stock_sector_id: stockSector.id,
      numCajas: totalCajas,
      botellasPorCaja,
      cajasPorPallet,
      ubicacion_id: null,
      ubicacion: null
    })
  } else {
    const totalStock = calcTotalUnidades(params.linea)
    const maxOrden = db.prepare(`
      SELECT COALESCE(MAX(orden), 0) AS m FROM stock_lineas WHERE stock_sector_id = ?
    `).get(stockSector.id) as { m: number }

    db.prepare(`
      INSERT INTO stock_lineas (
        stock_sector_id, tipo_bulto, cantidad_bultos, unidades_por_bulto,
        cantidad_suelta, ubicacion, ubicacion_id, total_unidades, orden
      ) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?)
    `).run(
      stockSector.id,
      params.linea.tipo_bulto,
      params.linea.cantidad_bultos,
      params.linea.unidades_por_bulto,
      null,
      totalStock,
      maxOrden.m + 1
    )
  }

  refreshStockSectorTotal(db, stockSector.id)

  db.prepare(`
    INSERT INTO movimientos (
      tipo, producto_id, cantidad, sector_destino_id,
      documento_tipo, documento_id, usuario_id, observacion, camionero_id
    ) VALUES ('RETORNO', ?, ?, ?, 'retorno', ?, ?, ?, ?)
  `).run(
    params.producto_id,
    totalCajas,
    params.sector_id,
    params.retorno_id,
    params.usuario_id,
    params.observacion,
    params.camionero_id
  )
}

export interface DescuentoAplicado {
  sector_id: number
  sector_nombre: string
  stock_linea_id: number | null
  unidades: number
  modo_salida: ModoSalidaPlanilla
  tipo_linea: TipoBulto
  etiqueta: string
}

interface StockSectorRow {
  stock_sector_id: number
  sector_id: number
  sector_nombre: string
  cantidad_total: number
  es_sector_descuento: number
  prioridad_descuento: number | null
}

interface StockLineaRow {
  id: number
  tipo_bulto: TipoBulto
  cantidad_bultos: number | null
  unidades_por_bulto: number | null
  cantidad_suelta: number | null
  total_unidades: number
}

function getSectorsOrderedForDeduction(
  db: Database.Database,
  producto_id: number
): StockSectorRow[] {
  const rows = db.prepare(`
    SELECT
      ss.id AS stock_sector_id,
      ss.sector_id,
      ss.cantidad_total,
      s.nombre AS sector_nombre,
      s.es_sector_descuento,
      s.prioridad_descuento
    FROM stock_sector ss
    JOIN sectores s ON s.id = ss.sector_id
    WHERE ss.producto_id = ? AND ss.cantidad_total > 0 AND s.activo = 1
  `).all(producto_id) as StockSectorRow[]

  const discount = rows
    .filter((r) => r.es_sector_descuento)
    .sort(
      (a, b) =>
        (a.prioridad_descuento ?? 9999) - (b.prioridad_descuento ?? 9999) ||
        a.sector_nombre.localeCompare(b.sector_nombre)
    )
  const rest = rows
    .filter((r) => !r.es_sector_descuento)
    .sort((a, b) => a.cantidad_total - b.cantidad_total || a.sector_nombre.localeCompare(b.sector_nombre))

  return [...discount, ...rest]
}

function isCajaParcial(linea: StockLineaRow, botellasPorCaja: number): boolean {
  return (
    linea.tipo_bulto === 'CAJA' &&
    linea.cantidad_bultos === 1 &&
    Number(linea.unidades_por_bulto ?? 0) > 0 &&
    Number(linea.unidades_por_bulto ?? 0) < botellasPorCaja
  )
}

function isCajaLlena(linea: StockLineaRow, botellasPorCaja: number): boolean {
  if (linea.tipo_bulto !== 'CAJA') return false
  if (isCajaParcial(linea, botellasPorCaja)) return false
  return Number(linea.cantidad_bultos ?? 0) > 0
}

function lineaCajasDisponibles(linea: StockLineaRow, botellasPorCaja: number): number {
  if (linea.tipo_bulto === 'PALLET') return linea.total_unidades
  if (isCajaLlena(linea, botellasPorCaja)) return Number(linea.cantidad_bultos ?? 0)
  return 0
}

function lineaBotellasDisponibles(linea: StockLineaRow, botellasPorCaja: number): number {
  if (linea.tipo_bulto === 'PALLET') return linea.total_unidades * botellasPorCaja
  if (linea.tipo_bulto === 'CAJA') return linea.total_unidades
  if (linea.tipo_bulto === 'SUELTO') return linea.total_unidades
  return 0
}

export function getStockDisponibleModo(
  db: Database.Database,
  producto_id: number,
  modo: ModoSalidaPlanilla
): number {
  const { botellasPorCaja } = getProductoDefaults(db, producto_id)
  const lineas = db.prepare(`
    SELECT sl.tipo_bulto, sl.cantidad_bultos, sl.unidades_por_bulto, sl.total_unidades
    FROM stock_lineas sl
    JOIN stock_sector ss ON ss.id = sl.stock_sector_id
    WHERE ss.producto_id = ? AND ss.cantidad_total > 0
  `).all(producto_id) as StockLineaRow[]

  if (modo === 'CAJA') {
    return lineas.reduce((sum, l) => sum + lineaCajasDisponibles(l, botellasPorCaja), 0)
  }
  return lineas.reduce((sum, l) => sum + lineaBotellasDisponibles(l, botellasPorCaja), 0)
}

function simulateSectorDeduction(
  db: Database.Database,
  stock_sector_id: number,
  sector_nombre: string,
  sector_id: number,
  amount: number,
  modo: ModoSalidaPlanilla,
  unidadProducto: string,
  botellasPorCaja: number
): { descuentos: DescuentoAplicado[]; remaining: number } {
  const lineas = db.prepare(`
    SELECT id, tipo_bulto, cantidad_bultos, unidades_por_bulto, cantidad_suelta, total_unidades
    FROM stock_lineas
    WHERE stock_sector_id = ?
  `).all(stock_sector_id) as StockLineaRow[]

  const ordered =
    modo === 'CAJA'
      ? [...lineas].sort((a, b) => {
          const aPallet = a.tipo_bulto === 'PALLET' ? 1 : 0
          const bPallet = b.tipo_bulto === 'PALLET' ? 1 : 0
          if (aPallet !== bPallet) return aPallet - bPallet
          return lineaCajasDisponibles(a, botellasPorCaja) - lineaCajasDisponibles(b, botellasPorCaja)
        })
      : [...lineas].sort((a, b) => {
          const aPartial = isCajaParcial(a, botellasPorCaja) ? 0 : 1
          const bPartial = isCajaParcial(b, botellasPorCaja) ? 0 : 1
          if (aPartial !== bPartial) return aPartial - bPartial
          const aPallet = a.tipo_bulto === 'PALLET' ? 1 : 0
          const bPallet = b.tipo_bulto === 'PALLET' ? 1 : 0
          if (aPallet !== bPallet) return aPallet - bPallet
          return lineaBotellasDisponibles(a, botellasPorCaja) - lineaBotellasDisponibles(b, botellasPorCaja)
        })

  let remaining = amount
  const descuentos: DescuentoAplicado[] = []

  for (const linea of ordered) {
    if (remaining <= 0) break

    const disponible =
      modo === 'CAJA'
        ? lineaCajasDisponibles(linea, botellasPorCaja)
        : lineaBotellasDisponibles(linea, botellasPorCaja)

    if (disponible <= 0) continue

    const take = Math.min(disponible, remaining)
    if (take <= 0) continue

    descuentos.push({
      sector_id,
      sector_nombre,
      stock_linea_id: linea.id,
      unidades: take,
      modo_salida: modo,
      tipo_linea: linea.tipo_bulto,
      etiqueta: formatEtiquetaLinea(
        {
          tipo_bulto: linea.tipo_bulto,
          cantidad_bultos: linea.cantidad_bultos,
          unidades_por_bulto: linea.unidades_por_bulto,
          cantidad_suelta: linea.cantidad_suelta
        },
        unidadProducto
      )
    })
    remaining -= take
  }

  return { descuentos, remaining }
}

function deductCajasFromCajaLines(
  db: Database.Database,
  stock_sector_id: number,
  takeCajas: number,
  botellasPorCaja: number
): number {
  if (takeCajas <= 0) return 0

  const lines = db.prepare(`
    SELECT id, cantidad_bultos, unidades_por_bulto, total_unidades
    FROM stock_lineas
    WHERE stock_sector_id = ? AND tipo_bulto = 'CAJA'
      AND unidades_por_bulto = ?
      AND cantidad_bultos IS NOT NULL AND cantidad_bultos > 0
    ORDER BY cantidad_bultos DESC
  `).all(stock_sector_id, botellasPorCaja) as StockLineaRow[]

  let remaining = takeCajas
  for (const line of lines) {
    if (remaining <= 0) break
    const lineCajas = lineaTotalEnCajas(line, botellasPorCaja)
    if (lineCajas <= 0) continue
    const take = Math.min(remaining, lineCajas)
    applyCajaLineDeductionCajas(db, { ...line, stock_sector_id }, take)
    remaining -= take
  }
  return takeCajas - remaining
}

function setPalletLineCajas(
  db: Database.Database,
  lineId: number,
  totalCajas: number,
  cajasPorPallet: number,
  stock_sector_id: number,
  botellasPorCaja: number,
  ubicacion_id: number | null,
  ubicacion: string | null
): void {
  if (totalCajas <= 0) {
    db.prepare('DELETE FROM stock_lineas WHERE id = ?').run(lineId)
    return
  }

  const fullPallets = Math.floor(totalCajas / cajasPorPallet)
  const loose = totalCajas % cajasPorPallet

  if (loose === 0) {
    db.prepare(`
      UPDATE stock_lineas SET
        cantidad_bultos = ?, unidades_por_bulto = ?, total_unidades = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(fullPallets, cajasPorPallet, fullPallets * cajasPorPallet, lineId)
    return
  }

  if (fullPallets > 0) {
    db.prepare(`
      UPDATE stock_lineas SET
        cantidad_bultos = ?, unidades_por_bulto = ?, total_unidades = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(fullPallets, cajasPorPallet, fullPallets * cajasPorPallet, lineId)
    addCajasFullToStockSector(db, stock_sector_id, loose, botellasPorCaja, ubicacion_id, ubicacion)
    return
  }

  db.prepare(`
    UPDATE stock_lineas SET
      cantidad_bultos = 1, unidades_por_bulto = ?, total_unidades = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(cajasPorPallet, totalCajas, lineId)
}

function incrementFullPalletLine(
  db: Database.Database,
  stock_sector_id: number,
  numPallets: number,
  cajasPorPallet: number,
  ubicacion_id: number | null,
  ubicacion: string | null
): void {
  if (numPallets <= 0 || cajasPorPallet <= 0) return

  const existing = db.prepare(`
    SELECT id, cantidad_bultos, total_unidades
    FROM stock_lineas
    WHERE stock_sector_id = ? AND tipo_bulto = 'PALLET' AND unidades_por_bulto = ?
      AND (
        (ubicacion_id IS NULL AND ? IS NULL)
        OR ubicacion_id = ?
      )
  `).get(stock_sector_id, cajasPorPallet, ubicacion_id, ubicacion_id) as
    | { id: number; cantidad_bultos: number | null; total_unidades: number }
    | undefined

  if (existing) {
    const newBultos = Number(existing.cantidad_bultos ?? 0) + numPallets
    db.prepare(`
      UPDATE stock_lineas SET
        cantidad_bultos = ?, total_unidades = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(newBultos, newBultos * cajasPorPallet, existing.id)
    return
  }

  const maxOrden = db.prepare(`
    SELECT COALESCE(MAX(orden), 0) AS m FROM stock_lineas WHERE stock_sector_id = ?
  `).get(stock_sector_id) as { m: number }

  db.prepare(`
    INSERT INTO stock_lineas (
      stock_sector_id, tipo_bulto, cantidad_bultos, unidades_por_bulto,
      cantidad_suelta, ubicacion, ubicacion_id, total_unidades, orden
    ) VALUES (?, 'PALLET', ?, ?, NULL, ?, ?, ?, ?)
  `).run(
    stock_sector_id,
    numPallets,
    cajasPorPallet,
    ubicacion,
    ubicacion_id,
    numPallets * cajasPorPallet,
    maxOrden.m + 1
  )
}

function countLooseCajasInSector(
  db: Database.Database,
  stock_sector_id: number,
  botellasPorCaja: number
): number {
  const lines = db.prepare(`
    SELECT tipo_bulto, cantidad_bultos, unidades_por_bulto, total_unidades, cantidad_suelta
    FROM stock_lineas WHERE stock_sector_id = ?
  `).all(stock_sector_id) as StockLineaRow[]

  let total = 0
  for (const line of lines) {
    if (line.tipo_bulto === 'CAJA') {
      total += lineaTotalEnCajas(line, botellasPorCaja)
    } else if (line.tipo_bulto === 'PALLET') {
      const cpp = Number(line.unidades_por_bulto ?? 0)
      if (cpp > 0) total += line.total_unidades % cpp
    }
  }
  return total
}

function consolidateLooseCajasToFullPallets(
  db: Database.Database,
  stock_sector_id: number,
  cajasPorPallet: number,
  botellasPorCaja: number,
  ubicacion_id: number | null,
  ubicacion: string | null
): void {
  if (cajasPorPallet <= 1) return

  for (let guard = 0; guard < 500; guard += 1) {
    const partialPallets = db.prepare(`
      SELECT id, unidades_por_bulto, total_unidades
      FROM stock_lineas
      WHERE stock_sector_id = ? AND tipo_bulto = 'PALLET'
    `).all(stock_sector_id) as Array<{
      id: number
      unidades_por_bulto: number | null
      total_unidades: number
    }>

    let progressed = false
    for (const pl of partialPallets) {
      const cpp = Number(pl.unidades_por_bulto ?? cajasPorPallet)
      if (cpp <= 0) continue
      const rem = pl.total_unidades % cpp
      if (rem === 0) continue
      const gap = cpp - rem
      const fromCajas = deductCajasFromCajaLines(db, stock_sector_id, gap, botellasPorCaja)
      if (fromCajas <= 0) continue
      setPalletLineCajas(
        db,
        pl.id,
        pl.total_unidades + fromCajas,
        cpp,
        stock_sector_id,
        botellasPorCaja,
        ubicacion_id,
        ubicacion
      )
      progressed = true
      break
    }
    if (progressed) continue

    if (countLooseCajasInSector(db, stock_sector_id, botellasPorCaja) < cajasPorPallet) break

    const deducted = deductCajasFromCajaLines(db, stock_sector_id, cajasPorPallet, botellasPorCaja)
    if (deducted < cajasPorPallet) break
    incrementFullPalletLine(db, stock_sector_id, 1, cajasPorPallet, ubicacion_id, ubicacion)
  }
}

function addCajasToStockSectorSmart(
  db: Database.Database,
  params: {
    stock_sector_id: number
    numCajas: number
    botellasPorCaja: number
    cajasPorPallet: number
    ubicacion_id: number | null
    ubicacion: string | null
  }
): void {
  let remaining = params.numCajas
  if (remaining <= 0) return

  const partialPallets = db.prepare(`
    SELECT id, unidades_por_bulto, total_unidades
    FROM stock_lineas
    WHERE stock_sector_id = ? AND tipo_bulto = 'PALLET'
    ORDER BY id ASC
  `).all(params.stock_sector_id) as Array<{
    id: number
    unidades_por_bulto: number | null
    total_unidades: number
  }>

  for (const pl of partialPallets) {
    if (remaining <= 0) break
    const cpp = Number(pl.unidades_por_bulto ?? params.cajasPorPallet)
    if (cpp <= 0) continue
    const rem = pl.total_unidades % cpp
    if (rem === 0) continue
    const gap = cpp - rem
    const add = Math.min(remaining, gap)
    setPalletLineCajas(
      db,
      pl.id,
      pl.total_unidades + add,
      cpp,
      params.stock_sector_id,
      params.botellasPorCaja,
      params.ubicacion_id,
      params.ubicacion
    )
    remaining -= add
  }

  if (remaining > 0) {
    addCajasFullToStockSector(
      db,
      params.stock_sector_id,
      remaining,
      params.botellasPorCaja,
      params.ubicacion_id,
      params.ubicacion
    )
  }

  consolidateLooseCajasToFullPallets(
    db,
    params.stock_sector_id,
    params.cajasPorPallet,
    params.botellasPorCaja,
    params.ubicacion_id,
    params.ubicacion
  )
}

function addSueltoToStockSector(
  db: Database.Database,
  stock_sector_id: number,
  unidades: number,
  ubicacion_id: number | null,
  ubicacion: string | null
): void {
  if (unidades <= 0) return

  const existing = db.prepare(`
    SELECT id, cantidad_suelta, total_unidades
    FROM stock_lineas
    WHERE stock_sector_id = ? AND tipo_bulto = 'SUELTO'
      AND (
        (ubicacion_id IS NULL AND ? IS NULL)
        OR ubicacion_id = ?
      )
  `).get(stock_sector_id, ubicacion_id, ubicacion_id) as
    | { id: number; cantidad_suelta: number | null; total_unidades: number }
    | undefined

  if (existing) {
    const newTotal = existing.total_unidades + unidades
    db.prepare(`
      UPDATE stock_lineas
      SET cantidad_suelta = ?, total_unidades = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(newTotal, newTotal, existing.id)
    return
  }

  const maxOrden = db.prepare(`
    SELECT COALESCE(MAX(orden), 0) AS m FROM stock_lineas WHERE stock_sector_id = ?
  `).get(stock_sector_id) as { m: number }

  db.prepare(`
    INSERT INTO stock_lineas (
      stock_sector_id, tipo_bulto, cantidad_bultos, unidades_por_bulto,
      cantidad_suelta, ubicacion, ubicacion_id, total_unidades, orden
    ) VALUES (?, 'SUELTO', NULL, NULL, ?, ?, ?, ?, ?)
  `).run(stock_sector_id, unidades, ubicacion, ubicacion_id, unidades, maxOrden.m + 1)
}

function addPartialBultoToStockSector(
  db: Database.Database,
  stock_sector_id: number,
  tipo_bulto: 'PALLET' | 'CAJA',
  unidades: number,
  ubicacion_id: number | null,
  ubicacion: string | null
): void {
  if (unidades <= 0) return

  const existing = db.prepare(`
    SELECT id, unidades_por_bulto, total_unidades
    FROM stock_lineas
    WHERE stock_sector_id = ? AND tipo_bulto = ?
      AND cantidad_bultos = 1 AND unidades_por_bulto = ?
      AND (
        (ubicacion_id IS NULL AND ? IS NULL)
        OR ubicacion_id = ?
      )
  `).get(stock_sector_id, tipo_bulto, unidades, ubicacion_id, ubicacion_id) as
    | { id: number; unidades_por_bulto: number | null; total_unidades: number }
    | undefined

  if (existing) {
    const newTotal = existing.total_unidades + unidades
    db.prepare(`
      UPDATE stock_lineas
      SET cantidad_bultos = 1, unidades_por_bulto = ?, total_unidades = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(newTotal, newTotal, existing.id)
    return
  }

  const maxOrden = db.prepare(`
    SELECT COALESCE(MAX(orden), 0) AS m FROM stock_lineas WHERE stock_sector_id = ?
  `).get(stock_sector_id) as { m: number }

  db.prepare(`
    INSERT INTO stock_lineas (
      stock_sector_id, tipo_bulto, cantidad_bultos, unidades_por_bulto,
      cantidad_suelta, ubicacion, ubicacion_id, total_unidades, orden
    ) VALUES (?, ?, 1, ?, NULL, ?, ?, ?, ?)
  `).run(
    stock_sector_id,
    tipo_bulto,
    unidades,
    ubicacion,
    ubicacion_id,
    unidades,
    maxOrden.m + 1
  )
}

function addCajasFullToStockSector(
  db: Database.Database,
  stock_sector_id: number,
  numCajas: number,
  botellasPorCaja: number,
  ubicacion_id: number | null,
  ubicacion: string | null
): void {
  if (numCajas <= 0) return

  const existing = db.prepare(`
    SELECT id, cantidad_bultos, total_unidades
    FROM stock_lineas
    WHERE stock_sector_id = ? AND tipo_bulto = 'CAJA'
      AND unidades_por_bulto = ?
      AND cantidad_bultos > 1
      AND (
        (ubicacion_id IS NULL AND ? IS NULL)
        OR ubicacion_id = ?
      )
  `).get(stock_sector_id, botellasPorCaja, ubicacion_id, ubicacion_id) as
    | { id: number; cantidad_bultos: number | null; total_unidades: number }
    | undefined

  if (existing) {
    const newCajas = Number(existing.cantidad_bultos ?? 0) + numCajas
    const newTotal = newCajas * botellasPorCaja
    db.prepare(`
      UPDATE stock_lineas
      SET cantidad_bultos = ?, total_unidades = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(newCajas, newTotal, existing.id)
    return
  }

  const maxOrden = db.prepare(`
    SELECT COALESCE(MAX(orden), 0) AS m FROM stock_lineas WHERE stock_sector_id = ?
  `).get(stock_sector_id) as { m: number }

  db.prepare(`
    INSERT INTO stock_lineas (
      stock_sector_id, tipo_bulto, cantidad_bultos, unidades_por_bulto,
      cantidad_suelta, ubicacion, ubicacion_id, total_unidades, orden
    ) VALUES (?, 'CAJA', ?, ?, NULL, ?, ?, ?, ?)
  `).run(
    stock_sector_id,
    numCajas,
    botellasPorCaja,
    ubicacion,
    ubicacion_id,
    numCajas * botellasPorCaja,
    maxOrden.m + 1
  )
}

function refreshStockSectorTotal(db: Database.Database, stock_sector_id: number): void {
  const meta = db.prepare(`
    SELECT producto_id FROM stock_sector WHERE id = ?
  `).get(stock_sector_id) as { producto_id: number } | undefined

  if (!meta) return

  const { botellasPorCaja } = getProductoDefaults(db, meta.producto_id)
  const lineas = db.prepare(`
    SELECT tipo_bulto, cantidad_bultos, unidades_por_bulto, cantidad_suelta, total_unidades
    FROM stock_lineas WHERE stock_sector_id = ?
  `).all(stock_sector_id) as StockLineaRow[]

  const total = lineas.reduce(
    (sum, linea) => sum + lineaTotalEnCajas(linea, botellasPorCaja),
    0
  )

  db.prepare(`
    UPDATE stock_sector
    SET cantidad_total = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(total, stock_sector_id)
}

function applyPalletLineDeductionCajas(
  db: Database.Database,
  linea: StockLineaRow & {
    stock_sector_id: number
    ubicacion_id: number | null
    ubicacion: string | null
  },
  takeCajas: number,
  botellasPorCaja: number
): void {
  const cajasPorPallet = Number(linea.unidades_por_bulto ?? 0)
  const newTotalCajas = linea.total_unidades - takeCajas

  if (newTotalCajas <= 0) {
    db.prepare('DELETE FROM stock_lineas WHERE id = ?').run(linea.id)
  } else {
    const fullPallets = cajasPorPallet > 0 ? Math.floor(newTotalCajas / cajasPorPallet) : 0
    const looseCajas = cajasPorPallet > 0 ? newTotalCajas % cajasPorPallet : newTotalCajas

    if (fullPallets > 0) {
      db.prepare(`
        UPDATE stock_lineas
        SET cantidad_bultos = ?, total_unidades = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(fullPallets, fullPallets * cajasPorPallet, linea.id)
    } else {
      db.prepare('DELETE FROM stock_lineas WHERE id = ?').run(linea.id)
    }

    if (looseCajas > 0) {
      addCajasFullToStockSector(
        db,
        linea.stock_sector_id,
        looseCajas,
        botellasPorCaja,
        linea.ubicacion_id,
        linea.ubicacion
      )
    }
  }

  refreshStockSectorTotal(db, linea.stock_sector_id)
}

function applyPalletLineDeductionBotellas(
  db: Database.Database,
  linea: StockLineaRow & {
    stock_sector_id: number
    ubicacion_id: number | null
    ubicacion: string | null
  },
  takeBotellas: number,
  botellasPorCaja: number
): void {
  const cajasPorPallet = Number(linea.unidades_por_bulto ?? 0)
  const totalBotellas = linea.total_unidades * botellasPorCaja
  const newTotalBotellas = totalBotellas - takeBotellas

  if (newTotalBotellas <= 0) {
    db.prepare('DELETE FROM stock_lineas WHERE id = ?').run(linea.id)
    refreshStockSectorTotal(db, linea.stock_sector_id)
    return
  }

  const newTotalCajas = Math.ceil(newTotalBotellas / botellasPorCaja)
  const fullPallets = cajasPorPallet > 0 ? Math.floor(newTotalCajas / cajasPorPallet) : 0
  const looseCajas = cajasPorPallet > 0 ? newTotalCajas % cajasPorPallet : newTotalCajas
  const partialBotellas = newTotalBotellas % botellasPorCaja

  if (fullPallets > 0) {
    db.prepare(`
      UPDATE stock_lineas
      SET cantidad_bultos = ?, total_unidades = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(fullPallets, fullPallets * cajasPorPallet, linea.id)
  } else {
    db.prepare('DELETE FROM stock_lineas WHERE id = ?').run(linea.id)
  }

  if (looseCajas > 0) {
    addCajasFullToStockSector(
      db,
      linea.stock_sector_id,
      looseCajas,
      botellasPorCaja,
      linea.ubicacion_id,
      linea.ubicacion
    )
  }

  if (partialBotellas > 0) {
    addPartialBultoToStockSector(
      db,
      linea.stock_sector_id,
      'CAJA',
      partialBotellas,
      linea.ubicacion_id,
      linea.ubicacion
    )
  }

  refreshStockSectorTotal(db, linea.stock_sector_id)
}

function applyCajaLineDeductionCajas(
  db: Database.Database,
  linea: StockLineaRow & { stock_sector_id: number },
  takeCajas: number
): void {
  const u = Number(linea.unidades_por_bulto ?? 0)
  const currentCajas = Number(linea.cantidad_bultos ?? 0)
  const newCajas = currentCajas - takeCajas

  if (newCajas <= 0) {
    db.prepare('DELETE FROM stock_lineas WHERE id = ?').run(linea.id)
  } else {
    db.prepare(`
      UPDATE stock_lineas
      SET cantidad_bultos = ?, total_unidades = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(newCajas, newCajas * u, linea.id)
  }

  refreshStockSectorTotal(db, linea.stock_sector_id)
}

function applyCajaLineDeductionBotellas(
  db: Database.Database,
  linea: StockLineaRow & {
    stock_sector_id: number
    ubicacion_id: number | null
    ubicacion: string | null
  },
  takeBotellas: number,
  botellasPorCaja: number
): void {
  const newTotal = linea.total_unidades - takeBotellas

  if (newTotal <= 0) {
    db.prepare('DELETE FROM stock_lineas WHERE id = ?').run(linea.id)
  } else {
    const fullCajas = Math.floor(newTotal / botellasPorCaja)
    const remainder = newTotal % botellasPorCaja

    if (fullCajas > 0 && remainder === 0) {
      db.prepare(`
        UPDATE stock_lineas
        SET cantidad_bultos = ?, unidades_por_bulto = ?, total_unidades = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(fullCajas, botellasPorCaja, fullCajas * botellasPorCaja, linea.id)
    } else if (fullCajas > 0 && remainder > 0) {
      db.prepare(`
        UPDATE stock_lineas
        SET cantidad_bultos = ?, unidades_por_bulto = ?, total_unidades = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(fullCajas, botellasPorCaja, fullCajas * botellasPorCaja, linea.id)
      addPartialBultoToStockSector(
        db,
        linea.stock_sector_id,
        'CAJA',
        remainder,
        linea.ubicacion_id,
        linea.ubicacion
      )
    } else {
      db.prepare(`
        UPDATE stock_lineas
        SET cantidad_bultos = 1, unidades_por_bulto = ?, total_unidades = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(newTotal, newTotal, linea.id)
    }
  }

  refreshStockSectorTotal(db, linea.stock_sector_id)
}

export function applyLineDeduction(
  db: Database.Database,
  lineaId: number,
  take: number,
  modo: ModoSalidaPlanilla,
  botellasPorCaja: number
): void {
  const linea = db.prepare(`
    SELECT
      id, tipo_bulto, cantidad_bultos, unidades_por_bulto, cantidad_suelta,
      total_unidades, stock_sector_id, ubicacion_id, ubicacion
    FROM stock_lineas WHERE id = ?
  `).get(lineaId) as
    | (StockLineaRow & {
        stock_sector_id: number
        ubicacion_id: number | null
        ubicacion: string | null
      })
    | undefined

  if (!linea) throw new Error('Línea de stock no encontrada')

  if (linea.tipo_bulto === 'SUELTO') {
    const newTotal = linea.total_unidades - take
    if (newTotal <= 0) {
      db.prepare('DELETE FROM stock_lineas WHERE id = ?').run(lineaId)
    } else {
      db.prepare(`
        UPDATE stock_lineas
        SET cantidad_suelta = ?, total_unidades = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(newTotal, newTotal, lineaId)
    }
    refreshStockSectorTotal(db, linea.stock_sector_id)
    return
  }

  if (modo === 'CAJA') {
    if (linea.tipo_bulto === 'PALLET') {
      applyPalletLineDeductionCajas(db, linea, take, botellasPorCaja)
    } else if (linea.tipo_bulto === 'CAJA') {
      applyCajaLineDeductionCajas(db, linea, take)
    }
    return
  }

  if (linea.tipo_bulto === 'PALLET') {
    applyPalletLineDeductionBotellas(db, linea, take, botellasPorCaja)
  } else if (linea.tipo_bulto === 'CAJA') {
    applyCajaLineDeductionBotellas(db, linea, take, botellasPorCaja)
  }
}

export function getStockDisponibleProducto(db: Database.Database, producto_id: number): number {
  const row = db.prepare(`
    SELECT COALESCE(SUM(cantidad_total), 0) AS total
    FROM stock_sector WHERE producto_id = ?
  `).get(producto_id) as { total: number }
  return row.total
}

export function computeProductDeduction(
  db: Database.Database,
  producto_id: number,
  cantidad: number,
  modo_salida: ModoSalidaPlanilla
): DescuentoAplicado[] {
  if (cantidad <= 0) throw new Error('Cantidad inválida')

  const { unidad, botellasPorCaja } = getProductoDefaults(db, producto_id)
  const disponible = getStockDisponibleModo(db, producto_id, modo_salida)
  const unidadLabel = modo_salida === 'CAJA' ? 'cajas' : normalizarUnidadProducto(unidad) + 's'

  if (disponible < cantidad) {
    throw new Error(
      `Stock insuficiente (disponible: ${disponible} ${unidadLabel}, solicitado: ${cantidad} ${unidadLabel})`
    )
  }

  const sectores = getSectorsOrderedForDeduction(db, producto_id)
  let remaining = cantidad
  const allDescuentos: DescuentoAplicado[] = []

  for (const sector of sectores) {
    if (remaining <= 0) break

    const lineas = db.prepare(`
      SELECT id, tipo_bulto, cantidad_bultos, unidades_por_bulto, cantidad_suelta, total_unidades
      FROM stock_lineas
      WHERE stock_sector_id = ?
    `).all(sector.stock_sector_id) as StockLineaRow[]

    const sectorDisp = lineas.reduce(
      (sum, l) =>
        sum +
        (modo_salida === 'CAJA'
          ? lineaCajasDisponibles(l, botellasPorCaja)
          : lineaBotellasDisponibles(l, botellasPorCaja)),
      0
    )

    if (sectorDisp <= 0) continue

    const toTake = Math.min(sectorDisp, remaining)
    const { descuentos, remaining: leftoverFromSector } = simulateSectorDeduction(
      db,
      sector.stock_sector_id,
      sector.sector_nombre,
      sector.sector_id,
      toTake,
      modo_salida,
      unidad,
      botellasPorCaja
    )
    allDescuentos.push(...descuentos)
    remaining -= toTake - leftoverFromSector
  }

  if (remaining > 0) {
    throw new Error('Stock insuficiente para completar el descuento')
  }

  return allDescuentos
}

export function applyProductDeduction(
  db: Database.Database,
  params: {
    producto_id: number
    cantidad: number
    modo_salida: ModoSalidaPlanilla
    planilla_id: number
    planilla_linea_id: number
    usuario_id: number
    camionero_id: number
    observacion: string | null
  }
): DescuentoAplicado[] {
  const { botellasPorCaja } = getProductoDefaults(db, params.producto_id)
  const descuentos = computeProductDeduction(
    db,
    params.producto_id,
    params.cantidad,
    params.modo_salida
  )

  for (const d of descuentos) {
    db.prepare(`
      INSERT INTO planilla_descuentos (
        planilla_id, planilla_linea_id, producto_id, sector_id, stock_linea_id, unidades, etiqueta
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      params.planilla_id,
      params.planilla_linea_id,
      params.producto_id,
      d.sector_id,
      d.stock_linea_id,
      d.unidades,
      d.etiqueta
    )

    db.prepare(`
      INSERT INTO movimientos (
        tipo, producto_id, cantidad, sector_origen_id,
        documento_tipo, documento_id, usuario_id, camionero_id, observacion
      ) VALUES ('PLANILLA', ?, ?, ?, 'planilla', ?, ?, ?, ?)
    `).run(
      params.producto_id,
      d.unidades,
      d.sector_id,
      params.planilla_id,
      params.usuario_id,
      params.camionero_id,
      params.observacion
    )
  }

  for (const d of descuentos) {
    if (d.stock_linea_id) {
      applyLineDeduction(db, d.stock_linea_id, d.unidades, d.modo_salida, botellasPorCaja)
    }
  }

  return descuentos
}

export function getStockDisponibleCajasEnSector(
  db: Database.Database,
  producto_id: number,
  sector_id: number
): number {
  const { botellasPorCaja } = getProductoDefaults(db, producto_id)
  const stockSector = db.prepare(`
    SELECT id FROM stock_sector
    WHERE producto_id = ? AND sector_id = ? AND cantidad_total > 0
  `).get(producto_id, sector_id) as { id: number } | undefined

  if (!stockSector) return 0

  const lineas = db.prepare(`
    SELECT tipo_bulto, cantidad_bultos, unidades_por_bulto, cantidad_suelta, total_unidades
    FROM stock_lineas WHERE stock_sector_id = ?
  `).all(stockSector.id) as StockLineaRow[]

  return lineas.reduce((sum, l) => sum + lineaCajasDisponibles(l, botellasPorCaja), 0)
}

export function computeSectorProductDeduction(
  db: Database.Database,
  producto_id: number,
  sector_id: number,
  cantidad_cajas: number
): DescuentoAplicado[] {
  if (cantidad_cajas <= 0) throw new Error('Cantidad inválida')

  const stockSector = db.prepare(`
    SELECT ss.id, s.nombre AS sector_nombre
    FROM stock_sector ss
    JOIN sectores s ON s.id = ss.sector_id
    WHERE ss.producto_id = ? AND ss.sector_id = ?
  `).get(producto_id, sector_id) as
    | { id: number; sector_nombre: string }
    | undefined

  if (!stockSector) {
    throw new Error('Sin stock en el sector seleccionado')
  }

  const { unidad, botellasPorCaja } = getProductoDefaults(db, producto_id)
  const disponible = getStockDisponibleCajasEnSector(db, producto_id, sector_id)

  if (disponible < cantidad_cajas) {
    throw new Error(
      `Stock insuficiente en el sector (disponible: ${disponible} cajas, solicitado: ${cantidad_cajas} cajas)`
    )
  }

  const { descuentos, remaining } = simulateSectorDeduction(
    db,
    stockSector.id,
    stockSector.sector_nombre,
    sector_id,
    cantidad_cajas,
    'CAJA',
    unidad,
    botellasPorCaja
  )

  if (remaining > 0) {
    throw new Error('Stock insuficiente en el sector para completar el descuento')
  }

  return descuentos
}

export function applyRoturaLineDeduction(
  db: Database.Database,
  params: {
    producto_id: number
    sector_id: number
    cantidad_cajas: number
    rotura_id: number
    rotura_linea_id: number
    usuario_id: number
    observacion: string | null
  }
): DescuentoAplicado[] {
  const { botellasPorCaja } = getProductoDefaults(db, params.producto_id)
  const descuentos = computeSectorProductDeduction(
    db,
    params.producto_id,
    params.sector_id,
    params.cantidad_cajas
  )

  for (const d of descuentos) {
    db.prepare(`
      INSERT INTO rotura_descuentos (
        rotura_id, rotura_linea_id, producto_id, sector_id, stock_linea_id, unidades, etiqueta
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      params.rotura_id,
      params.rotura_linea_id,
      params.producto_id,
      d.sector_id,
      d.stock_linea_id,
      d.unidades,
      d.etiqueta
    )

    db.prepare(`
      INSERT INTO movimientos (
        tipo, producto_id, cantidad, sector_origen_id,
        documento_tipo, documento_id, usuario_id, observacion
      ) VALUES ('ROTURA', ?, ?, ?, 'rotura', ?, ?, ?)
    `).run(
      params.producto_id,
      d.unidades,
      d.sector_id,
      params.rotura_id,
      params.usuario_id,
      params.observacion
    )
  }

  for (const d of descuentos) {
    if (d.stock_linea_id) {
      applyLineDeduction(db, d.stock_linea_id, d.unidades, 'CAJA', botellasPorCaja)
    }
  }

  return descuentos
}

function ensureStockSector(
  db: Database.Database,
  producto_id: number,
  sector_id: number
): { id: number; cantidad_total: number } {
  let stockSector = db.prepare(`
    SELECT id, cantidad_total FROM stock_sector
    WHERE producto_id = ? AND sector_id = ?
  `).get(producto_id, sector_id) as
    | { id: number; cantidad_total: number }
    | undefined

  if (!stockSector) {
    const result = db.prepare(`
      INSERT INTO stock_sector (producto_id, sector_id, cantidad_total)
      VALUES (?, ?, 0)
    `).run(producto_id, sector_id)
    stockSector = { id: Number(result.lastInsertRowid), cantidad_total: 0 }
  }

  return stockSector
}

export function applyMovimientoInternoDespachoLine(
  db: Database.Database,
  params: {
    producto_id: number
    sector_origen_id: number
    cantidad_cajas: number
    movimiento_id: number
    movimiento_linea_id: number
    usuario_id: number
    observacion: string | null
  }
): DescuentoAplicado[] {
  const { botellasPorCaja } = getProductoDefaults(db, params.producto_id)
  const descuentos = computeSectorProductDeduction(
    db,
    params.producto_id,
    params.sector_origen_id,
    params.cantidad_cajas
  )

  for (const d of descuentos) {
    db.prepare(`
      INSERT INTO movimiento_interno_descuentos (
        movimiento_interno_id, movimiento_interno_linea_id, producto_id,
        sector_id, stock_linea_id, unidades, etiqueta
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      params.movimiento_id,
      params.movimiento_linea_id,
      params.producto_id,
      d.sector_id,
      d.stock_linea_id,
      d.unidades,
      d.etiqueta
    )

    db.prepare(`
      INSERT INTO movimientos (
        tipo, producto_id, cantidad, sector_origen_id, sector_destino_id,
        documento_tipo, documento_id, usuario_id, observacion
      ) VALUES ('MOVIMIENTO_INTERNO', ?, ?, ?, NULL, 'movimiento_interno', ?, ?, ?)
    `).run(
      params.producto_id,
      d.unidades,
      params.sector_origen_id,
      params.movimiento_id,
      params.usuario_id,
      params.observacion
    )
  }

  for (const d of descuentos) {
    if (d.stock_linea_id) {
      applyLineDeduction(db, d.stock_linea_id, d.unidades, 'CAJA', botellasPorCaja)
    }
  }

  return descuentos
}

export function applyMovimientoInternoRecepcionLine(
  db: Database.Database,
  params: {
    producto_id: number
    sector_destino_id: number
    cantidad_cajas: number
    movimiento_id: number
    usuario_id: number
    observacion: string | null
    ubicacion_destino_id?: number | null
  }
): void {
  const { botellasPorCaja, cajasPorPallet } = getProductoDefaults(db, params.producto_id)
  if (params.cantidad_cajas <= 0) throw new Error('Cantidad inválida')

  let ubicacionId: number | null = params.ubicacion_destino_id ?? null
  let ubicacionNombre: string | null = null
  if (ubicacionId) {
    const ub = db.prepare(`
      SELECT id, nombre FROM sector_ubicaciones
      WHERE id = ? AND sector_id = ? AND activo = 1
    `).get(ubicacionId, params.sector_destino_id) as { id: number; nombre: string } | undefined
    if (!ub) throw new Error('Ubicación destino no válida para el sector')
    ubicacionNombre = ub.nombre
  } else {
    ubicacionId = null
  }

  const stockSector = ensureStockSector(db, params.producto_id, params.sector_destino_id)

  addCajasToStockSectorSmart(db, {
    stock_sector_id: stockSector.id,
    numCajas: params.cantidad_cajas,
    botellasPorCaja,
    cajasPorPallet,
    ubicacion_id: ubicacionId,
    ubicacion: ubicacionNombre
  })

  refreshStockSectorTotal(db, stockSector.id)

  db.prepare(`
    INSERT INTO movimientos (
      tipo, producto_id, cantidad, sector_origen_id, sector_destino_id,
      documento_tipo, documento_id, usuario_id, observacion
    ) VALUES ('MOVIMIENTO_INTERNO', ?, ?, NULL, ?, 'movimiento_interno', ?, ?, ?)
  `).run(
    params.producto_id,
    params.cantidad_cajas,
    params.sector_destino_id,
    params.movimiento_id,
    params.usuario_id,
    params.observacion
  )
}

export function revertMovimientoInternoDespachoLine(
  db: Database.Database,
  params: {
    producto_id: number
    sector_origen_id: number
    cantidad_cajas: number
    movimiento_id: number
    usuario_id: number
    observacion: string | null
  }
): void {
  const { botellasPorCaja, cajasPorPallet } = getProductoDefaults(db, params.producto_id)
  const stockSector = ensureStockSector(db, params.producto_id, params.sector_origen_id)

  addCajasToStockSectorSmart(db, {
    stock_sector_id: stockSector.id,
    numCajas: params.cantidad_cajas,
    botellasPorCaja,
    cajasPorPallet,
    ubicacion_id: null,
    ubicacion: null
  })

  refreshStockSectorTotal(db, stockSector.id)

  db.prepare(`
    INSERT INTO movimientos (
      tipo, producto_id, cantidad, sector_origen_id, sector_destino_id,
      documento_tipo, documento_id, usuario_id, observacion
    ) VALUES ('MOVIMIENTO_INTERNO', ?, ?, NULL, ?, 'movimiento_interno', ?, ?, ?)
  `).run(
    params.producto_id,
    params.cantidad_cajas,
    params.sector_origen_id,
    params.movimiento_id,
    params.usuario_id,
    params.observacion ? `Reversión: ${params.observacion}` : 'Reversión de despacho cancelado'
  )
}
