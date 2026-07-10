import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import jwt from 'jsonwebtoken'
import { getDb } from '../db'
import { getPermisosForUser, getRolNombre, getSeccionesForUser, isAdministradorRol } from '../utils/secciones'

const JWT_SECRET = 'bodegastock-dev-secret-change-in-production'

export interface AuthUser {
  id: number
  username: string
  nombre: string
  rol_id: number | null
  permisos: string[]
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser
  }
}

export function signToken(user: AuthUser): string {
  return jwt.sign(
    { id: user.id, username: user.username, nombre: user.nombre, rol_id: user.rol_id },
    JWT_SECRET,
    { expiresIn: '12h' }
  )
}

export function buildAuthUser(payload: {
  id: number
  username: string
  nombre: string
  rol_id: number | null
}): AuthUser {
  const db = getDb()
  return {
    ...payload,
    permisos: getPermisosForUser(db, payload.id, payload.rol_id)
  }
}

export function authUserResponse(user: AuthUser) {
  const db = getDb()
  const rolNombre = getRolNombre(db, user.rol_id)
  const esAdmin = isAdministradorRol(db, user.rol_id)
  const secciones = esAdmin ? [] : getSeccionesForUser(db, user.id)
  return {
    id: user.id,
    username: user.username,
    nombre: user.nombre,
    rol_id: user.rol_id,
    rol_nombre: rolNombre,
    es_admin: esAdmin,
    secciones,
    permisos: user.permisos
  }
}

export function registerAuthHook(app: FastifyInstance): void {
  app.decorateRequest('user', undefined)

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const publicRoutes = ['/api/auth/login', '/api/health', '/api/server/info']
    if (publicRoutes.some((r) => request.url.startsWith(r))) return

    const header = request.headers.authorization
    if (!header?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'No autorizado' })
    }

    try {
      const payload = jwt.verify(header.slice(7), JWT_SECRET) as {
        id: number
        username: string
        nombre: string
        rol_id: number | null
      }
      request.user = buildAuthUser(payload)
    } catch {
      return reply.status(401).send({ error: 'Token inválido o expirado' })
    }
  })
}

export function requirePermiso(...codigos: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = request.user
    if (!user) {
      return reply.status(401).send({ error: 'No autorizado' })
    }
    const hasAll = codigos.every((c) => user.permisos.includes(c))
    if (!hasAll) {
      return reply.status(403).send({ error: 'Sin permiso para esta acción' })
    }
  }
}

/** Al menos uno de los permisos indicados. */
export function requirePermisoAny(...codigos: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = request.user
    if (!user) {
      return reply.status(401).send({ error: 'No autorizado' })
    }
    const hasAny = codigos.some((c) => user.permisos.includes(c))
    if (!hasAny) {
      return reply.status(403).send({ error: 'Sin permiso para esta acción' })
    }
  }
}
