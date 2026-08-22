import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { getDb } from '../db'
import { requirePermiso } from '../plugins/auth'
import { isAdministradorRol } from '../utils/secciones'
import { getInventarioActivo } from '../utils/inventario-block'
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

  app.put(
    '/api/configuracion/retornos',
    {
      preHandler: requirePermiso('configuracion.ver')
    },
    async (request, reply) => {
      const body = request.body as { doble_verificacion?: boolean }
      if (typeof body.doble_verificacion !== 'boolean') {
        return reply.status(400).send({ error: 'doble_verificacion debe ser true o false' })
      }

      const db = getDb()
      setRetornosDobleVerificacion(db, body.doble_verificacion)

      return {
        doble_verificacion: getRetornosDobleVerificacion(db)
      }
    }
  )

  app.get('/api/configuracion/movimientos', async () => {
    const db = getDb()
    return {
      doble_verificacion: getMovimientosDobleVerificacion(db)
    }
  })

  app.put(
    '/api/configuracion/movimientos',
    {
      preHandler: requirePermiso('configuracion.ver')
    },
    async (request, reply) => {
      const body = request.body as { doble_verificacion?: boolean }
      if (typeof body.doble_verificacion !== 'boolean') {
        return reply.status(400).send({ error: 'doble_verificacion debe ser true o false' })
      }

      const db = getDb()
      setMovimientosDobleVerificacion(db, body.doble_verificacion)

      return {
        doble_verificacion: getMovimientosDobleVerificacion(db)
      }
    }
  )

  /**
   * Lleva el stock físico a cero (líneas y totales).
   * Conserva productos, sectores, ubicaciones y usuarios.
   * Solo admin. Bloqueado si hay inventario EN_PROGRESO.
   */
  app.post<{ Body: { confirmacion?: string } }>(
    '/api/configuracion/reset-stock',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const body = request.body ?? {}
      if (String(body.confirmacion ?? '').trim().toUpperCase() !== 'CERO') {
        return reply.status(400).send({
          error: 'Para confirmar, enviá confirmacion: "CERO"'
        })
      }

      const db = getDb()
      const activo = getInventarioActivo(db)
      if (activo) {
        return reply.status(400).send({
          error: `Hay un inventario en curso ("${activo.nombre}"). Cerralo o cancelalo antes de poner el stock en cero.`
        })
      }

      const antes = db
        .prepare(
          `
        SELECT
          (SELECT COUNT(*) FROM stock_lineas) AS lineas,
          (SELECT COUNT(*) FROM stock_sector WHERE cantidad_total != 0) AS sectores_con_stock,
          (SELECT COALESCE(SUM(cantidad_total), 0) FROM stock_sector) AS total_cajas
      `
        )
        .get() as {
        lineas: number
        sectores_con_stock: number
        total_cajas: number
      }

      const result = db.transaction(() => {
        const delLineas = db.prepare(`DELETE FROM stock_lineas`).run()
        const updSectores = db
          .prepare(
            `
          UPDATE stock_sector
          SET cantidad_total = 0, updated_at = datetime('now')
        `
          )
          .run()
        return {
          lineas_borradas: Number(delLineas.changes),
          sectores_actualizados: Number(updSectores.changes)
        }
      })()

      return {
        ok: true,
        antes: {
          lineas: Number(antes.lineas),
          sectores_con_stock: Number(antes.sectores_con_stock),
          total_cajas: Number(antes.total_cajas)
        },
        ...result
      }
    }
  )
}
