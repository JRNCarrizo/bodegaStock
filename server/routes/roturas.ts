import type { FastifyInstance } from 'fastify'
import { getDb } from '../db'
import { requirePermiso } from '../plugins/auth'
import { blockIfInventarioActivo } from '../utils/inventario-block'
import {
  applyRoturaLineDeduction,
  getStockDisponibleCajasEnSector
} from '../utils/stock'

interface RoturaLineaBody {
  producto_id: number
  sector_id: number
  cantidad_cajas: number
}

interface RoturaBody {
  fecha?: string
  observacion?: string | null
  lineas?: RoturaLineaBody[]
}

function assertSectorActivo(db: ReturnType<typeof getDb>, sectorId: number) {
  const sector = db.prepare(`
    SELECT id FROM sectores WHERE id = ? AND activo = 1
  `).get(sectorId)
  if (!sector) throw new Error('Sector no válido')
}

function assertProductoActivo(db: ReturnType<typeof getDb>, productoId: number) {
  const producto = db.prepare(`
    SELECT id FROM productos WHERE id = ? AND activo = 1
  `).get(productoId)
  if (!producto) throw new Error('Producto no válido')
}

function getRoturaLineas(db: ReturnType<typeof getDb>, roturaId: number) {
  return db.prepare(`
    SELECT
      rl.id, rl.producto_id, p.codigo_interno, p.nombre,
      rl.sector_id, s.nombre AS sector_nombre,
      rl.cantidad_cajas, rl.orden
    FROM rotura_lineas rl
    JOIN productos p ON p.id = rl.producto_id
    JOIN sectores s ON s.id = rl.sector_id
    WHERE rl.rotura_id = ?
    ORDER BY rl.orden ASC, rl.id ASC
  `).all(roturaId) as Array<{
    id: number
    producto_id: number
    codigo_interno: string
    nombre: string
    sector_id: number
    sector_nombre: string
    cantidad_cajas: number
    orden: number
  }>
}

function getRoturaHeader(db: ReturnType<typeof getDb>, id: number) {
  return db.prepare(`
    SELECT
      r.id, r.fecha, r.observacion, r.usuario_id, r.created_at,
      u.nombre AS usuario_nombre
    FROM roturas r
    JOIN usuarios u ON u.id = r.usuario_id
    WHERE r.id = ?
  `).get(id) as
    | {
        id: number
        fecha: string
        observacion: string | null
        usuario_id: number
        created_at: string
        usuario_nombre: string
      }
    | undefined
}

