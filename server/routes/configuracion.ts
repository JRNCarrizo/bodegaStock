import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { getDb } from '../db'
import { isAdministradorRol } from '../utils/secciones'
import {
  getRetornosDobleVerificacion,
  setRetornosDobleVerificacion,
  getMovimientosDobleVerificacion,
  setMovimientosDobleVerificacion
} from '../utils/app-settings'

async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = request.user
  if (!user) {
    return reply.status(401).send({ error: 'No autorizado' })
  }
  const db = getDb()
  if (!isAdministradorRol(db, user.rol_id)) {
    return reply.status(403).send({ error: 'Solo administradores pueden cambiar esta configuración' })
  }
}

export async function configuracionRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/configuracion/retornos', async () => {
    const db = getDb()
    return {
      doble_verificacion: getRetornosDobleVerificacion(db)
    }
  })

  app.put('/api/configuracion/retornos', {
    preHandler: requireAdmin
  }, async (request, reply) => {
    const body = request.body as { doble_verificacion?: boolean }
    if (typeof body.doble_verificacion !== 'boolean') {
      return reply.status(400).send({ error: 'doble_verificacion debe ser true o false' })
    }

    const db = getDb()
    setRetornosDobleVerificacion(db, body.doble_verificacion)

    return {
      doble_verificacion: getRetornosDobleVerificacion(db)
    }
  })

  app.get('/api/configuracion/movimientos', async () => {
    const db = getDb()
    return {
      doble_verificacion: getMovimientosDobleVerificacion(db)
    }
  })

  app.put('/api/configuracion/movimientos', {
    preHandler: requireAdmin
  }, async (request, reply) => {
    const body = request.body as { doble_verificacion?: boolean }
    if (typeof body.doble_verificacion !== 'boolean') {
      return reply.status(400).send({ error: 'doble_verificacion debe ser true o false' })
    }

    const db = getDb()
    setMovimientosDobleVerificacion(db, body.doble_verificacion)

    return {
      doble_verificacion: getMovimientosDobleVerificacion(db)
    }
  })
}
