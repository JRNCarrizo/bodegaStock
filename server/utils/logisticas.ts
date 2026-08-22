import type { FastifyReply, FastifyRequest } from 'fastify'
import type Database from 'better-sqlite3'
import { getDb } from '../db'
import type { AuthUser } from '../plugins/auth'
import { isAdministradorRol } from './secciones'

export const LOGISTICA_HEADER = 'x-logistica-id'

export interface LogisticaRow {
  id: number
  codigo: string
  nombre: string
  activo: number
}

declare module 'fastify' {
  interface FastifyRequest {
    logisticaId?: number
  }
}

export function ensureLogisticasSeed(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS logisticas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL UNIQUE,
      nombre TEXT NOT NULL,
      activo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  const count = (db.prepare('SELECT COUNT(*) AS n FROM logisticas').get() as { n: number }).n
  if (count === 0) {
    db.prepare(`
      INSERT INTO logisticas (codigo, nombre, activo) VALUES
        ('ESMERALDA', 'Esmeralda', 1),
        ('NAKBE', 'NAKBE', 1)
    `).run()
  }
}

export function getLogisticaEsmeraldaId(db: Database.Database): number {
  ensureLogisticasSeed(db)
  const row = db.prepare(`
    SELECT id FROM logisticas WHERE codigo = 'ESMERALDA' LIMIT 1
  `).get() as { id: number } | undefined
  if (!row) throw new Error('Logística Esmeralda no configurada')
  return row.id
}

export function listLogisticasActivas(db: Database.Database): LogisticaRow[] {
  ensureLogisticasSeed(db)
  return db.prepare(`
    SELECT id, codigo, nombre, activo FROM logisticas
    WHERE activo = 1
    ORDER BY id ASC
  `).all() as LogisticaRow[]
}

export function getLogisticaById(db: Database.Database, id: number): LogisticaRow | undefined {
  return db.prepare(`
    SELECT id, codigo, nombre, activo FROM logisticas WHERE id = ?
  `).get(id) as LogisticaRow | undefined
}

export function getUsuarioLogisticaAsignada(
  db: Database.Database,
  userId: number
): number | null {
  if (!columnExists(db, 'usuarios', 'logistica_id')) return null
  const row = db.prepare('SELECT logistica_id FROM usuarios WHERE id = ?').get(userId) as
    | { logistica_id: number | null }
    | undefined
  return row?.logistica_id ?? null
}

function columnExists(db: Database.Database, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  return cols.some((c) => c.name === column)
}

export function usuarioPuedeElegirLogistica(
  db: Database.Database,
  user: AuthUser
): boolean {
  return isAdministradorRol(db, user.rol_id)
}

export function getLogisticasPermitidas(
  db: Database.Database,
  user: AuthUser
): LogisticaRow[] {
  const all = listLogisticasActivas(db)
  if (isAdministradorRol(db, user.rol_id)) return all

  const asignada = getUsuarioLogisticaAsignada(db, user.id)
  if (asignada != null) {
    return all.filter((l) => l.id === asignada)
  }

  const defaultId = getLogisticaEsmeraldaId(db)
  return all.filter((l) => l.id === defaultId)
}

function prefKey(userId: number): string {
  return `logistica_activa:${userId}`
}

export function getLogisticaActivaPreferida(db: Database.Database, userId: number): number | null {
  const row = db.prepare(`
    SELECT valor FROM app_settings WHERE clave = ?
  `).get(prefKey(userId)) as { valor: string } | undefined
  if (!row?.valor) return null
  const id = Number(row.valor)
  return Number.isFinite(id) && id > 0 ? id : null
}

export function setLogisticaActivaPreferida(
  db: Database.Database,
  userId: number,
  logisticaId: number
): void {
  db.prepare(`
    INSERT INTO app_settings (clave, valor, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(clave) DO UPDATE SET
      valor = excluded.valor,
      updated_at = datetime('now')
  `).run(prefKey(userId), String(logisticaId))
}

