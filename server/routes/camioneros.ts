import type { FastifyInstance } from 'fastify'
import { getDb } from '../db'
import { requirePermiso } from '../plugins/auth'

interface CamioneroBody {
  numero_interno?: string
  nombre?: string
  empresa?: string
  activo?: boolean
}

interface VehiculoBody {
  marca?: string
  modelo?: string
  patente?: string
  activo?: boolean
}

function getCamioneroOr404(db: ReturnType<typeof getDb>, id: number) {
  return db.prepare('SELECT id FROM camioneros WHERE id = ?').get(id) as { id: number } | undefined
}

function normalizePatente(patente: string): string {
  return patente.trim().toUpperCase().replace(/\s+/g, '')
}

export async function camionerosRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/camioneros', {
    preHandler: requirePermiso('camioneros.ver')
  }, async (request) => {
    const { q, activo } = request.query as { q?: string; activo?: string }
    const db = getDb()

    let sql = `
      SELECT
        c.id, c.numero_interno, c.nombre, c.empresa, c.activo, c.created_at,
        COALESCE((
          SELECT COUNT(*) FROM camionero_vehiculos cv
          WHERE cv.camionero_id = c.id AND cv.activo = 1
        ), 0) AS vehiculos_count
      FROM camioneros c
      WHERE 1=1
    `
    const params: unknown[] = []

    if (activo === '1') sql += ' AND c.activo = 1'
    else if (activo === '0') sql += ' AND c.activo = 0'

    if (q?.trim()) {
      sql += ` AND (
        c.numero_interno LIKE ? OR c.nombre LIKE ? OR c.empresa LIKE ?
        OR EXISTS (
          SELECT 1 FROM camionero_vehiculos cv
          WHERE cv.camionero_id = c.id
            AND (cv.patente LIKE ? OR cv.marca LIKE ? OR cv.modelo LIKE ?)
        )
      )`
      const term = `%${q.trim()}%`
      params.push(term, term, term, term, term, term)
    }

    sql += ' ORDER BY c.nombre COLLATE NOCASE ASC, c.numero_interno ASC'

    return db.prepare(sql).all(...params)
  })

  app.get('/api/camioneros/:id', {
    preHandler: requirePermiso('camioneros.ver')
  }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id)
    const db = getDb()
    const row = db.prepare(`
      SELECT id, numero_interno, nombre, empresa, activo, created_at
      FROM camioneros WHERE id = ?
    `).get(id)

    if (!row) return reply.status(404).send({ error: 'Camionero no encontrado' })
    return row
  })

  app.get('/api/camioneros/:id/vehiculos', {
    preHandler: requirePermiso('camioneros.ver')
  }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id)
    const db = getDb()

    if (!getCamioneroOr404(db, id)) {
      return reply.status(404).send({ error: 'Camionero no encontrado' })
    }

    return db.prepare(`
      SELECT id, camionero_id, marca, modelo, patente, activo, created_at
      FROM camionero_vehiculos
      WHERE camionero_id = ?
      ORDER BY patente COLLATE NOCASE ASC, id ASC
    `).all(id)
  })

  app.post('/api/camioneros', {
    preHandler: requirePermiso('camioneros.crear')
  }, async (request, reply) => {
    const body = request.body as CamioneroBody

    if (!body.numero_interno?.trim() || !body.nombre?.trim() || !body.empresa?.trim()) {
      return reply.status(400).send({
        error: 'Número interno, nombre y empresa son requeridos'
      })
    }

    const db = getDb()
    try {
      const result = db.prepare(`
        INSERT INTO camioneros (numero_interno, nombre, empresa, activo)
        VALUES (?, ?, ?, ?)
      `).run(
        body.numero_interno.trim().toUpperCase(),
        body.nombre.trim(),
        body.empresa.trim(),
        body.activo === false ? 0 : 1
      )

      return { id: result.lastInsertRowid }
    } catch {
      return reply.status(409).send({ error: 'El número interno ya existe' })
    }
  })

  app.put('/api/camioneros/:id', {
    preHandler: requirePermiso('camioneros.editar')
  }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id)
    const body = request.body as CamioneroBody
    const db = getDb()

    if (!getCamioneroOr404(db, id)) {
      return reply.status(404).send({ error: 'Camionero no encontrado' })
    }

    try {
      db.prepare(`
        UPDATE camioneros SET
          numero_interno = COALESCE(?, numero_interno),
          nombre = COALESCE(?, nombre),
          empresa = COALESCE(?, empresa),
          activo = COALESCE(?, activo)
        WHERE id = ?
      `).run(
        body.numero_interno?.trim().toUpperCase() ?? null,
        body.nombre?.trim() ?? null,
        body.empresa?.trim() ?? null,
        body.activo === undefined ? null : body.activo ? 1 : 0,
        id
      )

      return { ok: true }
    } catch {
      return reply.status(409).send({ error: 'El número interno ya existe' })
    }
  })

  app.post('/api/camioneros/:id/vehiculos', {
    preHandler: requirePermiso('camioneros.editar')
  }, async (request, reply) => {
    const camioneroId = Number((request.params as { id: string }).id)
    const body = request.body as VehiculoBody
    const db = getDb()

    if (!getCamioneroOr404(db, camioneroId)) {
      return reply.status(404).send({ error: 'Camionero no encontrado' })
    }

    if (!body.marca?.trim() || !body.modelo?.trim() || !body.patente?.trim()) {
      return reply.status(400).send({ error: 'Marca, modelo y patente son requeridos' })
    }

    const patente = normalizePatente(body.patente)

    try {
      const result = db.prepare(`
        INSERT INTO camionero_vehiculos (camionero_id, marca, modelo, patente, activo)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        camioneroId,
        body.marca.trim(),
        body.modelo.trim(),
        patente,
        body.activo === false ? 0 : 1
      )

      return { id: result.lastInsertRowid }
    } catch {
      return reply.status(409).send({ error: 'La patente ya está registrada' })
    }
  })

  app.put('/api/camioneros/:id/vehiculos/:vehiculoId', {
    preHandler: requirePermiso('camioneros.editar')
  }, async (request, reply) => {
    const camioneroId = Number((request.params as { id: string }).id)
    const vehiculoId = Number((request.params as { vehiculoId: string }).vehiculoId)
    const body = request.body as VehiculoBody
    const db = getDb()

    const existing = db.prepare(`
      SELECT id FROM camionero_vehiculos WHERE id = ? AND camionero_id = ?
    `).get(vehiculoId, camioneroId)

    if (!existing) return reply.status(404).send({ error: 'Vehículo no encontrado' })

    const patente = body.patente ? normalizePatente(body.patente) : null

    try {
      db.prepare(`
        UPDATE camionero_vehiculos SET
          marca = COALESCE(?, marca),
          modelo = COALESCE(?, modelo),
          patente = COALESCE(?, patente),
          activo = COALESCE(?, activo)
        WHERE id = ? AND camionero_id = ?
      `).run(
        body.marca?.trim() ?? null,
        body.modelo?.trim() ?? null,
        patente,
        body.activo === undefined ? null : body.activo ? 1 : 0,
        vehiculoId,
        camioneroId
      )

      return { ok: true }
    } catch {
      return reply.status(409).send({ error: 'La patente ya está registrada' })
    }
  })

  app.delete('/api/camioneros/:id/vehiculos/:vehiculoId', {
    preHandler: requirePermiso('camioneros.editar')
  }, async (request, reply) => {
    const camioneroId = Number((request.params as { id: string }).id)
    const vehiculoId = Number((request.params as { vehiculoId: string }).vehiculoId)
    const db = getDb()

    const existing = db.prepare(`
      SELECT id FROM camionero_vehiculos WHERE id = ? AND camionero_id = ?
    `).get(vehiculoId, camioneroId)

    if (!existing) return reply.status(404).send({ error: 'Vehículo no encontrado' })

    db.prepare('DELETE FROM camionero_vehiculos WHERE id = ? AND camionero_id = ?').run(
      vehiculoId,
      camioneroId
    )

    return { ok: true }
  })
}
