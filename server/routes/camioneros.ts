import type { FastifyInstance } from 'fastify'
import { getDb } from '../db'
import { requirePermiso, requirePermisoAny } from '../plugins/auth'
import { assertCamioneroEnLogistica, requireRequestLogistica } from '../utils/logisticas'

/** Listado para planillas/retornos sin dar acceso al ABM de camioneros. */
const puedeListarCamioneros = requirePermisoAny(
  'camioneros.ver',
  'planillas.ver',
  'planillas.crear',
  'retornos.ver',
  'retornos.crear'
)

interface CamioneroBody {
  numero_interno?: string
  nombre?: string
  empresa?: string
  activo?: boolean
}

interface VehiculoBody {
  marca?: string
  modelo?: string
  alias?: string
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
    preHandler: puedeListarCamioneros
  }, async (request) => {
    const { q, activo } = request.query as { q?: string; activo?: string }
    const db = getDb()
    const logisticaId = requireRequestLogistica(request)

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

    sql += ' AND c.logistica_id = ?'
    params.push(logisticaId)

    if (activo === '1') sql += ' AND c.activo = 1'
    else if (activo === '0') sql += ' AND c.activo = 0'

    if (q?.trim()) {
      sql += ` AND (
        c.numero_interno LIKE ? OR c.nombre LIKE ? OR c.empresa LIKE ?
        OR EXISTS (
          SELECT 1 FROM camionero_vehiculos cv
          WHERE cv.camionero_id = c.id
            AND (cv.patente LIKE ? OR cv.marca LIKE ? OR cv.modelo LIKE ? OR cv.alias LIKE ?)
        )
      )`
      const term = `%${q.trim()}%`
      params.push(term, term, term, term, term, term, term)
    }

    sql += ' ORDER BY c.nombre COLLATE NOCASE ASC, c.numero_interno ASC'

    return db.prepare(sql).all(...params)
  })

  app.get('/api/camioneros/:id', {
    preHandler: puedeListarCamioneros
  }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id)
    const db = getDb()
    const logisticaId = requireRequestLogistica(request)
    const row = db.prepare(`
      SELECT id, numero_interno, nombre, empresa, activo, created_at
      FROM camioneros WHERE id = ? AND logistica_id = ?
    `).get(id, logisticaId)

    if (!row) return reply.status(404).send({ error: 'Camionero no encontrado' })
    return row
  })

  app.get('/api/camioneros/:id/vehiculos', {
    preHandler: puedeListarCamioneros
  }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id)
    const db = getDb()

    if (!getCamioneroOr404(db, id)) {
      return reply.status(404).send({ error: 'Camionero no encontrado' })
    }

    const { activo } = request.query as { activo?: string }
    let sql = `
      SELECT id, camionero_id, marca, modelo, alias, patente, activo, created_at
      FROM camionero_vehiculos
      WHERE camionero_id = ?
    `
    if (activo === '1') sql += ' AND activo = 1'
    else if (activo === '0') sql += ' AND activo = 0'
    sql += ' ORDER BY patente COLLATE NOCASE ASC, id ASC'

    return db.prepare(sql).all(id)
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
    const logisticaId = requireRequestLogistica(request)
    try {
      const result = db.prepare(`
        INSERT INTO camioneros (numero_interno, nombre, empresa, activo, logistica_id)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        body.numero_interno.trim().toUpperCase(),
        body.nombre.trim(),
        body.empresa.trim(),
        body.activo === false ? 0 : 1,
        logisticaId
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
    const logisticaId = requireRequestLogistica(request)

    if (!getCamioneroOr404(db, id)) {
      return reply.status(404).send({ error: 'Camionero no encontrado' })
    }

    try {
      assertCamioneroEnLogistica(db, id, logisticaId)
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'El número interno ya existe'
      if (msg.includes('logística')) {
        return reply.status(403).send({ error: msg })
      }
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
        INSERT INTO camionero_vehiculos (camionero_id, marca, modelo, alias, patente, activo)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        camioneroId,
        body.marca.trim(),
        body.modelo.trim(),
        body.alias?.trim() || null,
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
          alias = COALESCE(?, alias),
          patente = COALESCE(?, patente),
          activo = COALESCE(?, activo)
        WHERE id = ? AND camionero_id = ?
      `).run(
        body.marca?.trim() ?? null,
        body.modelo?.trim() ?? null,
        body.alias === undefined ? null : body.alias.trim() || null,
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