export async function roturasRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/roturas', {
    preHandler: requirePermiso('roturas.ver')
  }, async (request) => {
    const { q, fecha_desde, fecha_hasta } = request.query as {
      q?: string
      fecha_desde?: string
      fecha_hasta?: string
    }
    const db = getDb()

    let sql = `
      SELECT
        r.id, r.fecha, r.observacion, r.created_at,
        u.nombre AS usuario_nombre,
        COALESCE((
          SELECT SUM(rl.cantidad_cajas) FROM rotura_lineas rl WHERE rl.rotura_id = r.id
        ), 0) AS total_cajas,
        COALESCE((
          SELECT COUNT(*) FROM rotura_lineas rl WHERE rl.rotura_id = r.id
        ), 0) AS lineas_count
      FROM roturas r
      JOIN usuarios u ON u.id = r.usuario_id
      WHERE 1=1
    `
    const params: string[] = []

    if (fecha_desde) {
      sql += ' AND r.fecha >= ?'
      params.push(fecha_desde)
    }
    if (fecha_hasta) {
      sql += ' AND r.fecha <= ?'
      params.push(fecha_hasta)
    }
    if (q?.trim()) {
      sql += ` AND (
        r.observacion LIKE ?
        OR EXISTS (
          SELECT 1 FROM rotura_lineas rl
          JOIN productos p ON p.id = rl.producto_id
          WHERE rl.rotura_id = r.id
            AND (p.codigo_interno LIKE ? OR p.nombre LIKE ?)
        )
      )`
      const term = `%${q.trim()}%`
      params.push(term, term, term)
    }

    sql += ' ORDER BY r.fecha DESC, r.id DESC LIMIT 500'

    return db.prepare(sql).all(...params)
  })

  app.get('/api/roturas/resumen-dia', {
    preHandler: requirePermiso('roturas.ver')
  }, async (request, reply) => {
    const { fecha } = request.query as { fecha?: string }
    if (!fecha?.trim()) {
      return reply.status(400).send({ error: 'Fecha requerida' })
    }

    const db = getDb()
    const productos = db.prepare(`
      SELECT
        p.id AS producto_id,
        p.codigo_interno,
        p.nombre,
        SUM(rl.cantidad_cajas) AS total_cajas,
        COUNT(DISTINCT rl.sector_id) AS sectores_count
      FROM rotura_lineas rl
      JOIN roturas r ON r.id = rl.rotura_id
      JOIN productos p ON p.id = rl.producto_id
      WHERE r.fecha = ?
      GROUP BY p.id, p.codigo_interno, p.nombre
      ORDER BY p.nombre COLLATE NOCASE ASC
    `).all(fecha) as Array<{
      producto_id: number
      codigo_interno: string
      nombre: string
      total_cajas: number
      sectores_count: number
    }>

    const total_cajas = productos.reduce((s, p) => s + p.total_cajas, 0)
    const registros = db.prepare(`
      SELECT COUNT(*) AS c FROM roturas WHERE fecha = ?
    `).get(fecha) as { c: number }

    return {
      fecha,
      registros: registros.c,
      total_cajas,
      productos
    }
  })

  app.get('/api/roturas/producto/:id/stock-sector/:sectorId', {
    preHandler: requirePermiso('roturas.crear')
  }, async (request) => {
    const productoId = Number((request.params as { id: string }).id)
    const sectorId = Number((request.params as { sectorId: string }).sectorId)
    const db = getDb()
    assertProductoActivo(db, productoId)
    assertSectorActivo(db, sectorId)

    return {
      stock_disponible_cajas: getStockDisponibleCajasEnSector(db, productoId, sectorId)
    }
  })

  app.get('/api/roturas/:id', {
    preHandler: requirePermiso('roturas.ver')
  }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id)
    const db = getDb()
    const rotura = getRoturaHeader(db, id)
    if (!rotura) {
      return reply.status(404).send({ error: 'Registro no encontrado' })
    }

    const lineas = getRoturaLineas(db, id)
    const total_cajas = lineas.reduce((s, l) => s + l.cantidad_cajas, 0)

    return { rotura, lineas, total_cajas }
  })

  app.post('/api/roturas', {
    preHandler: [blockIfInventarioActivo(), requirePermiso('roturas.crear')]
  }, async (request, reply) => {
    const body = (request.body ?? {}) as RoturaBody
    const user = request.user!
    const db = getDb()

    const fecha = body.fecha?.trim()
    if (!fecha) {
      return reply.status(400).send({ error: 'Fecha requerida' })
    }

    const lineas = Array.isArray(body.lineas) ? body.lineas : []
    if (lineas.length === 0) {
      return reply.status(400).send({ error: 'Agregá al menos una línea' })
    }

    for (const linea of lineas) {
      const qty = Number(linea.cantidad_cajas)
      if (!linea.producto_id || !linea.sector_id || !qty || qty <= 0) {
        return reply.status(400).send({ error: 'Línea inválida: producto, sector y cantidad requeridos' })
      }
      assertProductoActivo(db, linea.producto_id)
      assertSectorActivo(db, linea.sector_id)
    }

    try {
      const tx = db.transaction(() => {
        const result = db.prepare(`
          INSERT INTO roturas (fecha, observacion, usuario_id)
          VALUES (?, ?, ?)
        `).run(fecha, body.observacion?.trim() || null, user.id)

        const roturaId = Number(result.lastInsertRowid)
        const observacion = body.observacion?.trim() || null

        lineas.forEach((linea, index) => {
          const lineResult = db.prepare(`
            INSERT INTO rotura_lineas (rotura_id, producto_id, sector_id, cantidad_cajas, orden)
            VALUES (?, ?, ?, ?, ?)
          `).run(
            roturaId,
            linea.producto_id,
            linea.sector_id,
            Number(linea.cantidad_cajas),
            index + 1
          )

          applyRoturaLineDeduction(db, {
            producto_id: linea.producto_id,
            sector_id: linea.sector_id,
            cantidad_cajas: Number(linea.cantidad_cajas),
            rotura_id: roturaId,
            rotura_linea_id: Number(lineResult.lastInsertRowid),
            usuario_id: user.id,
            observacion
          })
        })

        return roturaId
      })

      const roturaId = tx()
      const rotura = getRoturaHeader(db, roturaId)!
      const lineasDetalle = getRoturaLineas(db, roturaId)
      const total_cajas = lineasDetalle.reduce((s, l) => s + l.cantidad_cajas, 0)

      return { id: roturaId, rotura, lineas: lineasDetalle, total_cajas }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al registrar rotura'
      return reply.status(400).send({ error: message })
    }
  })
}
