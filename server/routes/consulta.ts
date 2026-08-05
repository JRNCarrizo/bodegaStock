import type { FastifyInstance } from 'fastify'
import { getDb } from '../db'
import { requirePermiso } from '../plugins/auth'
import { blockIfInventarioActivo } from '../utils/inventario-block'
import {
  buildExcelBuffer,
  buildMultiSheetExcel,
  resumenSheet,
  sendExcelFile,
  todayFileStamp
} from '../utils/excel-export'
import {
  formatEtiquetaLinea,
  getProductoDefaults,
  getProductoUnidad,
  getReorganizarSectorInfo,
  lineaTotalEnCajas,
  reorganizeStockLine,
  reorganizeStockSector,
  STOCK_LINEA_SUELTO_SQL,
  STOCK_SECTOR_VISIBLE_SQL,
  totalSueltoLineaConteo,
  type ReorganizarDesgloseInput
} from '../utils/stock'
import { sqlProductoSearchClause } from '../utils/productoSearch'

interface StockLineaRow {
  id: number
  tipo_bulto: string
  cantidad_bultos: number | null
  unidades_por_bulto: number | null
  cantidad_suelta: number | null
  ubicacion: string | null
  ubicacion_id: number | null
  ubicacion_codigo: string | null
  total_unidades: number
}

function mapLinea(
  row: StockLineaRow,
  unidadProducto: string,
  botellasPorCaja: number
) {
  const ubicacionLabel = row.ubicacion ?? row.ubicacion_codigo ?? null
  const total_cajas = lineaTotalEnCajas(row, botellasPorCaja)
  const total_suelto = totalSueltoLineaConteo({
    tipo_bulto: row.tipo_bulto as 'PALLET' | 'CAJA' | 'SUELTO',
    cantidad_bultos: row.cantidad_bultos,
    unidades_por_bulto: row.unidades_por_bulto,
    cantidad_suelta: row.cantidad_suelta
  })
  return {
    id: row.id,
    tipo_bulto: row.tipo_bulto,
    cantidad_bultos: row.cantidad_bultos,
    unidades_por_bulto: row.unidades_por_bulto,
    cantidad_suelta: row.cantidad_suelta,
    ubicacion: ubicacionLabel,
    ubicacion_id: row.ubicacion_id,
    total_unidades: total_cajas,
    total_cajas,
    total_suelto,
    etiqueta: formatLineaEtiqueta(row, unidadProducto)
  }
}

function formatLineaEtiqueta(row: StockLineaRow, unidadProducto: string): string {
  return formatEtiquetaLinea(
    {
      tipo_bulto: row.tipo_bulto as 'PALLET' | 'CAJA' | 'SUELTO',
      cantidad_bultos: row.cantidad_bultos,
      unidades_por_bulto: row.unidades_por_bulto,
      cantidad_suelta: row.cantidad_suelta
    },
    unidadProducto
  )
}