export function resolveLogisticaActiva(
  db: Database.Database,
  user: AuthUser,
  headerLogisticaId?: string | string[] | undefined
): number {
  const permitidas = getLogisticasPermitidas(db, user)
  if (permitidas.length === 0) {
    return getLogisticaEsmeraldaId(db)
  }

  const asignada = getUsuarioLogisticaAsignada(db, user.id)
  if (asignada != null) {
    if (!permitidas.some((l) => l.id === asignada)) {
      return permitidas[0]!.id
    }
    return asignada
  }

  const raw = Array.isArray(headerLogisticaId) ? headerLogisticaId[0] : headerLogisticaId
  if (raw) {
    const fromHeader = Number(raw)
    if (Number.isFinite(fromHeader) && permitidas.some((l) => l.id === fromHeader)) {
      return fromHeader
    }
  }

  const pref = getLogisticaActivaPreferida(db, user.id)
  if (pref != null && permitidas.some((l) => l.id === pref)) {
    return pref
  }

  return permitidas[0]!.id
}

export function attachLogisticaToRequest(
  request: FastifyRequest,
  reply: FastifyReply
): void {
  if (!request.url.startsWith('/api/')) return
  if (!request.user) return

  const skip = [
    '/api/auth/login',
    '/api/auth/me',
    '/api/health',
    '/api/server/info',
    '/api/logisticas',
    '/api/productos',
    '/api/usuarios',
    '/api/roles',
    '/api/secciones',
    '/api/configuracion',
    '/api/migracion'
  ]
  if (skip.some((r) => request.url.startsWith(r))) return

  const db = getDb()
  const logisticaId = resolveLogisticaActiva(db, request.user, request.headers[LOGISTICA_HEADER])

  if (!getLogisticaById(db, logisticaId)?.activo) {
    reply.status(400).send({ error: 'Logística activa no válida' })
    return
  }

  request.logisticaId = logisticaId
}

export function requireRequestLogistica(request: FastifyRequest): number {
  const id = request.logisticaId
  if (!id) throw new Error('Logística no resuelta')
  return id
}

export function assertSectorEnLogistica(
  db: Database.Database,
  sectorId: number,
  logisticaId: number
): void {
  if (!columnExists(db, 'sectores', 'logistica_id')) return
  const row = db.prepare(`
    SELECT logistica_id FROM sectores WHERE id = ?
  `).get(sectorId) as { logistica_id: number } | undefined
  if (!row) throw new Error('Sector no encontrado')
  if (row.logistica_id !== logisticaId) {
    throw new Error('El sector no pertenece a la logística activa')
  }
}

export function assertCamioneroEnLogistica(
  db: Database.Database,
  camioneroId: number,
  logisticaId: number
): void {
  if (!columnExists(db, 'camioneros', 'logistica_id')) return
  const row = db.prepare(`
    SELECT logistica_id FROM camioneros WHERE id = ?
  `).get(camioneroId) as { logistica_id: number } | undefined
  if (!row) throw new Error('Camionero no encontrado')
  if (row.logistica_id !== logisticaId) {
    throw new Error('El camionero no pertenece a la logística activa')
  }
}

/** SQL fragment: AND alias.logistica_id = ? */
export function sqlFilterLogistica(alias: string, logisticaId: number): string {
  return ` AND ${alias}.logistica_id = ${logisticaId} `
}

export function buildAuthLogisticaPayload(db: Database.Database, user: AuthUser) {
  const logisticas = getLogisticasPermitidas(db, user)
  const logistica_asignada_id = getUsuarioLogisticaAsignada(db, user.id)
  const puede_cambiar = usuarioPuedeElegirLogistica(db, user) && logisticas.length > 1
  const logistica_activa_id = resolveLogisticaActiva(db, user, undefined)

  return {
    logisticas: logisticas.map((l) => ({
      id: l.id,
      codigo: l.codigo,
      nombre: l.nombre
    })),
    logistica_activa_id,
    logistica_asignada_id,
    puede_cambiar_logistica: puede_cambiar
  }
}
