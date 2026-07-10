import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { getDb } from '../db'
import { authUserResponse, buildAuthUser, signToken } from '../plugins/auth'

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

    const authUser = buildAuthUser(user)
    const token = signToken(authUser)

    return {
      token,
      usuario: authUserResponse(authUser)
    }
  })

  app.get('/api/auth/me', async (request) => {
    return authUserResponse(request.user!)
  })
}
