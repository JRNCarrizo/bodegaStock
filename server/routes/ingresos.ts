import type { FastifyInstance } from 'fastify'
import { getDb } from '../db'
import { requirePermiso } from '../plugins/auth'
import { blockIfInventarioActivo } from '../utils/inventario-block'
import {
  applyIngresoLineToStock,
  calcTotalEnCajas,
  formatEtiquetaLinea,
  getProductoDefaults,
  lineaTotalEnCajas,
  validateLineaDesglose,
  type LineaDesgloseInput
} from '../utils/stock'

interface IngresoLineaBody extends LineaDesgloseInput {
  producto_id: number
  ubicacion_id?: number | null
}

interface IngresoBody {
  fecha?: string
  numero_remito?: string
  observacion?: string | null
  sector_id?: number
  lineas?: IngresoLineaBody[]
}

function mapLineaRowInner(
  row: {
    id: number
    producto_id: number
    codigo_interno: string
    nombre: string
    sector_id: number
    sector_nombre: string
    ubicacion_id: number | null
    ubicacion_nombre: string | null
    tipo_bulto: string
    cantidad_bultos: number | null
    unidades_por_bulto: number | null
    cantidad_suelta: number | null
    unidad: string
    total_unidades: number
    orden: number
  },
  botellasPorCaja: number
) {
  const linea: LineaDesgloseInput = {
    tipo_bulto: row.tipo_bulto as LineaDesgloseInput['tipo_bulto'],
    cantidad_bultos: row.cantidad_bultos,
    unidades_por_bulto: row.unidades_por_bulto,
    cantidad_suelta: row.cantidad_suelta
  }
  const total_cajas = lineaTotalEnCajas(
    {
      tipo_bulto: row.tipo_bulto,
      cantidad_bultos: row.cantidad_bultos,
      unidades_por_bulto: row.unidades_por_bulto,
      cantidad_suelta: row.cantidad_suelta,
      total_unidades: row.total_unidades
    },
    botellasPorCaja
  )
  return {
    id: row.id,
    producto_id: row.producto_id,
    codigo_interno: row.codigo_interno,
    nombre: row.nombre,
    sector_id: row.sector_id,
    sector_nombre: row.sector_nombre,
    ubicacion_id: row.ubicacion_id,
    ubicacion_nombre: row.ubicacion_nombre,
    tipo_bulto: row.tipo_bulto,
    cantidad_bultos: row.cantidad_bultos,
    unidades_por_bulto: row.unidades_por_bulto,
    cantidad_suelta: row.cantidad_suelta,
    total_unidades: total_cajas,
    total_cajas,
    etiqueta: formatEtiquetaLinea(linea, row.unidad),
    orden: row.orden
  }
}

function getIngresoLineas(db: ReturnType<typeof getDb>, ingresoId: number) {
  return db.prepare(`
    SELECT
      il.id, il.producto_id, p.codigo_interno, p.nombre, p.unidad,
      il.sector_id, s.nombre AS sector_nombre,
      il.ubicacion_id, su.nombre AS ubicacion_nombre,
      il.tipo_bulto, il.cantidad_bultos, il.unidades_por_bulto,
      il.cantidad_suelta, il.total_unidades, il.orden
    FROM ingreso_lineas il
    JOIN productos p ON p.id = il.producto_id
    JOIN sectores s ON s.id = il.sector_id
    LEFT JOIN sector_ubicaciones su ON su.id = il.ubicacion_id
    WHERE il.ingreso_id = ?
    ORDER BY il.orden ASC, il.id ASC
  `).all(ingresoId) as Parameters<typeof mapLineaRowInner>[0][]
}

