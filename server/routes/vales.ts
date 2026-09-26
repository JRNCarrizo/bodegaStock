import type { FastifyInstance } from 'fastify'
import { getDb } from '../db'
import { requirePermiso } from '../plugins/auth'
import { todayIsoDateLocal } from '../utils/fechas'
import { assertValeClienteEnLogistica, requireRequestLogistica } from '../utils/logisticas'

type TipoPallet = 'NORMALIZADO' | 'DESCARTABLE'

function parseTipo(raw: unknown): TipoPallet | null {
  const t = String(raw ?? '').trim().toUpperCase()
  if (t === 'NORMALIZADO' || t === 'DESCARTABLE') return t
  return null
}

function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

export async function valesRoutes(app: FastifyInstance): Promise<void> {
  // ——— Clientes ———
  app.get(
    '/api/vales/clientes',
    { preHandler: requirePermiso('vales.ver') },
    async (request) => {
      const { q, activo } = request.query as { q?: string; activo?: string }
      const db = getDb()
      const logisticaId = requireRequestLogistica(request)
      const hoy = todayIsoDateLocal()

      let sql = `
        SELECT
          c.id, c.codigo, c.nombre, c.direccion, c.activo, c.created_at,
          COALESCE((
            SELECT SUM(v.cantidad_restante) FROM vales v
            WHERE v.cliente_id = c.id
              AND v.cantidad_restante > 0
              AND v.vencimiento >= ?
          ), 0) AS saldo_pallets
        FROM vale_clientes c
        WHERE c.logistica_id = ?
      `
      const params: unknown[] = [hoy, logisticaId]

      if (activo === '1') sql += ' AND c.activo = 1'
      else if (activo === '0') sql += ' AND c.activo = 0'

      if (q?.trim()) {
        sql += ' AND (c.codigo LIKE ? OR c.nombre LIKE ? OR c.direccion LIKE ?)'
        const term = `%${q.trim()}%`
        params.push(term, term, term)
      }

      sql += ' ORDER BY c.nombre COLLATE NOCASE ASC, c.codigo ASC'
      return db.prepare(sql).all(...params)
    }
  )

  app.post(
    '/api/vales/clientes',
    { preHandler: requirePermiso('vales.crear') },
    async (request, reply) => {
      const body = request.body as {
        codigo?: string
        nombre?: string
        direccion?: string
        activo?: boolean
      }
      const codigo = String(body.codigo ?? '').trim()
      const nombre = String(body.nombre ?? '').trim()
      const direccion = String(body.direccion ?? '').trim()
      if (!codigo) return reply.status(400).send({ error: 'El código / ID del mercado es obligatorio' })
      if (!nombre) return reply.status(400).send({ error: 'El nombre es obligatorio' })

      const db = getDb()
      const logisticaId = requireRequestLogistica(request)

      const dup = db
        .prepare('SELECT id FROM vale_clientes WHERE logistica_id = ? AND codigo = ?')
        .get(logisticaId, codigo)
      if (dup) return reply.status(400).send({ error: 'Ya existe un cliente con ese código' })

      const result = db
        .prepare(
          `
        INSERT INTO vale_clientes (codigo, nombre, direccion, activo, logistica_id)
        VALUES (?, ?, ?, ?, ?)
      `
        )
        .run(codigo, nombre, direccion, body.activo === false ? 0 : 1, logisticaId)

      return { id: Number(result.lastInsertRowid) }
    }
  )

  app.put(
    '/api/vales/clientes/:id',
    { preHandler: requirePermiso('vales.editar') },
    async (request, reply) => {
      const id = Number((request.params as { id: string }).id)
      const body = request.body as {
        codigo?: string
        nombre?: string
        direccion?: string
        activo?: boolean
      }
      const db = getDb()
      const logisticaId = requireRequestLogistica(request)

      try {
        assertValeClienteEnLogistica(db, id, logisticaId)
      } catch (e) {
        return reply.status(404).send({ error: (e as Error).message })
      }

      const codigo = String(body.codigo ?? '').trim()
      const nombre = String(body.nombre ?? '').trim()
      const direccion = String(body.direccion ?? '').trim()
      if (!codigo) return reply.status(400).send({ error: 'El código / ID del mercado es obligatorio' })
      if (!nombre) return reply.status(400).send({ error: 'El nombre es obligatorio' })

      const dup = db
        .prepare('SELECT id FROM vale_clientes WHERE logistica_id = ? AND codigo = ? AND id != ?')
        .get(logisticaId, codigo, id)
      if (dup) return reply.status(400).send({ error: 'Ya existe un cliente con ese código' })

      db.prepare(
        `
        UPDATE vale_clientes
        SET codigo = ?, nombre = ?, direccion = ?, activo = ?
        WHERE id = ? AND logistica_id = ?
      `
      ).run(codigo, nombre, direccion, body.activo === false ? 0 : 1, id, logisticaId)

      return { ok: true }
    }
  )

  // ——— Alertas de vencimiento ———
  app.get(
    '/api/vales/alertas',
    { preHandler: requirePermiso('vales.ver') },
    async (request) => {
      const { dias } = request.query as { dias?: string }
      const avisoDias = Math.max(1, Math.min(90, Number(dias) || 5))
      const db = getDb()
      const logisticaId = requireRequestLogistica(request)
      const hoy = todayIsoDateLocal()
      const hasta = addDaysIso(hoy, avisoDias)

      return db
        .prepare(
          `
        SELECT
          v.id, v.fecha, v.vencimiento, v.cantidad_inicial, v.cantidad_restante,
          v.tipo_pallet, v.observacion,
          c.id AS cliente_id, c.codigo AS cliente_codigo, c.nombre AS cliente_nombre,
          c.direccion AS cliente_direccion,
          0 AS vencido
        FROM vales v
        JOIN vale_clientes c ON c.id = v.cliente_id
        WHERE v.logistica_id = ?
          AND v.cantidad_restante > 0
          AND v.vencimiento >= ?
          AND v.vencimiento <= ?
        ORDER BY v.vencimiento ASC, c.nombre COLLATE NOCASE ASC
      `
        )
        .all(logisticaId, hoy, hasta)
    }
  )

  // ——— Saldos por cliente ———
  app.get(
    '/api/vales/saldos',
    { preHandler: requirePermiso('vales.ver') },
    async (request) => {
      const db = getDb()
      const logisticaId = requireRequestLogistica(request)
      const hoy = todayIsoDateLocal()
      return db
        .prepare(
          `
        SELECT
          c.id AS cliente_id,
          c.codigo AS cliente_codigo,
          c.nombre AS cliente_nombre,
          c.direccion AS cliente_direccion,
          v.tipo_pallet,
          COALESCE(SUM(v.cantidad_restante), 0) AS saldo
        FROM vale_clientes c
        LEFT JOIN vales v ON v.cliente_id = c.id
          AND v.cantidad_restante > 0
          AND v.vencimiento >= ?
        WHERE c.logistica_id = ? AND c.activo = 1
        GROUP BY c.id, v.tipo_pallet
        HAVING saldo > 0 OR v.tipo_pallet IS NOT NULL
        ORDER BY c.nombre COLLATE NOCASE ASC, v.tipo_pallet ASC
      `
        )
        .all(hoy, logisticaId)
    }
  )

  // ——— Listado de vales ———
  app.get(
    '/api/vales',
    { preHandler: requirePermiso('vales.ver') },
    async (request) => {
      const { cliente_id, tipo: tipoQ, solo_activos, archivados, q } = request.query as {
        cliente_id?: string
        tipo?: string
        solo_activos?: string
        archivados?: string
        q?: string
      }
      const db = getDb()
      const logisticaId = requireRequestLogistica(request)
      const hoy = todayIsoDateLocal()

      let sql = `
        SELECT
          v.id, v.cliente_id, v.fecha, v.vencimiento,
          v.cantidad_inicial, v.cantidad_restante, v.tipo_pallet, v.observacion, v.created_at,
          c.codigo AS cliente_codigo, c.nombre AS cliente_nombre, c.direccion AS cliente_direccion
        FROM vales v
        JOIN vale_clientes c ON c.id = v.cliente_id
        WHERE v.logistica_id = ?
      `
      const params: unknown[] = [logisticaId]

      if (cliente_id) {
        sql += ' AND v.cliente_id = ?'
        params.push(Number(cliente_id))
      }
      const tipoFiltro = parseTipo(tipoQ)
      if (tipoFiltro) {
        sql += ' AND v.tipo_pallet = ?'
        params.push(tipoFiltro)
      }
      if (archivados === '1') {
        // Completados (sin saldo) o vencidos
        sql += ' AND (v.cantidad_restante = 0 OR v.vencimiento < ?)'
        params.push(hoy)
      } else if (solo_activos === '1') {
        // Con saldo y aún vigentes
        sql += ' AND v.cantidad_restante > 0 AND v.vencimiento >= ?'
        params.push(hoy)
      }
      if (q?.trim()) {
        sql += ' AND (c.codigo LIKE ? OR c.nombre LIKE ? OR v.observacion LIKE ?)'
        const term = `%${q.trim()}%`
        params.push(term, term, term)
      }

      sql +=
        archivados === '1'
          ? ' ORDER BY v.vencimiento DESC, v.fecha DESC, v.id DESC'
          : ' ORDER BY v.vencimiento ASC, v.fecha ASC, v.id ASC'
      return db.prepare(sql).all(...params)
    }
  )

  app.post(
    '/api/vales',
    { preHandler: requirePermiso('vales.crear') },
    async (request, reply) => {
      const body = request.body as {
        cliente_id?: number
        fecha?: string
        vencimiento?: string
        cantidad?: number
        tipo_pallet?: string
        observacion?: string
      }
      const clienteId = Number(body.cliente_id)
      const cantidad = Math.floor(Number(body.cantidad))
      const fecha = String(body.fecha ?? '').trim()
      const vencimiento = String(body.vencimiento ?? '').trim()
      const tipo = parseTipo(body.tipo_pallet)
      const observacion = String(body.observacion ?? '').trim() || null

      if (!clienteId) return reply.status(400).send({ error: 'Cliente obligatorio' })
      if (!fecha || !vencimiento) {
        return reply.status(400).send({ error: 'Fecha y vencimiento son obligatorios' })
      }
      if (!tipo) return reply.status(400).send({ error: 'Tipo de pallet inválido' })
      if (!Number.isFinite(cantidad) || cantidad <= 0) {
        return reply.status(400).send({ error: 'Cantidad inválida' })
      }
      if (vencimiento < fecha) {
        return reply.status(400).send({ error: 'El vencimiento no puede ser anterior a la fecha del vale' })
      }

      const db = getDb()
      const logisticaId = requireRequestLogistica(request)
      const userId = request.user!.id

      try {
        assertValeClienteEnLogistica(db, clienteId, logisticaId)
      } catch (e) {
        return reply.status(400).send({ error: (e as Error).message })
      }

      const cliente = db
        .prepare('SELECT id, activo FROM vale_clientes WHERE id = ?')
        .get(clienteId) as { id: number; activo: number } | undefined
      if (!cliente || !cliente.activo) {
        return reply.status(400).send({ error: 'Cliente inactivo o inexistente' })
      }

      const result = db
        .prepare(
          `
        INSERT INTO vales (
          cliente_id, fecha, vencimiento, cantidad_inicial, cantidad_restante,
          tipo_pallet, observacion, usuario_id, logistica_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(
          clienteId,
          fecha,
          vencimiento,
          cantidad,
          cantidad,
          tipo,
          observacion,
          userId,
          logisticaId
        )

      return { id: Number(result.lastInsertRowid) }
    }
  )

  // ——— Retiros (FIFO) ———
  app.get(
    '/api/vales/retiros',
    { preHandler: requirePermiso('vales.ver') },
    async (request) => {
      const { cliente_id } = request.query as { cliente_id?: string }
      const db = getDb()
      const logisticaId = requireRequestLogistica(request)

      let sql = `
        SELECT
          r.id, r.cliente_id, r.fecha, r.cantidad, r.tipo_pallet, r.observacion, r.created_at,
          c.codigo AS cliente_codigo, c.nombre AS cliente_nombre, c.direccion AS cliente_direccion
        FROM vale_retiros r
        JOIN vale_clientes c ON c.id = r.cliente_id
        WHERE r.logistica_id = ?
      `
      const params: unknown[] = [logisticaId]
      if (cliente_id) {
        sql += ' AND r.cliente_id = ?'
        params.push(Number(cliente_id))
      }
      sql += ' ORDER BY r.fecha DESC, r.id DESC LIMIT 200'
      return db.prepare(sql).all(...params)
    }
  )

  // ——— Aplicaciones de retiro por vale (detalle FIFO) ———
  app.get(
    '/api/vales/aplicaciones',
    { preHandler: requirePermiso('vales.ver') },
    async (request) => {
      const { vale_id } = request.query as { vale_id?: string }
      const db = getDb()
      const logisticaId = requireRequestLogistica(request)

      let sql = `
        SELECT
          a.id, a.vale_id, a.retiro_id, a.cantidad,
          r.fecha, r.observacion
        FROM vale_retiro_aplicaciones a
        JOIN vale_retiros r ON r.id = a.retiro_id
        WHERE r.logistica_id = ?
      `
      const params: unknown[] = [logisticaId]
      if (vale_id) {
        sql += ' AND a.vale_id = ?'
        params.push(Number(vale_id))
      }
      sql += ' ORDER BY r.fecha DESC, a.id DESC'
      return db.prepare(sql).all(...params)
    }
  )

  app.post(
    '/api/vales/retiros',
    { preHandler: requirePermiso('vales.crear') },
    async (request, reply) => {
      const body = request.body as {
        cliente_id?: number
        fecha?: string
        cantidad?: number
        tipo_pallet?: string
        observacion?: string
      }
      const clienteId = Number(body.cliente_id)
      const cantidad = Math.floor(Number(body.cantidad))
      const fecha = String(body.fecha ?? '').trim() || todayIsoDateLocal()
      const tipo = parseTipo(body.tipo_pallet)
      const observacion = String(body.observacion ?? '').trim() || null

      if (!clienteId) return reply.status(400).send({ error: 'Cliente obligatorio' })
      if (!tipo) return reply.status(400).send({ error: 'Tipo de pallet inválido' })
      if (!Number.isFinite(cantidad) || cantidad <= 0) {
        return reply.status(400).send({ error: 'Cantidad inválida' })
      }

      const db = getDb()
      const logisticaId = requireRequestLogistica(request)
      const userId = request.user!.id

      try {
        assertValeClienteEnLogistica(db, clienteId, logisticaId)
      } catch (e) {
        return reply.status(400).send({ error: (e as Error).message })
      }

      const vales = db
        .prepare(
          `
        SELECT id, cantidad_restante, vencimiento, fecha
        FROM vales
        WHERE cliente_id = ?
          AND logistica_id = ?
          AND tipo_pallet = ?
          AND cantidad_restante > 0
          AND vencimiento >= ?
        ORDER BY vencimiento ASC, fecha ASC, id ASC
      `
        )
        .all(clienteId, logisticaId, tipo, todayIsoDateLocal()) as Array<{
        id: number
        cantidad_restante: number
        vencimiento: string
        fecha: string
      }>

      const disponible = vales.reduce((s, v) => s + v.cantidad_restante, 0)
      if (cantidad > disponible) {
        return reply.status(400).send({
          error: `Saldo insuficiente: hay ${disponible} pallet(s) ${tipo.toLowerCase()} vigentes en vales`
        })
      }

      try {
        const result = db.transaction(() => {
          const ins = db
            .prepare(
              `
            INSERT INTO vale_retiros (
              cliente_id, fecha, cantidad, tipo_pallet, observacion, usuario_id, logistica_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `
            )
            .run(clienteId, fecha, cantidad, tipo, observacion, userId, logisticaId)
          const retiroId = Number(ins.lastInsertRowid)

          let pendiente = cantidad
          const updateVale = db.prepare(`
            UPDATE vales SET cantidad_restante = ? WHERE id = ?
          `)
          const insertApp = db.prepare(`
            INSERT INTO vale_retiro_aplicaciones (retiro_id, vale_id, cantidad)
            VALUES (?, ?, ?)
          `)

          for (const vale of vales) {
            if (pendiente <= 0) break
            const tomar = Math.min(pendiente, vale.cantidad_restante)
            updateVale.run(vale.cantidad_restante - tomar, vale.id)
            insertApp.run(retiroId, vale.id, tomar)
            pendiente -= tomar
          }

          if (pendiente > 0) throw new Error('No se pudo aplicar el retiro completo')
          return { id: retiroId }
        })()

        return result
      } catch (e) {
        return reply.status(400).send({ error: (e as Error).message })
      }
    }
  )
}
