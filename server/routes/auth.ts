import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { getDb } from '../db'
import { getPermisosForRol, signToken } from '../plugins/auth'

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/login', async (request, reply) => {
    const { username, password } = request.body as { username?: string; password?: string }

    if (!username || !password) {
      return reply.status(400).send({ error: 'Usuario y contraseña requeridos' })
    }

    const db = getDb()
    const user = db.prepare(`
      SELECT id, username, password_hash, nombre, rol_id, activo
      FROM usuarios WHERE username = ?
    `).get(username) as {
      id: number
      username: string
      password_hash: string
      nombre: string
      rol_id: number | null
      activo: number
    } | undefined

    if (!user || !user.activo) {
      return reply.status(401).send({ error: 'Credenciales inválidas' })
    }

    const valid = bcrypt.compareSync(password, user.password_hash)
    if (!valid) {
      return reply.status(401).send({ error: 'Credenciales inválidas' })
    }

    const permisos = getPermisosForRol(user.rol_id)
    const token = signToken({
      id: user.id,
      username: user.username,
      nombre: user.nombre,
      rol_id: user.rol_id,
      permisos
    })

    return {
      token,
      usuario: {
        id: user.id,
        username: user.username,
        nombre: user.nombre,
        rol_id: user.rol_id,
        permisos
      }
    }
  })

  app.get('/api/auth/me', async (request) => {
    const user = request.user!
    return {
      id: user.id,
      username: user.username,
      nombre: user.nombre,
      rol_id: user.rol_id,
      permisos: user.permisos
    }
  })
}