export async function ingresosRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/ingresos', {
    preHandler: requirePermiso('ingresos.ver')
  }, async (request) => {
    const { q, fecha_desde, fecha_hasta } = request.query as {
      q?: string
      fecha_desde?: string
      fecha_hasta?: string
    }
    const db = getDb()

    let sql = `
      SELECT
        i.id, i.fecha, i.numero_remito, i.observacion, i.sector_id, i.created_at,
        s.nombre AS sector_nombre,
        u.nombre AS usuario_nombre,
        COALESCE(st.total_unidades, 0) AS total_unidades,
        COALESCE(st.lineas_count, 0) AS lineas_count,
        COALESCE(st.productos_count, 0) AS productos_count
      FROM ingresos i
      JOIN sectores s ON s.id = i.sector_id
      JOIN usuarios u ON u.id = i.usuario_id
      LEFT JOIN (
        SELECT
          ingreso_id,
          SUM(total_unidades) AS total_unidades,
          COUNT(*) AS lineas_count,
          COUNT(DISTINCT producto_id) AS productos_count
        FROM ingreso_lineas
        GROUP BY ingreso_id
      ) st ON st.ingreso_id = i.id
      WHERE 1=1
    `
    const params: unknown[] = []

    if (q?.trim()) {
      sql += ' AND (i.numero_remito LIKE ? OR i.observacion LIKE ? OR s.nombre LIKE ?)'
      const term = `%${q.trim()}%`
      params.push(term, term, term)
    }

    if (fecha_desde?.trim() && fecha_hasta?.trim()) {
      let desde = fecha_desde.trim()
      let hasta = fecha_hasta.trim()
      if (desde > hasta) [desde, hasta] = [hasta, desde]
      sql += ' AND i.fecha >= ? AND i.fecha <= ?'
      params.push(desde, hasta)
    } else if (fecha_desde?.trim()) {
      sql += ' AND i.fecha = ?'
      params.push(fecha_desde.trim())
    } else if (fecha_hasta?.trim()) {
      sql += ' AND i.fecha = ?'
      params.push(fecha_hasta.trim())
    }

    sql += ' ORDER BY i.fecha DESC, i.created_at DESC'

    return db.prepare(sql).all(...params)
  })

  app.get('/api/ingresos/:id', {
    preHandler: requirePermiso('ingresos.ver')
  }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id)
    const db = getDb()

    const ingreso = db.prepare(`
      SELECT
        i.id, i.fecha, i.numero_remito, i.observacion, i.sector_id, i.usuario_id, i.created_at,
        s.nombre AS sector_nombre,
        u.nombre AS usuario_nombre
      FROM ingresos i
      JOIN sectores s ON s.id = i.sector_id
      JOIN usuarios u ON u.id = i.usuario_id
      WHERE i.id = ?
    `).get(id)

    if (!ingreso) return reply.status(404).send({ error: 'Ingreso no encontrado' })

    const lineas = getIngresoLineas(db, id).map((row) => {
      const { botellasPorCaja } = getProductoDefaults(db, row.producto_id)
      return mapLineaRowInner(row, botellasPorCaja)
    })
    const total_unidades = lineas.reduce((s, l) => s + l.total_cajas, 0)

    return { ingreso, lineas, total_unidades }
  })

  app.post('/api/ingresos', {
    preHandler: [blockIfInventarioActivo(), requirePermiso('ingresos.crear')]
  }, async (request, reply) => {
    const body = request.body as IngresoBody
    const user = request.user!

    if (!body.fecha?.trim() || !body.numero_remito?.trim() || !body.sector_id) {
      return reply.status(400).send({
        error: 'Fecha, número de remito y sector son requeridos'
      })
    }

    if (!body.lineas?.length) {
      return reply.status(400).send({ error: 'Agregá al menos una línea de producto' })
    }

    const db = getDb()

    const sector = db.prepare(`
      SELECT id, activo FROM sectores WHERE id = ?
    `).get(body.sector_id) as { id: number; activo: number } | undefined

    if (!sector || !sector.activo) {
      return reply.status(400).send({ error: 'Sector no válido' })
    }

    for (let i = 0; i < body.lineas.length; i++) {
      const linea = body.lineas[i]
      const err = validateLineaDesglose(linea)
      if (err) {
        return reply.status(400).send({ error: `Línea ${i + 1}: ${err}` })
      }

      const producto = db.prepare(`
        SELECT id FROM productos WHERE id = ? AND activo = 1
      `).get(linea.producto_id)
      if (!producto) {
        return reply.status(400).send({ error: `Línea ${i + 1}: producto no válido` })
      }

      if (linea.ubicacion_id) {
        const ub = db.prepare(`
          SELECT id FROM sector_ubicaciones
          WHERE id = ? AND sector_id = ? AND activo = 1
        `).get(linea.ubicacion_id, body.sector_id)
        if (!ub) {
          return reply.status(400).send({ error: `Línea ${i + 1}: ubicación no válida para el sector` })
        }
      }
    }

    const observacion = body.observacion?.trim() || null

    try {
      const ingresoId = db.transaction(() => {
        const result = db.prepare(`
          INSERT INTO ingresos (fecha, numero_remito, observacion, sector_id, usuario_id)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          body.fecha.trim(),
          body.numero_remito.trim(),
          observacion,
          body.sector_id,
          user.id
        )

        const ingresoId = Number(result.lastInsertRowid)

        body.lineas!.forEach((linea, index) => {
          const { botellasPorCaja } = getProductoDefaults(db, linea.producto_id)
          const totalCajas = calcTotalEnCajas(linea, botellasPorCaja)

          let ubicacionNombre: string | null = null
          if (linea.ubicacion_id) {
            const ub = db.prepare(`
              SELECT nombre FROM sector_ubicaciones WHERE id = ?
            `).get(linea.ubicacion_id) as { nombre: string }
            ubicacionNombre = ub.nombre
          }

          db.prepare(`
            INSERT INTO ingreso_lineas (
              ingreso_id, producto_id, sector_id, ubicacion_id,
              tipo_bulto, cantidad_bultos, unidades_por_bulto, cantidad_suelta,
              total_unidades, orden
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            ingresoId,
            linea.producto_id,
            body.sector_id,
            linea.ubicacion_id ?? null,
            linea.tipo_bulto,
            linea.tipo_bulto === 'SUELTO' ? null : linea.cantidad_bultos,
            linea.tipo_bulto === 'SUELTO' ? null : linea.unidades_por_bulto,
            linea.tipo_bulto === 'SUELTO' ? linea.cantidad_suelta : null,
            totalCajas,
            index + 1
          )

          applyIngresoLineToStock(db, {
            producto_id: linea.producto_id,
            sector_id: body.sector_id!,
            ubicacion_id: linea.ubicacion_id ?? null,
            ubicacion_nombre: ubicacionNombre,
            linea,
            ingreso_id: ingresoId,
            usuario_id: user.id,
            observacion,
            orden: index + 1
          })
        })

        return ingresoId
      })()

      return { id: ingresoId }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al registrar ingreso'
      return reply.status(500).send({ error: msg })
    }
  })
}
