import type { FastifyInstance } from 'fastify'
import { getDb } from '../db'
import { requirePermiso } from '../plugins/auth'
import {
  getMovimientosDiaReport,
  getReporteDetalle,
  getRetornosPerdidosDia,
  resolveReporteDateRange,
  type ReporteDetalleTipo
} from '../utils/reportes'

const DETALLE_TIPOS: ReporteDetalleTipo[] = [
  'ingresos',
  'retornos',
  'planillas',
  'roturas',
  'stock_inicial',
  'balance_final'
]

export async function reportesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/reportes/movimientos-dia', {
    preHandler: requirePermiso('reportes.ver')
  }, async (request, reply) => {
    const { fecha_desde, fecha_hasta, fecha } = request.query as {
      fecha_desde?: string
      fecha_hasta?: string
      fecha?: string
    }

    const db = getDb()
    try {
      const desde = fecha_desde ?? fecha
      const hasta = fecha_hasta ?? fecha
      return getMovimientosDiaReport(db, desde, hasta)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Parámetros inválidos'
      return reply.status(400).send({ error: message })
    }
  })

  app.get('/api/reportes/movimientos-dia/detalle', {
    preHandler: requirePermiso('reportes.ver')
  }, async (request, reply) => {
    const { tipo, fecha_desde, fecha_hasta, fecha } = request.query as {
      tipo?: string
      fecha_desde?: string
      fecha_hasta?: string
      fecha?: string
    }

    if (!tipo || !DETALLE_TIPOS.includes(tipo as ReporteDetalleTipo)) {
      return reply.status(400).send({ error: 'Tipo de detalle inválido' })
    }

    const db = getDb()
    try {
      const desde = fecha_desde ?? fecha
      const hasta = fecha_hasta ?? fecha
      return getReporteDetalle(db, tipo as ReporteDetalleTipo, desde, hasta)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Parámetros inválidos'
      return reply.status(400).send({ error: message })
    }
  })

  app.get('/api/reportes/movimientos-dia/perdidos', {
    preHandler: requirePermiso('reportes.ver')
  }, async (request, reply) => {
    const { fecha_desde, fecha_hasta, fecha } = request.query as {
      fecha_desde?: string
      fecha_hasta?: string
      fecha?: string
    }

    const db = getDb()
    try {
      const desde = fecha_desde ?? fecha
      const hasta = fecha_hasta ?? fecha
      const range = resolveReporteDateRange(desde, hasta)
      const items = getRetornosPerdidosDia(db, range.desde, range.hasta)
      return {
        fecha_desde: range.desde,
        fecha_hasta: range.hasta,
        items
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Parámetros inválidos'
      return reply.status(400).send({ error: message })
    }
  })
}
