import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { getDb } from '../db'
import { requirePermiso } from '../plugins/auth'
import {
  getSeccionesForUser,
  SECCIONES_ASIGNABLES,
  setUsuarioSecciones,
  validateSeccionesForRol
} from '../utils/secciones'

function mapUsuarioRow(
  db: ReturnType<typeof getDb>,
  row: {
    id: number
    username: string
    nombre: string
    activo: number
    created_at: string
    rol_id: number | null
    rol_nombre: string | null
  }
) {
  return {
    ...row,
    secciones: getSeccionesForUser(db, row.id)
  }
}

export async function usuariosRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/secciones', {
    preHandler: requirePermiso('usuarios.ver')
  }, async () => {
    return SECCIONES_ASIGNABLES
  })

  app.get('/api/usuarios', {
    preHandler: requirePermiso('usuarios.ver')
  }, async () => {
    const db = getDb()
    const rows = db.prepare(`
      SELECT u.id, u.username, u.nombre, u.activo, u.created_at,
             r.id as rol_id, r.nombre as rol_nombre
      FROM usuarios u
      LEFT JOIN roles r ON r.id = u.rol_id
      ORDER BY u.nombre
    `).all() as {
      id: number
      username: string
      nombre: string
      activo: number
      created_at: string
      rol_id: number | null
      rol_nombre: string | null
    }[]
    return rows.map((row) => mapUsuarioRow(db, row))
  })

  app.get('/api/roles', {
    preHandler: requirePermiso('usuarios.ver')
  }, async () => {
    const db = getDb()
    return db.prepare(`
      SELECT id, nombre, descripcion FROM roles
      WHERE nombre IN ('Administrador', 'Usuario')
      ORDER BY CASE nombre WHEN 'Administrador' THEN 0 ELSE 1 END
    `).all()
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
      secciones?: string[]
    }

    if (!body.username?.trim() || !body.password || !body.nombre?.trim()) {
      return reply.status(400).send({ error: 'Username, contraseña y nombre son requeridos' })
    }
    if (!body.rol_id) {
      return reply.status(400).send({ error: 'Seleccioná un rol — define qué puede hacer el usuario' })
    }

    const db = getDb()
    const rol = db.prepare('SELECT id, nombre FROM roles WHERE id = ?').get(body.rol_id) as
      | { id: number; nombre: string }
      | undefined
    if (!rol || !['Administrador', 'Usuario'].includes(rol.nombre)) {
      return reply.status(400).send({ error: 'Rol no válido' })
    }

    const seccionesCheck = validateSeccionesForRol(db, body.rol_id, body.secciones)
    if (!seccionesCheck.ok) {
      return reply.status(400).send({ error: seccionesCheck.error })
    }

    const hash = bcrypt.hashSync(body.password, 10)

    try {
      const tx = db.transaction(() => {
        const result = db.prepare(`
          INSERT INTO usuarios (username, password_hash, nombre, rol_id, activo)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          body.username!.trim(),
          hash,
          body.nombre!.trim(),
          body.rol_id ?? null,
          body.activo === false ? 0 : 1
        )
        const userId = Number(result.lastInsertRowid)
        setUsuarioSecciones(db, userId, seccionesCheck.secciones)
        return userId
      })

      return { id: tx() }
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
      secciones?: string[]
    }

    const db = getDb()
    const existing = db.prepare('SELECT id, rol_id FROM usuarios WHERE id = ?').get(id) as
      | { id: number; rol_id: number | null }
      | undefined
    if (!existing) return reply.status(404).send({ error: 'Usuario no encontrado' })

    const rolId = body.rol_id !== undefined ? body.rol_id : existing.rol_id
    if (rolId) {
      const rol = db.prepare('SELECT id, nombre FROM roles WHERE id = ?').get(rolId) as
        | { id: number; nombre: string }
        | undefined
      if (!rol || !['Administrador', 'Usuario'].includes(rol.nombre)) {
        return reply.status(400).send({ error: 'Rol no válido' })
      }
    }

    const seccionesInput =
      body.secciones !== undefined
        ? body.secciones
        : rolId
          ? getSeccionesForUser(db, id)
          : []

    if (rolId) {
      const seccionesCheck = validateSeccionesForRol(db, rolId, seccionesInput)
      if (!seccionesCheck.ok) {
        return reply.status(400).send({ error: seccionesCheck.error })
      }

      const tx = db.transaction(() => {
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
        setUsuarioSecciones(db, id, seccionesCheck.secciones)
      })
      tx()
    } else if (body.password) {
      const hash = bcrypt.hashSync(body.password, 10)
      db.prepare(`
        UPDATE usuarios SET
          username = COALESCE(?, username),
          nombre = COALESCE(?, nombre),
          activo = COALESCE(?, activo),
          password_hash = ?,
          updated_at = datetime('now')
        WHERE id = ?
      `).run(
        body.username?.trim() ?? null,
        body.nombre?.trim() ?? null,
        body.activo === undefined ? null : body.activo ? 1 : 0,
        hash,
        id
      )
    }

    return { ok: true }
  })
}
