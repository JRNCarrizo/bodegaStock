import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type Database from 'better-sqlite3'
import { getDb } from '../db'

const INVENTARIO_ACTIVO_MSG =
  'Hay un inventario en curso. Las operaciones están suspendidas hasta que finalice.'

export function getInventarioActivo(db: Database.Database): {
  id: number
  nombre: string
  estado: string
} | null {
  const row = db.prepare(`
    SELECT id, nombre, estado FROM inventario_sesiones
    WHERE estado = 'EN_PROGRESO'
    ORDER BY id DESC
    LIMIT 1
  `).get() as { id: number; nombre: string; estado: string } | undefined
  return row ?? null
}

export function assertNoInventarioActivo(db: Database.Database): void {
  const activo = getInventarioActivo(db)
  if (activo) {
    throw new Error(INVENTARIO_ACTIVO_MSG)
  }
}

export function inventarioActivoErrorPayload(db: Database.Database) {
  const activo = getInventarioActivo(db)
  return {
    error: INVENTARIO_ACTIVO_MSG,
    inventario_activo: activo
  }
}

export function blockIfInventarioActivo() {
  return async (_request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const db = getDb()
    if (getInventarioActivo(db)) {
      reply.status(423).send(inventarioActivoErrorPayload(db))
    }
  }
}