function getStockDetalle(db: ReturnType<typeof getDb>, productoId: number) {
  const unidadProducto = getProductoUnidad(db, productoId)
  const { botellasPorCaja } = getProductoDefaults(db, productoId)
  const sectores = db.prepare(`
    SELECT
      ss.id AS stock_sector_id,
      ss.cantidad_total,
      s.id AS sector_id,
      s.codigo AS sector_codigo,
      s.nombre AS sector_nombre
    FROM stock_sector ss
    JOIN sectores s ON s.id = ss.sector_id
    WHERE ss.producto_id = ? AND ${STOCK_SECTOR_VISIBLE_SQL}
    ORDER BY s.nombre COLLATE NOCASE ASC
  `).all(productoId) as {
    stock_sector_id: number
    cantidad_total: number
    sector_id: number
    sector_codigo: string
    sector_nombre: string
  }[]

  const lineasStmt = db.prepare(`
    SELECT
      sl.id, sl.tipo_bulto, sl.cantidad_bultos, sl.unidades_por_bulto,
      sl.cantidad_suelta, sl.ubicacion, sl.ubicacion_id, sl.total_unidades,
      su.nombre AS ubicacion_nombre, su.codigo AS ubicacion_codigo
    FROM stock_lineas sl
    LEFT JOIN sector_ubicaciones su ON su.id = sl.ubicacion_id
    WHERE sl.stock_sector_id = ?
    ORDER BY
      COALESCE(su.orden, 9999) ASC,
      sl.orden ASC,
      sl.id ASC
  `)

  return sectores.map((sector) => {
    const lineas = (lineasStmt.all(sector.stock_sector_id) as (StockLineaRow & {
      ubicacion_nombre: string | null
    })[]).map((row) =>
      mapLinea(
        {
          ...row,
          ubicacion: row.ubicacion_nombre ?? row.ubicacion,
          ubicacion_codigo: row.ubicacion_codigo
        },
        unidadProducto,
        botellasPorCaja
      )
    )

    const cantidad_total = lineas.reduce((sum, l) => sum + l.total_cajas, 0)
    const suelto_total = lineas.reduce((sum, l) => sum + l.total_suelto, 0)
    const ubicacionIds = [...new Set(lineas.map((l) => l.ubicacion_id))]
    const baseReorg = getReorganizarSectorInfo(
      db,
      productoId,
      cantidad_total,
      suelto_total
    )
    const reorganizar =
      ubicacionIds.length > 1
        ? {
            ...baseReorg,
            puede: false as const,
            motivo:
              'Hay varias ubicaciones. Reorganizá en Consulta → Por sector eligiendo una ubicación.'
          }
        : baseReorg

    return {
      stock_sector_id: sector.stock_sector_id,
      sector_id: sector.sector_id,
      sector_codigo: sector.sector_codigo,
      sector_nombre: sector.sector_nombre,
      cantidad_total,
      suelto_total,
      reorganizar,
      lineas
    }
  })
}

const SUELTO_TOTAL_PRODUCTO_SQL = `
  COALESCE((
    SELECT SUM(${STOCK_LINEA_SUELTO_SQL})
    FROM stock_lineas sl
    JOIN stock_sector ss2 ON ss2.id = sl.stock_sector_id
    WHERE ss2.producto_id = p.id
  ), 0)
`

