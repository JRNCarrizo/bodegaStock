import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { getDb } from '../db'
import { isAdministradorRol } from '../utils/secciones'
import {
  exportDatabaseDump,
  importDatabaseDump,
  summarizeDump,
} from '../utils/migracion-dump'
import type { MigrationDump } from '../db/migration-tables'

async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const user = request.user
  if (!user) {
    await reply.status(401).send({ error: 'No autorizado' })
    return false
  }
  const db = getDb()
  if (!isAdministradorRol(db, user.rol_id)) {
    await reply.status(403).send({ error: 'Solo administradores pueden migrar datos' })
    return false
  }
  return true
}

export async function migracionRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/migracion/export', async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return
    const db = getDb()
    const dump = exportDatabaseDump(db)
    return {
      dump,
      counts: summarizeDump(dump),
    }
  })

  app.post(
    '/api/migracion/import',
    {
      bodyLimit: 80 * 1024 * 1024,
      preHandler: async (request, reply) => {
        if (!(await requireAdmin(request, reply))) return
      },
    },
    async (request, reply) => {
      const body = request.body as { dump?: MigrationDump; confirmacion?: string }
      if (body.confirmacion !== 'MIGRAR') {
        return reply.status(400).send({
          error: 'Escribí MIGRAR para confirmar. Esto reemplaza los datos de la base destino.',
        })
      }
      if (!body.dump) {
        return reply.status(400).send({ error: 'Falta el dump de datos' })
      }

      const db = getDb()
      try {
        const { imported } = importDatabaseDump(db, body.dump)
        return {
          ok: true,
          imported,
          message:
            'Migración completa. Cerrá sesión y volvé a entrar con un usuario de la base migrada.',
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error al importar'
        return reply.status(500).send({ error: message })
      }
    }
  )
}
