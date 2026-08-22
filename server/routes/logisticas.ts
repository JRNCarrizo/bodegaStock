import type { FastifyInstance } from 'fastify'
import { getDb } from '../db'
import {
  buildAuthLogisticaPayload,
  getLogisticasPermitidas,
  getLogisticaById,
  listLogisticasActivas,
  requireRequestLogistica,
  resolveLogisticaActiva,
  setLogisticaActivaPreferida,
  usuarioPuedeElegirLogistica
} from '../utils/logisticas'

export async function logisticasRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/logisticas', async (request) => {
    const db = getDb()
    const user = request.user!
    return getLogisticasPermitidas(db, user).map((l) => ({
      id: l.id,
      codigo: l.codigo,
      nombre: l.nombre
    }))
  })

  app.put<{ Body: { logistica_id?: number } }>('/api/logisticas/activa', async (request, reply) => {
    const db = getDb()
    const user = request.user!
    const logisticaId = Number(request.body?.logistica_id)

    if (!Number.isFinite(logisticaId) || logisticaId <= 0) {
      return reply.status(400).send({ error: 'logistica_id inválido' })
    }

    const permitidas = getLogisticasPermitidas(db, user)
    if (!permitidas.some((l) => l.id === logisticaId)) {
      return reply.status(403).send({ error: 'No podés operar en esa logística' })
    }

    if (!usuarioPuedeElegirLogistica(db, user)) {
      return reply.status(403).send({ error: 'Tu usuario está asignado a una sola logística' })
    }

    const logistica = getLogisticaById(db, logisticaId)
    if (!logistica?.activo) {
      return reply.status(400).send({ error: 'Logística inactiva' })
    }

    setLogisticaActivaPreferida(db, user.id, logisticaId)

    return {
      ok: true,
      ...buildAuthLogisticaPayload(db, user),
      logistica_activa_id: logisticaId
    }
  })

  app.get('/api/logisticas/activa', async (request) => {
    const db = getDb()
    const user = request.user!
    return buildAuthLogisticaPayload(db, user)
  })
}

export { resolveLogisticaActiva, buildAuthLogisticaPayload, listLogisticasActivas }
