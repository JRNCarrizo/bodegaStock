import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import jwt from 'jsonwebtoken'
import { getDb } from '../db'

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

export function getPermisosForRol(rolId: number | null): string[] {
  if (!rolId) return []
  const db = getDb()
  const rows = db.prepare(`
    SELECT p.codigo FROM permisos p
    JOIN rol_permisos rp ON rp.permiso_id = p.id
    WHERE rp.rol_id = ?
  `).all(rolId) as { codigo: string }[]
  return rows.map((r) => r.codigo)
}

export function registerAuthHook(app: FastifyInstance): void {
  app.decorateRequest('user', undefined)

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const publicRoutes = ['/api/auth/login', '/api/health']
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
      request.user = {
        ...payload,
        permisos: getPermisosForRol(payload.rol_id)
      }
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
