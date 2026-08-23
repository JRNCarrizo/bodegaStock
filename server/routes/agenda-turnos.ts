import type { FastifyInstance } from 'fastify'
import { getDb } from '../db'
import { requirePermiso } from '../plugins/auth'
import {
  getAgendaDiasInhabiles,
  isAgendaDiaInhabil,
  setAgendaDiasInhabiles
} from '../utils/app-settings'

const UNIDADES = new Set(['PALLETS', 'CAJAS', 'BULTOS'])
const ESTADOS = new Set(['SOLICITADO', 'CONFIRMADO', 'CANCELADO'])

interface TransportistaBody {
  nombre?: string
  activo?: boolean
}

interface TurnoBody {
  fecha?: string
  descripcion?: string
  cantidad?: number | null
  unidad?: string
  transportista_id?: number
  notas?: string | null
  estado?: string
}

function parseCantidadOpcional(
  value: unknown
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (value == null || value === '') return { ok: true, value: null }
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: false, error: 'La cantidad debe ser mayor a 0' }
  }
  return { ok: true, value: n }
}

function isFechaIso(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

const TURNO_SELECT = `
  SELECT
    t.id,
    t.fecha,
    t.descripcion,
    t.cantidad,
    t.unidad,
    t.transportista_id,
    tr.nombre AS transportista_nombre,
    t.notas,
    t.estado,
    t.creado_por_id,
    u.nombre AS creado_por_nombre,
    t.created_at,
    t.updated_at
  FROM agenda_turnos t
  JOIN insumos_transportistas tr ON tr.id = t.transportista_id
  LEFT JOIN usuarios u ON u.id = t.creado_por_id
`

export async function agendaTurnosRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/insumos-transportistas', {
    preHandler: requirePermiso('agenda_turnos.ver')
  }, async (request) => {
    const { activo } = request.query as { activo?: string }
    const db = getDb()
    let sql = `
      SELECT id, nombre, activo, created_at
      FROM insumos_transportistas
      WHERE 1=1
    `
    if (activo === '1') sql += ' AND activo = 1'
    else if (activo === '0') sql += ' AND activo = 0'
    sql += ' ORDER BY nombre COLLATE NOCASE ASC'
    return db.prepare(sql).all()
  })

  app.post('/api/insumos-transportistas', {
    preHandler: requirePermiso('agenda_turnos.crear')
  }, async (request, reply) => {
    const body = request.body as TransportistaBody
    const nombre = String(body.nombre ?? '').trim()
    if (!nombre) return reply.status(400).send({ error: 'El nombre es obligatorio' })

    const db = getDb()
    const result = db
      .prepare('INSERT INTO insumos_transportistas (nombre, activo) VALUES (?, 1)')
      .run(nombre)
    const row = db
      .prepare('SELECT id, nombre, activo, created_at FROM insumos_transportistas WHERE id = ?')
      .get(result.lastInsertRowid)
    return reply.status(201).send(row)
  })

  app.put('/api/insumos-transportistas/:id', {
    preHandler: requirePermiso('agenda_turnos.editar')
  }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id)
    const body = request.body as TransportistaBody
    const db = getDb()
    const existing = db.prepare('SELECT id FROM insumos_transportistas WHERE id = ?').get(id)
    if (!existing) return reply.status(404).send({ error: 'Transportista no encontrado' })

    const nombre = body.nombre != null ? String(body.nombre).trim() : undefined
    if (nombre !== undefined && !nombre) {
      return reply.status(400).send({ error: 'El nombre es obligatorio' })
    }

    const activo =
      body.activo === undefined ? undefined : body.activo ? 1 : 0

    db.prepare(`
      UPDATE insumos_transportistas SET
        nombre = COALESCE(?, nombre),
        activo = COALESCE(?, activo)
      WHERE id = ?
    `).run(nombre ?? null, activo ?? null, id)

    return db
      .prepare('SELECT id, nombre, activo, created_at FROM insumos_transportistas WHERE id = ?')
      .get(id)
  })

  app.get('/api/agenda-turnos/config', {
    preHandler: requirePermiso('agenda_turnos.ver')
  }, async () => {
    const db = getDb()
    return { dias_inhabiles: getAgendaDiasInhabiles(db) }
  })

  app.put('/api/agenda-turnos/config', {
    preHandler: requirePermiso('agenda_turnos.editar')
  }, async (request, reply) => {
    const body = request.body as { dias_inhabiles?: unknown }
    if (!Array.isArray(body.dias_inhabiles)) {
      return reply.status(400).send({ error: 'dias_inhabiles debe ser un array' })
    }
    const dias = body.dias_inhabiles.map((n) => Number(n))
    if (dias.some((n) => !Number.isInteger(n) || n < 0 || n > 6)) {
      return reply.status(400).send({ error: 'Cada día debe ser un índice 0–6 (Lun–Dom)' })
    }
    const db = getDb()
    setAgendaDiasInhabiles(db, dias)
    return { dias_inhabiles: getAgendaDiasInhabiles(db) }
  })

  app.get('/api/agenda-turnos/pendientes-count', {
    preHandler: requirePermiso('agenda_turnos.ver')
  }, async () => {
    const db = getDb()
    const row = db
      .prepare(`
        SELECT COUNT(*) AS count
        FROM agenda_turnos
        WHERE estado = 'SOLICITADO'
      `)
      .get() as { count: number } | undefined
    return { count: row?.count ?? 0 }
  })

  app.get('/api/agenda-turnos', {
    preHandler: requirePermiso('agenda_turnos.ver')
  }, async (request) => {
    const { desde, hasta, estado, q } = request.query as {
      desde?: string
      hasta?: string
      estado?: string
      q?: string
    }
    const db = getDb()
    let sql = `${TURNO_SELECT} WHERE 1=1`
    const params: unknown[] = []

    if (desde && isFechaIso(desde)) {
      sql += ' AND t.fecha >= ?'
      params.push(desde)
    }
    if (hasta && isFechaIso(hasta)) {
      sql += ' AND t.fecha <= ?'
      params.push(hasta)
    }
    if (estado && ESTADOS.has(estado)) {
      sql += ' AND t.estado = ?'
      params.push(estado)
    }
    if (q?.trim()) {
      sql += ` AND (
        t.descripcion LIKE ? OR t.notas LIKE ? OR tr.nombre LIKE ?
      )`
      const term = `%${q.trim()}%`
      params.push(term, term, term)
    }

    sql += ' ORDER BY t.fecha ASC, t.id ASC'
    return db.prepare(sql).all(...params)
  })

  app.get('/api/agenda-turnos/:id', {
    preHandler: requirePermiso('agenda_turnos.ver')
  }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id)
    if (!Number.isFinite(id)) return reply.status(400).send({ error: 'ID inválido' })
    const db = getDb()
    const row = db.prepare(`${TURNO_SELECT} WHERE t.id = ?`).get(id)
    if (!row) return reply.status(404).send({ error: 'Turno no encontrado' })
    return row
  })

  app.post('/api/agenda-turnos', {
    preHandler: requirePermiso('agenda_turnos.crear')
  }, async (request, reply) => {
    const body = request.body as TurnoBody
    const fecha = String(body.fecha ?? '').trim()
    const descripcion = String(body.descripcion ?? '').trim()
    const cantidadParsed = parseCantidadOpcional(body.cantidad)
    const unidad = String(body.unidad ?? 'PALLETS').trim().toUpperCase()
    const transportistaId = Number(body.transportista_id)
    const notas = body.notas != null ? String(body.notas).trim() || null : null

    if (!isFechaIso(fecha)) {
      return reply.status(400).send({ error: 'Fecha inválida (YYYY-MM-DD)' })
    }
    if (!descripcion) {
      return reply.status(400).send({ error: 'La descripción es obligatoria' })
    }
    if (!cantidadParsed.ok) {
      return reply.status(400).send({ error: cantidadParsed.error })
    }
    const cantidad = cantidadParsed.value
    if (!UNIDADES.has(unidad)) {
      return reply.status(400).send({ error: 'Unidad inválida' })
    }
    if (!Number.isFinite(transportistaId)) {
      return reply.status(400).send({ error: 'Transportista obligatorio' })
    }

    const db = getDb()
    if (isAgendaDiaInhabil(db, fecha)) {
      return reply.status(400).send({
        error: 'Ese día está anulado (no laborable). Cambiá la fecha o la configuración de días.'
      })
    }

    const transportista = db
      .prepare('SELECT id, activo FROM insumos_transportistas WHERE id = ?')
      .get(transportistaId) as { id: number; activo: number } | undefined
    if (!transportista) {
      return reply.status(400).send({ error: 'Transportista no encontrado' })
    }
    if (!transportista.activo) {
      return reply.status(400).send({ error: 'El transportista está inactivo' })
    }

    const userId = request.user?.id ?? null
    const result = db
      .prepare(`
        INSERT INTO agenda_turnos (
          fecha, descripcion, cantidad, unidad, transportista_id, notas, estado, creado_por_id
        ) VALUES (?, ?, ?, ?, ?, ?, 'SOLICITADO', ?)
      `)
      .run(fecha, descripcion, cantidad, unidad, transportistaId, notas, userId)

    const row = db.prepare(`${TURNO_SELECT} WHERE t.id = ?`).get(result.lastInsertRowid)
    return reply.status(201).send(row)
  })

  app.put('/api/agenda-turnos/:id', {
    preHandler: requirePermiso('agenda_turnos.editar')
  }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id)
    const body = request.body as TurnoBody
    const db = getDb()
    const existing = db.prepare('SELECT id FROM agenda_turnos WHERE id = ?').get(id)
    if (!existing) return reply.status(404).send({ error: 'Turno no encontrado' })

    const fecha = body.fecha != null ? String(body.fecha).trim() : undefined
    const descripcion = body.descripcion != null ? String(body.descripcion).trim() : undefined
    const hasCantidad = Object.prototype.hasOwnProperty.call(body, 'cantidad')
    let cantidad: number | null | undefined
    if (hasCantidad) {
      const cantidadParsed = parseCantidadOpcional(body.cantidad)
      if (!cantidadParsed.ok) {
        return reply.status(400).send({ error: cantidadParsed.error })
      }
      cantidad = cantidadParsed.value
    }
    const unidad =
      body.unidad != null ? String(body.unidad).trim().toUpperCase() : undefined
    const transportistaId =
      body.transportista_id != null ? Number(body.transportista_id) : undefined
    const notas =
      body.notas === undefined
        ? undefined
        : body.notas == null
          ? null
          : String(body.notas).trim() || null
    const estado =
      body.estado != null ? String(body.estado).trim().toUpperCase() : undefined

    if (fecha !== undefined && !isFechaIso(fecha)) {
      return reply.status(400).send({ error: 'Fecha inválida (YYYY-MM-DD)' })
    }
    if (fecha !== undefined && isAgendaDiaInhabil(db, fecha)) {
      return reply.status(400).send({
        error: 'Ese día está anulado (no laborable). Cambiá la fecha o la configuración de días.'
      })
    }
    if (descripcion !== undefined && !descripcion) {
      return reply.status(400).send({ error: 'La descripción es obligatoria' })
    }
    if (unidad !== undefined && !UNIDADES.has(unidad)) {
      return reply.status(400).send({ error: 'Unidad inválida' })
    }
    if (estado !== undefined && !ESTADOS.has(estado)) {
      return reply.status(400).send({ error: 'Estado inválido' })
    }
    if (transportistaId !== undefined) {
      if (!Number.isFinite(transportistaId)) {
        return reply.status(400).send({ error: 'Transportista inválido' })
      }
      const transportista = db
        .prepare('SELECT id FROM insumos_transportistas WHERE id = ?')
        .get(transportistaId)
      if (!transportista) {
        return reply.status(400).send({ error: 'Transportista no encontrado' })
      }
    }

    db.prepare(`
      UPDATE agenda_turnos SET
        fecha = COALESCE(?, fecha),
        descripcion = COALESCE(?, descripcion),
        cantidad = CASE WHEN ? THEN ? ELSE cantidad END,
        unidad = COALESCE(?, unidad),
        transportista_id = COALESCE(?, transportista_id),
        notas = CASE WHEN ? THEN ? ELSE notas END,
        estado = COALESCE(?, estado),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      fecha ?? null,
      descripcion ?? null,
      hasCantidad ? 1 : 0,
      hasCantidad ? cantidad : null,
      unidad ?? null,
      transportistaId ?? null,
      body.notas !== undefined ? 1 : 0,
      notas,
      estado ?? null,
      id
    )

    return db.prepare(`${TURNO_SELECT} WHERE t.id = ?`).get(id)
  })
}
