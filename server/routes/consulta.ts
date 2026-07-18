import type { FastifyInstance } from 'fastify'
import { getDb } from '../db'
import { requirePermiso } from '../plugins/auth'
import { blockIfInventarioActivo } from '../utils/inventario-block'
import { buildExcelBuffer, sendExcelFile, todayFileStamp } from '../utils/excel-export'
import {
  formatEtiquetaLinea,
  getProductoDefaults,
  getProductoUnidad,
  getReorganizarSectorInfo,
  lineaTotalEnCajas,
  reorganizeStockSector,
  STOCK_SECTOR_VISIBLE_SQL,
  type ReorganizarDesgloseInput
} from '../utils/stock'

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
    const ubicacionIds = [...new Set(lineas.map((l) => l.ubicacion_id))]
    const baseReorg = getReorganizarSectorInfo(db, productoId, cantidad_total)
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
      reorganizar,
      lineas
    }
  })
}

export async function consultaRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/consulta/export/stock-productos', {
    preHandler: requirePermiso('consulta.ver')
  }, async (_request, reply) => {
    const db = getDb()
    const rows = db.prepare(`
      SELECT
        p.codigo_interno,
        p.nombre,
        COALESCE(p.descripcion, '') AS descripcion,
        COALESCE((
          SELECT SUM(ss.cantidad_total) FROM stock_sector ss WHERE ss.producto_id = p.id
        ), 0) AS cantidad_total
      FROM productos p
      WHERE p.activo = 1
      ORDER BY p.codigo_interno COLLATE NOCASE ASC, p.nombre COLLATE NOCASE ASC
    `).all() as Array<{
      codigo_interno: string
      nombre: string
      descripcion: string
      cantidad_total: number
    }>

    const buffer = await buildExcelBuffer(
      'Stock productos',
      [
        { header: 'Código interno', key: 'codigo_interno', width: 18 },
        { header: 'Nombre', key: 'nombre', width: 36 },
        { header: 'Descripción', key: 'descripcion', width: 40 },
        { header: 'Cantidad total', key: 'cantidad_total', width: 16 }
      ],
      rows.map((r) => ({
        codigo_interno: r.codigo_interno,
        nombre: r.nombre,
        descripcion: r.descripcion,
        cantidad_total: Number(r.cantidad_total) || 0
      }))
    )

    return sendExcelFile(reply, buffer, `stock-productos-${todayFileStamp()}.xlsx`)
  })

  app.get('/api/consulta', {
    preHandler: requirePermiso('consulta.ver')
  }, async (request, reply) => {
    const { q } = request.query as { q?: string }

    if (!q?.trim()) {
      return reply.status(400).send({ error: 'Ingresá un término de búsqueda' })
    }

    const db = getDb()
    const term = `%${q.trim()}%`

    const productos = db.prepare(`
      SELECT
        p.id, p.codigo_interno, p.codigo_barras, p.nombre, p.descripcion,
        p.imagen_path, p.activo,
        COALESCE((
          SELECT SUM(ss.cantidad_total) FROM stock_sector ss WHERE ss.producto_id = p.id
        ), 0) AS stock_total,
        COALESCE((
          SELECT COUNT(DISTINCT ss.sector_id)
          FROM stock_sector ss
          WHERE ss.producto_id = p.id AND ${STOCK_SECTOR_VISIBLE_SQL}
        ), 0) AS sectores_con_stock
      FROM productos p
      WHERE p.codigo_interno LIKE ?
         OR p.codigo_barras LIKE ?
         OR p.nombre LIKE ?
      ORDER BY p.nombre COLLATE NOCASE ASC
      LIMIT 25
    `).all(term, term, term)

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

    return {
      producto,
      stock_total,
      sectores
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

      return {
        ok: true,
        etiqueta_resultante: result.etiqueta_resultante,
        detalle: { producto, stock_total, sectores }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al reorganizar'
      return reply.status(400).send({ error: message })
    }
  })
}
