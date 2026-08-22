import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type Database from 'better-sqlite3'
import { getDb } from '../db'

const INVENTARIO_ACTIVO_MSG =
  'Hay un inventario en curso. Las operaciones están suspendidas hasta que finalice.'

export function getInventarioActivo(
  db: Database.Database,
  logisticaId?: number
): {
  id: number
  nombre: string
  estado: string
} | null {
  let sql = `
    SELECT id, nombre, estado FROM inventario_sesiones
    WHERE estado = 'EN_PROGRESO'
  `
  const params: number[] = []
  if (logisticaId != null) {
    sql += ' AND logistica_id = ?'
    params.push(logisticaId)
  }
  sql += ' ORDER BY id DESC LIMIT 1'
  const row = db.prepare(sql).get(...params) as
    | { id: number; nombre: string; estado: string }
    | undefined
  return row ?? null
}

export function assertNoInventarioActivo(db: Database.Database, logisticaId?: number): void {
  const activo = getInventarioActivo(db, logisticaId)
  if (activo) {
    throw new Error(INVENTARIO_ACTIVO_MSG)
  }
}

export function inventarioActivoErrorPayload(db: Database.Database, logisticaId?: number) {
  const activo = getInventarioActivo(db, logisticaId)
  return {
    error: INVENTARIO_ACTIVO_MSG,
    inventario_activo: activo
  }
}

export function blockIfInventarioActivo() {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const db = getDb()
    if (getInventarioActivo(db, request.logisticaId)) {
      reply.status(423).send(inventarioActivoErrorPayload(db, request.logisticaId))
    }
  }
}