export async function consultaRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/consulta/export/stock-productos', {
    preHandler: requirePermiso('consulta.ver')
  }, async (request, reply) => {
    const db = getDb()
    const { incluir_cero } = request.query as { incluir_cero?: string }
    const incluirCero = incluir_cero === '1' || incluir_cero === 'true'
    const stockTotalSql = `
      COALESCE((
        SELECT SUM(ss.cantidad_total) FROM stock_sector ss WHERE ss.producto_id = p.id
      ), 0)
    `
    const rows = db.prepare(`
      SELECT
        p.codigo_interno,
        p.nombre,
        ${stockTotalSql} AS cajas,
        ${SUELTO_TOTAL_PRODUCTO_SQL} AS botellas
      FROM productos p
      WHERE p.activo = 1
        ${
          incluirCero
            ? ''
            : `AND (${stockTotalSql} > 0 OR ${SUELTO_TOTAL_PRODUCTO_SQL} > 0)`
        }
      ORDER BY p.codigo_interno COLLATE NOCASE ASC, p.nombre COLLATE NOCASE ASC
    `).all() as Array<{
      codigo_interno: string
      nombre: string
      cajas: number
      botellas: number
    }>

    const buffer = await buildExcelBuffer(
      'Stock productos',
      [
        { header: 'Código interno', key: 'codigo_interno', width: 18 },
        { header: 'Nombre', key: 'nombre', width: 36 },
        { header: 'Cajas', key: 'cajas', width: 14 },
        { header: 'Botellas', key: 'botellas', width: 14 }
      ],
      rows.map((r) => ({
        codigo_interno: r.codigo_interno,
        nombre: r.nombre,
        cajas: Number(r.cajas) || 0,
        botellas: Number(r.botellas) || 0
      }))
    )

    return sendExcelFile(reply, buffer, `stock-productos-${todayFileStamp()}.xlsx`)
  })

  app.get('/api/consulta/export/stock-sectores', {
    preHandler: requirePermiso('consulta.ver')
  }, async (request, reply) => {
    const db = getDb()
    const { incluir_cero } = request.query as { incluir_cero?: string }
    const incluirCeros = incluir_cero === '1' || incluir_cero === 'true'

    const items = db.prepare(`
      SELECT
        p.id AS producto_id,
        p.codigo_interno,
        p.nombre,
        s.id AS sector_id,
        s.nombre AS sector_nombre,
        ss.cantidad_total AS cajas,
        COALESCE((
          SELECT SUM(${STOCK_LINEA_SUELTO_SQL})
          FROM stock_lineas sl
          WHERE sl.stock_sector_id = ss.id
        ), 0) AS botellas
      FROM stock_sector ss
      JOIN productos p ON p.id = ss.producto_id
      JOIN sectores s ON s.id = ss.sector_id
      WHERE p.activo = 1
      ORDER BY p.codigo_interno COLLATE NOCASE ASC
    `).all() as Array<{
      producto_id: number
      codigo_interno: string
      nombre: string
      sector_id: number
      sector_nombre: string
      cajas: number
      botellas: number
    }>

    const sectoresMap = new Map<number, string>()
    for (const item of items) {
      if (!sectoresMap.has(item.sector_id)) {
        sectoresMap.set(item.sector_id, item.sector_nombre || `Sector ${item.sector_id}`)
      }
    }

    const sectoresConBotellas = new Set<number>()
    for (const item of items) {
      if (Number(item.botellas) > 0) sectoresConBotellas.add(item.sector_id)
    }

    const sectores = [...sectoresMap.entries()]
      .map(([sector_id, sector_nombre]) => ({
        sector_id,
        sector_nombre,
        key: `s_${sector_id}`,
        keyBotellas: `b_${sector_id}`,
        conBotellas: sectoresConBotellas.has(sector_id)
      }))
      .sort((a, b) =>
        a.sector_nombre.localeCompare(b.sector_nombre, 'es', { sensitivity: 'base' })
      )

    const productos = new Map<
      number,
      {
        codigo_interno: string
        nombre: string
        cajasPorSector: Map<number, number>
        botellasPorSector: Map<number, number>
      }
    >()

    for (const item of items) {
      let row = productos.get(item.producto_id)
      if (!row) {
        row = {
          codigo_interno: item.codigo_interno,
          nombre: item.nombre,
          cajasPorSector: new Map(),
          botellasPorSector: new Map()
        }
        productos.set(item.producto_id, row)
      }
      row.cajasPorSector.set(
        item.sector_id,
        (row.cajasPorSector.get(item.sector_id) ?? 0) + (Number(item.cajas) || 0)
      )
      row.botellasPorSector.set(
        item.sector_id,
        (row.botellasPorSector.get(item.sector_id) ?? 0) + (Number(item.botellas) || 0)
      )
    }

    if (incluirCeros) {
      const sinStock = db.prepare(`
        SELECT p.id AS producto_id, p.codigo_interno, p.nombre
        FROM productos p
        WHERE p.activo = 1
          AND NOT EXISTS (SELECT 1 FROM stock_sector ss WHERE ss.producto_id = p.id)
      `).all() as Array<{ producto_id: number; codigo_interno: string; nombre: string }>

      for (const p of sinStock) {
        if (productos.has(p.producto_id)) continue
        productos.set(p.producto_id, {
          codigo_interno: p.codigo_interno,
          nombre: p.nombre,
          cajasPorSector: new Map(),
          botellasPorSector: new Map()
        })
      }
    }

    const rows = [...productos.values()]
      .map((p) => {
        const out: Record<string, unknown> = {
          codigo_interno: p.codigo_interno,
          nombre: p.nombre
        }
        let totalCajas = 0
        let totalBotellas = 0
        for (const sec of sectores) {
          const cajas = p.cajasPorSector.get(sec.sector_id) ?? 0
          out[sec.key] = cajas
          totalCajas += cajas

          const botellas = p.botellasPorSector.get(sec.sector_id) ?? 0
          if (sec.conBotellas) out[sec.keyBotellas] = botellas
          totalBotellas += botellas
        }
        out.total_cajas = totalCajas
        out.total_botellas = totalBotellas
        return out
      })
      .filter(
        (r) =>
          incluirCeros || Number(r.total_cajas) > 0 || Number(r.total_botellas) > 0
      )
      .sort((a, b) =>
        String(a.codigo_interno).localeCompare(String(b.codigo_interno), 'es', {
          sensitivity: 'base'
        })
      )

    const columns = [
      { header: 'Codigo', key: 'codigo_interno', width: 18 },
      { header: 'Producto', key: 'nombre', width: 36 },
      ...sectores.flatMap((sec) => {
        const width = Math.min(22, Math.max(12, sec.sector_nombre.length + 2))
        const base = [{ header: sec.sector_nombre, key: sec.key, width }]
        return sec.conBotellas
          ? [...base, { header: `${sec.sector_nombre} (botellas)`, key: sec.keyBotellas, width }]
          : base
      }),
      { header: 'Total cajas', key: 'total_cajas', width: 14 },
      { header: 'Total botellas', key: 'total_botellas', width: 15 }
    ]

    const totalRow: Record<string, unknown> = {
      codigo_interno: '',
      nombre: 'TOTAL',
      total_cajas: rows.reduce((s, r) => s + (Number(r.total_cajas) || 0), 0),
      total_botellas: rows.reduce((s, r) => s + (Number(r.total_botellas) || 0), 0)
    }
    for (const sec of sectores) {
      totalRow[sec.key] = rows.reduce((s, r) => s + (Number(r[sec.key]) || 0), 0)
      if (sec.conBotellas) {
        totalRow[sec.keyBotellas] = rows.reduce(
          (s, r) => s + (Number(r[sec.keyBotellas]) || 0),
          0
        )
      }
    }

    const buffer = await buildMultiSheetExcel([
      resumenSheet('Resumen', [
        ['Reporte', 'Stock por sectores'],
        ['Generado', new Date().toLocaleString('es-AR')],
        ['Sectores', sectores.length],
        ['Productos', rows.length],
        ['Total cajas', Number(totalRow.total_cajas)],
        ['Total botellas', Number(totalRow.total_botellas)],
        ['Incluye productos en cero', incluirCeros ? 'Sí' : 'No']
      ]),
      {
        name: 'Por sectores',
        columns,
        rows: [...rows, totalRow]
      }
    ])

    return sendExcelFile(reply, buffer, `stock-por-sectores-${todayFileStamp()}.xlsx`)
  })

  app.get('/api/consulta/todos', {
    preHandler: requirePermiso('consulta.ver')
  }, async (request) => {
    const db = getDb()
    const { page, limit } = request.query as { page?: string; limit?: string }
    const stockTotalSql = `
      COALESCE((
        SELECT SUM(ss.cantidad_total) FROM stock_sector ss WHERE ss.producto_id = p.id
      ), 0)
    `
    const selectSql = `
      SELECT
        p.id, p.codigo_interno, p.codigo_barras, p.nombre, p.descripcion,
        p.imagen_path, p.activo, p.unidad,
        ${stockTotalSql} AS stock_total,
        ${SUELTO_TOTAL_PRODUCTO_SQL} AS suelto_total,
        COALESCE((
          SELECT COUNT(DISTINCT ss.sector_id)
          FROM stock_sector ss
          WHERE ss.producto_id = p.id AND ${STOCK_SECTOR_VISIBLE_SQL}
        ), 0) AS sectores_con_stock
      FROM productos p
      WHERE p.activo = 1
        AND ${stockTotalSql} > 0
      ORDER BY p.codigo_interno COLLATE NOCASE ASC, p.nombre COLLATE NOCASE ASC
    `

    if (page == null) {
      return db.prepare(selectSql).all()
    }

    const requestedPage = Math.max(1, Number.parseInt(page, 10) || 1)
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(limit ?? '50', 10) || 50))
    const totalRow = db.prepare(`
      SELECT COUNT(*) AS total
      FROM productos p
      WHERE p.activo = 1 AND ${stockTotalSql} > 0
    `).get() as { total: number }
    const total = Number(totalRow.total)
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const currentPage = Math.min(requestedPage, totalPages)
    const offset = (currentPage - 1) * pageSize
    const items = db.prepare(`${selectSql} LIMIT ? OFFSET ?`).all(pageSize, offset)

    return {
      items,
      total,
      page: currentPage,
      page_size: pageSize,
      total_pages: totalPages
    }
  })

  app.get('/api/consulta', {
    preHandler: requirePermiso('consulta.ver')
  }, async (request, reply) => {
    const { q } = request.query as { q?: string }

    if (!q?.trim()) {
      return reply.status(400).send({ error: 'Ingresá un término de búsqueda' })
    }

    const db = getDb()
    const search = sqlProductoSearchClause(q, { prefix: 'p.' })
    if (!search) {
      return reply.status(400).send({ error: 'Ingresá un término de búsqueda' })
    }

    const productos = db.prepare(`
      SELECT
        p.id, p.codigo_interno, p.codigo_barras, p.nombre, p.descripcion,
        p.imagen_path, p.activo, p.unidad,
        COALESCE((
          SELECT SUM(ss.cantidad_total) FROM stock_sector ss WHERE ss.producto_id = p.id
        ), 0) AS stock_total,
        ${SUELTO_TOTAL_PRODUCTO_SQL} AS suelto_total,
        COALESCE((
          SELECT COUNT(DISTINCT ss.sector_id)
          FROM stock_sector ss
          WHERE ss.producto_id = p.id AND ${STOCK_SECTOR_VISIBLE_SQL}
        ), 0) AS sectores_con_stock
      FROM productos p
      WHERE p.activo = 1
        AND ${search.sql}
      ORDER BY p.nombre COLLATE NOCASE ASC
      LIMIT 25
    `).all(...search.params)

    return productos
  })

  app.get('/api/consulta/producto/:id', {
    preHandler: requirePermiso('consulta.ver')
  }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id)
    const db = getDb()

    const producto = db.prepare(`
      SELECT id, codigo_interno, codigo_barras, nombre, descripcion, imagen_path, activo, unidad
      FROM productos WHERE id = ?
    `).get(id)

    if (!producto) {
      return reply.status(404).send({ error: 'Producto no encontrado' })
    }

    const sectores = getStockDetalle(db, id)
    const stock_total = sectores.reduce((sum, s) => sum + s.cantidad_total, 0)
    const suelto_total = sectores.reduce((sum, s) => sum + s.suelto_total, 0)

    return {
      producto,
      stock_total,
      suelto_total,
      sectores
    }
  })

  app.post('/api/consulta/stock-linea/:id/reorganizar', {
    preHandler: [blockIfInventarioActivo(), requirePermiso('ajustes.crear')]
  }, async (request, reply) => {
    const lineaId = Number((request.params as { id: string }).id)
    if (!Number.isFinite(lineaId) || lineaId <= 0) {
      return reply.status(400).send({ error: 'ID de línea inválido' })
    }

    const db = getDb()
    const user = request.user!

    const body = (request.body ?? {}) as Partial<ReorganizarDesgloseInput>
    const bultos = Array.isArray(body.bultos) ? body.bultos : []

    const desglose: ReorganizarDesgloseInput = {
      bultos: bultos.map((b) => ({
        tipo_bulto: 'PALLET' as const,
        cantidad_bultos: Number(b.cantidad_bultos),
        unidades_por_bulto: Number(b.unidades_por_bulto)
      })),
      unidades_sueltas: Number(body.unidades_sueltas ?? 0),
      botellas_por_caja:
        body.botellas_por_caja != null ? Number(body.botellas_por_caja) : undefined
    }

    try {
      const lineaRow = db.prepare(`
        SELECT ss.producto_id
        FROM stock_lineas sl
        JOIN stock_sector ss ON ss.id = sl.stock_sector_id
        WHERE sl.id = ?
      `).get(lineaId) as { producto_id: number } | undefined

      if (!lineaRow) {
        return reply.status(404).send({ error: 'Línea de stock no encontrada' })
      }

      const result = reorganizeStockLine(db, lineaId, user.id, desglose)

      const producto = db.prepare(`
        SELECT id, codigo_interno, codigo_barras, nombre, descripcion, imagen_path, activo, unidad
        FROM productos WHERE id = ?
      `).get(lineaRow.producto_id)

      const sectores = getStockDetalle(db, lineaRow.producto_id)
      const stock_total = sectores.reduce((sum, s) => sum + s.cantidad_total, 0)
      const suelto_total = sectores.reduce((sum, s) => sum + s.suelto_total, 0)

      return {
        ok: true,
        etiqueta_resultante: result.etiqueta_resultante,
        detalle: { producto, stock_total, suelto_total, sectores }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al reorganizar'
      return reply.status(400).send({ error: message })
    }
  })

  app.post('/api/consulta/stock-sector/:id/reorganizar', {
    preHandler: [blockIfInventarioActivo(), requirePermiso('ajustes.crear')]
  }, async (request, reply) => {
    const stockSectorId = Number((request.params as { id: string }).id)
    if (!Number.isFinite(stockSectorId) || stockSectorId <= 0) {
      return reply.status(400).send({ error: 'ID de stock por sector inválido' })
    }

    const db = getDb()
    const user = request.user!

    const body = (request.body ?? {}) as Partial<ReorganizarDesgloseInput> & {
      ubicacion_id?: number | null
      sin_ubicacion?: boolean
    }
    const bultos = Array.isArray(body.bultos) ? body.bultos : []

    const desglose: ReorganizarDesgloseInput = {
      bultos: bultos.map((b) => ({
        tipo_bulto: 'PALLET' as const,
        cantidad_bultos: Number(b.cantidad_bultos),
        unidades_por_bulto: Number(b.unidades_por_bulto)
      })),
      unidades_sueltas: Number(body.unidades_sueltas ?? 0)
    }

    let scope: { ubicacion_id?: number | null; sin_ubicacion?: boolean } | undefined
    if (body.sin_ubicacion === true) {
      scope = { sin_ubicacion: true }
    } else if (body.ubicacion_id != null && Number(body.ubicacion_id) > 0) {
      scope = { ubicacion_id: Number(body.ubicacion_id) }
    }

    try {
      const sectorRow = db.prepare(`
        SELECT producto_id FROM stock_sector WHERE id = ?
      `).get(stockSectorId) as { producto_id: number } | undefined

      if (!sectorRow) {
        return reply.status(404).send({ error: 'Stock del sector no encontrado' })
      }

      const result = reorganizeStockSector(db, stockSectorId, user.id, desglose, scope)

      const producto = db.prepare(`
        SELECT id, codigo_interno, codigo_barras, nombre, descripcion, imagen_path, activo, unidad
        FROM productos WHERE id = ?
      `).get(sectorRow.producto_id)

      const sectores = getStockDetalle(db, sectorRow.producto_id)
      const stock_total = sectores.reduce((sum, s) => sum + s.cantidad_total, 0)
      const suelto_total = sectores.reduce((sum, s) => sum + s.suelto_total, 0)

      return {
        ok: true,
        etiqueta_resultante: result.etiqueta_resultante,
        detalle: { producto, stock_total, suelto_total, sectores }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al reorganizar'
      return reply.status(400).send({ error: message })
    }
  })
}
