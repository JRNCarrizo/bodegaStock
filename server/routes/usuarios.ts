import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { getDb } from '../db'
import { requirePermiso } from '../plugins/auth'

export async function usuariosRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/usuarios', {
    preHandler: requirePermiso('usuarios.ver')
  }, async () => {
    const db = getDb()
    return db.prepare(`
      SELECT u.id, u.username, u.nombre, u.activo, u.created_at,
             r.id as rol_id, r.nombre as rol_nombre
      FROM usuarios u
      LEFT JOIN roles r ON r.id = u.rol_id
      ORDER BY u.nombre
    `).all()
  })

  app.get('/api/roles', {
    preHandler: requirePermiso('usuarios.ver')
  }, async () => {
    const db = getDb()
    return db.prepare('SELECT id, nombre, descripcion FROM roles ORDER BY nombre').all()
  })

  app.post('/api/usuarios', {
    preHandler: requirePermiso('usuarios.crear')
  }, async (request, reply) => {
    const body = request.body as {
      username?: string
      password?: string
      nombre?: string
      rol_id?: number | null
      activo?: boolean
    }

    if (!body.username?.trim() || !body.password || !body.nombre?.trim()) {
      return reply.status(400).send({ error: 'Username, contraseña y nombre son requeridos' })
    }
    if (!body.rol_id) {
      return reply.status(400).send({ error: 'Seleccioná un rol — define qué puede hacer el usuario' })
    }

    const db = getDb()
    const rol = db.prepare('SELECT id FROM roles WHERE id = ?').get(body.rol_id)
    if (!rol) {
      return reply.status(400).send({ error: 'Rol no válido' })
    }
    const hash = bcrypt.hashSync(body.password, 10)

    try {
      const result = db.prepare(`
        INSERT INTO usuarios (username, password_hash, nombre, rol_id, activo)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        body.username.trim(),
        hash,
        body.nombre.trim(),
        body.rol_id ?? null,
        body.activo === false ? 0 : 1
      )

      return { id: result.lastInsertRowid }
    } catch {
      return reply.status(409).send({ error: 'El username ya existe' })
    }
  })

  app.put('/api/usuarios/:id', {
    preHandler: requirePermiso('usuarios.editar')
  }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id)
    const body = request.body as {
      username?: string
      password?: string
      nombre?: string
      rol_id?: number | null
      activo?: boolean
    }

    const db = getDb()
    const existing = db.prepare('SELECT id, rol_id FROM usuarios WHERE id = ?').get(id) as
      | { id: number; rol_id: number | null }
      | undefined
    if (!existing) return reply.status(404).send({ error: 'Usuario no encontrado' })

    const rolId = body.rol_id !== undefined ? body.rol_id : existing.rol_id
    if (rolId) {
      const rol = db.prepare('SELECT id FROM roles WHERE id = ?').get(rolId)
      if (!rol) return reply.status(400).send({ error: 'Rol no válido' })
    }

    if (body.password) {
      const hash = bcrypt.hashSync(body.password, 10)
      db.prepare(`
        UPDATE usuarios SET
          username = COALESCE(?, username),
          nombre = COALESCE(?, nombre),
          rol_id = ?,
          activo = COALESCE(?, activo),
          password_hash = ?,
          updated_at = datetime('now')
        WHERE id = ?
      `).run(
        body.username?.trim() ?? null,
        body.nombre?.trim() ?? null,
        rolId,
        body.activo === undefined ? null : body.activo ? 1 : 0,
        hash,
        id
      )
    } else {
      db.prepare(`
        UPDATE usuarios SET
          username = COALESCE(?, username),
          nombre = COALESCE(?, nombre),
          rol_id = ?,
          activo = COALESCE(?, activo),
          updated_at = datetime('now')
        WHERE id = ?
      `).run(
        body.username?.trim() ?? null,
        body.nombre?.trim() ?? null,
        rolId,
        body.activo === undefined ? null : body.activo ? 1 : 0,
        id
      )
    }

    return { ok: true }
  })
}
