import type { FastifyInstance } from 'fastify'
import { getDb } from '../db'
import { requirePermiso } from '../plugins/auth'

interface SectorBody {
  nombre?: string
  descripcion?: string | null
  es_sector_descuento?: boolean
  prioridad_descuento?: number | null
  usa_ubicaciones?: boolean
  activo?: boolean
}

interface UbicacionBody {
  nombre?: string
  orden?: number
  activo?: boolean
}

function slugCodigoSector(nombre: string, suffix = ''): string {
  const slug = nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  const base = slug || 'SECTOR'
  return suffix ? `${base}-${suffix}`.slice(0, 48) : base
}

function nombreSectorDuplicado(
  db: ReturnType<typeof getDb>,
  nombre: string,
  excludeId?: number
): boolean {
  const row = db.prepare(`
    SELECT id FROM sectores
    WHERE LOWER(TRIM(nombre)) = LOWER(TRIM(?))
      AND (? IS NULL OR id != ?)
    LIMIT 1
  `).get(nombre, excludeId ?? null, excludeId ?? null) as { id: number } | undefined
  return !!row
}

function slugCodigoUbicacion(nombre: string, orden: number): string {
  const slug = nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return slug || `UB-${orden}`
}

function nombreUbicacionDuplicado(
  db: ReturnType<typeof getDb>,
  sectorId: number,
  nombre: string,
  excludeId?: number
): boolean {
  const row = db.prepare(`
    SELECT id FROM sector_ubicaciones
    WHERE sector_id = ? AND LOWER(TRIM(nombre)) = LOWER(TRIM(?))
      AND (? IS NULL OR id != ?)
    LIMIT 1
  `).get(sectorId, nombre, excludeId ?? null, excludeId ?? null) as { id: number } | undefined
  return !!row
}

function getSectorOr404(db: ReturnType<typeof getDb>, id: number) {
  return db.prepare('SELECT id, usa_ubicaciones FROM sectores WHERE id = ?').get(id) as
    | { id: number; usa_ubicaciones: number }
    | undefined
}

export async function sectoresRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/sectores', {
    preHandler: requirePermiso('sectores.ver')
  }, async (request) => {
    const { q, activo } = request.query as { q?: string; activo?: string }
    const db = getDb()

    let sql = `
      SELECT
        s.id, s.codigo, s.nombre, s.descripcion,
        s.es_sector_descuento, s.prioridad_descuento, s.usa_ubicaciones, s.activo, s.created_at,
        COALESCE((
          SELECT COUNT(DISTINCT ss.producto_id)
          FROM stock_sector ss
          WHERE ss.sector_id = s.id AND ss.cantidad_total > 0
        ), 0) AS productos_con_stock,
        COALESCE((
          SELECT SUM(ss.cantidad_total)
          FROM stock_sector ss
          WHERE ss.sector_id = s.id
        ), 0) AS stock_total_unidades,
        COALESCE((
          SELECT COUNT(*)
          FROM sector_ubicaciones su
          WHERE su.sector_id = s.id AND su.activo = 1
        ), 0) AS ubicaciones_count
      FROM sectores s
      WHERE 1=1
    `
    const params: unknown[] = []

    if (activo === '1') sql += ' AND s.activo = 1'
    else if (activo === '0') sql += ' AND s.activo = 0'

    if (q?.trim()) {
      sql += ' AND (s.nombre LIKE ? OR s.descripcion LIKE ?)'
      const term = `%${q.trim()}%`
      params.push(term, term)
    }

    sql += ` ORDER BY
      s.es_sector_descuento DESC,
      CASE WHEN s.prioridad_descuento IS NULL THEN 9999 ELSE s.prioridad_descuento END ASC,
      s.nombre COLLATE NOCASE ASC`

    return db.prepare(sql).all(...params)
  })

  app.get('/api/sectores/:id', {
    preHandler: requirePermiso('sectores.ver')
  }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id)
    const db = getDb()
    const sector = db.prepare(`
      SELECT id, codigo, nombre, descripcion, es_sector_descuento,
             prioridad_descuento, usa_ubicaciones, activo, created_at
      FROM sectores WHERE id = ?
    `).get(id)

    if (!sector) return reply.status(404).send({ error: 'Sector no encontrado' })
    return sector
  })

  app.get('/api/sectores/:id/ubicaciones', {
    preHandler: requirePermiso('sectores.ver')
  }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id)
    const db = getDb()

    if (!getSectorOr404(db, id)) {
      return reply.status(404).send({ error: 'Sector no encontrado' })
    }

    return db.prepare(`
      SELECT id, sector_id, codigo, nombre, orden, activo, created_at
      FROM sector_ubicaciones
      WHERE sector_id = ?
      ORDER BY orden ASC, nombre COLLATE NOCASE ASC, id ASC
    `).all(id)
  })

  app.post('/api/sectores/:id/ubicaciones', {
    preHandler: requirePermiso('sectores.editar')
  }, async (request, reply) => {
    const sectorId = Number((request.params as { id: string }).id)
    const body = request.body as UbicacionBody
    const db = getDb()

    const sector = getSectorOr404(db, sectorId)
    if (!sector) return reply.status(404).send({ error: 'Sector no encontrado' })

    if (!body.nombre?.trim()) {
      return reply.status(400).send({ error: 'El nombre es requerido' })
    }

    const nombre = body.nombre.trim()

    if (nombreUbicacionDuplicado(db, sectorId, nombre)) {
      return reply.status(409).send({ error: 'Ya existe una ubicación con ese nombre en este sector' })
    }

    const maxOrden = db.prepare(`
      SELECT COALESCE(MAX(orden), 0) AS max_orden FROM sector_ubicaciones WHERE sector_id = ?
    `).get(sectorId) as { max_orden: number }

    const orden = body.orden ?? maxOrden.max_orden + 1
    const codigo = slugCodigoUbicacion(nombre, orden)

    try {
      const result = db.prepare(`
        INSERT INTO sector_ubicaciones (sector_id, codigo, nombre, orden, activo)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        sectorId,
        codigo,
        nombre,
        orden,
        body.activo === false ? 0 : 1
      )

      if (!sector.usa_ubicaciones) {
        db.prepare('UPDATE sectores SET usa_ubicaciones = 1 WHERE id = ?').run(sectorId)
      }

      return { id: result.lastInsertRowid }
    } catch {
      return reply.status(409).send({ error: 'No se pudo crear la ubicación' })
    }
  })

  app.put('/api/sectores/:id/ubicaciones/:ubicacionId', {
    preHandler: requirePermiso('sectores.editar')
  }, async (request, reply) => {
    const sectorId = Number((request.params as { id: string }).id)
    const ubicacionId = Number((request.params as { ubicacionId: string }).ubicacionId)
    const body = request.body as UbicacionBody
    const db = getDb()

    const existing = db.prepare(`
      SELECT id FROM sector_ubicaciones WHERE id = ? AND sector_id = ?
    `).get(ubicacionId, sectorId)

    if (!existing) return reply.status(404).send({ error: 'Ubicación no encontrada' })

    const nombre = body.nombre?.trim()
    if (nombre && nombreUbicacionDuplicado(db, sectorId, nombre, ubicacionId)) {
      return reply.status(409).send({ error: 'Ya existe una ubicación con ese nombre en este sector' })
    }

    const current = db.prepare(`
      SELECT orden FROM sector_ubicaciones WHERE id = ? AND sector_id = ?
    `).get(ubicacionId, sectorId) as { orden: number }

    try {
      db.prepare(`
        UPDATE sector_ubicaciones SET
          codigo = COALESCE(?, codigo),
          nombre = COALESCE(?, nombre),
          orden = COALESCE(?, orden),
          activo = COALESCE(?, activo)
        WHERE id = ? AND sector_id = ?
      `).run(
        nombre ? slugCodigoUbicacion(nombre, current.orden) : null,
        nombre ?? null,
        body.orden ?? null,
        body.activo === undefined ? null : body.activo ? 1 : 0,
        ubicacionId,
        sectorId
      )

      return { ok: true }
    } catch {
      return reply.status(409).send({ error: 'No se pudo actualizar la ubicación' })
    }
  })

  app.delete('/api/sectores/:id/ubicaciones/:ubicacionId', {
    preHandler: requirePermiso('sectores.editar')
  }, async (request, reply) => {
    const sectorId = Number((request.params as { id: string }).id)
    const ubicacionId = Number((request.params as { ubicacionId: string }).ubicacionId)
    const db = getDb()

    const existing = db.prepare(`
      SELECT id FROM sector_ubicaciones WHERE id = ? AND sector_id = ?
    `).get(ubicacionId, sectorId)

    if (!existing) return reply.status(404).send({ error: 'Ubicación no encontrada' })

    const enUso = db.prepare(`
      SELECT COUNT(*) AS c FROM stock_lineas WHERE ubicacion_id = ?
    `).get(ubicacionId) as { c: number }

    if (enUso.c > 0) {
      return reply.status(409).send({
        error: 'No se puede eliminar: hay stock asociado a esta ubicación'
      })
    }

    db.prepare('DELETE FROM sector_ubicaciones WHERE id = ? AND sector_id = ?').run(
      ubicacionId,
      sectorId
    )

    return { ok: true }
  })

  app.post('/api/sectores', {
    preHandler: requirePermiso('sectores.crear')
  }, async (request, reply) => {
    const body = request.body as SectorBody

    if (!body.nombre?.trim()) {
      return reply.status(400).send({ error: 'El nombre es requerido' })
    }

    const nombre = body.nombre.trim()
    const db = getDb()

    if (nombreSectorDuplicado(db, nombre)) {
      return reply.status(409).send({ error: 'Ya existe un sector con ese nombre' })
    }

    const esDescuento = body.es_sector_descuento === true
    let prioridad = body.prioridad_descuento ?? null

    if (esDescuento && prioridad == null) {
      const row = db.prepare(`
        SELECT COALESCE(MAX(prioridad_descuento), 0) + 1 AS next
        FROM sectores WHERE es_sector_descuento = 1
      `).get() as { next: number }
      prioridad = row.next
    }

    if (!esDescuento) prioridad = null

    let codigo = slugCodigoSector(nombre)
    for (let i = 2; i < 100; i++) {
      const exists = db.prepare('SELECT id FROM sectores WHERE codigo = ?').get(codigo)
      if (!exists) break
      codigo = slugCodigoSector(nombre, String(i))
    }

    try {
      const result = db.prepare(`
        INSERT INTO sectores (
          codigo, nombre, descripcion, es_sector_descuento, prioridad_descuento,
          usa_ubicaciones, activo
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        codigo,
        nombre,
        body.descripcion?.trim() || null,
        esDescuento ? 1 : 0,
        prioridad,
        body.usa_ubicaciones === true ? 1 : 0,
        body.activo === false ? 0 : 1
      )

      return { id: result.lastInsertRowid }
    } catch {
      return reply.status(409).send({ error: 'No se pudo crear el sector' })
    }
  })

  app.put('/api/sectores/:id', {
    preHandler: requirePermiso('sectores.editar')
  }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id)
    const body = request.body as SectorBody
    const db = getDb()

    const existing = db.prepare('SELECT id FROM sectores WHERE id = ?').get(id)
    if (!existing) return reply.status(404).send({ error: 'Sector no encontrado' })

    const nombre = body.nombre?.trim()
    if (nombre && nombreSectorDuplicado(db, nombre, id)) {
      return reply.status(409).send({ error: 'Ya existe un sector con ese nombre' })
    }

    const esDescuento = body.es_sector_descuento === true
    let prioridad = body.prioridad_descuento ?? null
    if (!esDescuento) prioridad = null

    let codigo: string | null = null
    if (nombre) {
      codigo = slugCodigoSector(nombre)
      for (let i = 2; i < 100; i++) {
        const dup = db.prepare(`
          SELECT id FROM sectores WHERE codigo = ? AND id != ?
        `).get(codigo, id)
        if (!dup) break
        codigo = slugCodigoSector(nombre, String(i))
      }
    }

    try {
      db.prepare(`
        UPDATE sectores SET
          codigo = COALESCE(?, codigo),
          nombre = COALESCE(?, nombre),
          descripcion = ?,
          es_sector_descuento = ?,
          prioridad_descuento = ?,
          usa_ubicaciones = COALESCE(?, usa_ubicaciones),
          activo = COALESCE(?, activo)
        WHERE id = ?
      `).run(
        codigo,
        nombre ?? null,
        body.descripcion?.trim() ?? null,
        esDescuento ? 1 : 0,
        prioridad,
        body.usa_ubicaciones === undefined ? null : body.usa_ubicaciones ? 1 : 0,
        body.activo === undefined ? null : body.activo ? 1 : 0,
        id
      )

      return { ok: true }
    } catch {
      return reply.status(409).send({ error: 'No se pudo actualizar el sector' })
    }
  })
}
