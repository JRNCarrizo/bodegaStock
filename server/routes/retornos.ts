import type { FastifyInstance } from 'fastify'
import { getDb } from '../db'
import { requirePermiso } from '../plugins/auth'
import { blockIfInventarioActivo } from '../utils/inventario-block'
import {
  applyRetornoLineToStock,
  formatEtiquetaLinea,
  getProductoDefaults,
  type LineaDesgloseInput
} from '../utils/stock'

type EstadoCondicion = 'BUEN_ESTADO' | 'INCOMPLETA' | 'MAL_ESTADO'

interface RetornoLineaBody {
  producto_id: number
  cantidad_cajas: number
  estado_condicion: EstadoCondicion
  sector_id: number
}

interface RetornoBody {
  fecha?: string
  numero_planilla?: string | null
  observacion?: string | null
  camionero_id?: number | null
  vehiculo_id?: number | null
  sector_id?: number | null
  lineas?: RetornoLineaBody[]
}

interface VerificarLineaBody {
  cantidad_cajas?: number
  estado_condicion?: EstadoCondicion
  sector_id?: number
  verificada?: boolean
}

function buildCajaLinea(cantidadCajas: number, unidadesPorCaja: number): LineaDesgloseInput {
  return {
    tipo_bulto: 'CAJA',
    cantidad_bultos: cantidadCajas,
    unidades_por_bulto: unidadesPorCaja
  }
}

function assertSectorActivo(db: ReturnType<typeof getDb>, sectorId: number, label: string) {
  const sector = db.prepare(`
    SELECT id FROM sectores WHERE id = ? AND activo = 1
  `).get(sectorId)
  if (!sector) throw new Error(`${label}: sector no válido`)
}

function mapLineaRow(
  row: {
    id: number
    producto_id: number
    codigo_interno: string
    nombre: string
    sector_id: number
    sector_nombre: string
    tipo_bulto: string
    cantidad_bultos: number | null
    unidades_por_bulto: number | null
    cantidad_suelta: number | null
    total_unidades: number
    estado_condicion: EstadoCondicion
    linea_verificada: number
    cantidad_verificada: number | null
    estado_verificado: EstadoCondicion | null
    orden: number
    unidad: string
  }
) {
  const linea: LineaDesgloseInput = {
    tipo_bulto: row.tipo_bulto as LineaDesgloseInput['tipo_bulto'],
    cantidad_bultos: row.cantidad_bultos,
    unidades_por_bulto: row.unidades_por_bulto,
    cantidad_suelta: row.cantidad_suelta
  }
  const cantidadEfectiva = row.cantidad_verificada ?? row.total_unidades
  const estadoEfectivo = row.estado_verificado ?? row.estado_condicion
  return {
    id: row.id,
    producto_id: row.producto_id,
    codigo_interno: row.codigo_interno,
    nombre: row.nombre,
    sector_id: row.sector_id,
    sector_nombre: row.sector_nombre,
    tipo_bulto: row.tipo_bulto,
    cantidad_bultos: row.cantidad_bultos,
    unidades_por_bulto: row.unidades_por_bulto,
    total_unidades: row.total_unidades,
    cantidad_cajas: row.total_unidades,
    cantidad_efectiva: cantidadEfectiva,
    estado_condicion: row.estado_condicion,
    estado_efectivo: estadoEfectivo,
    linea_verificada: !!row.linea_verificada,
    cantidad_verificada: row.cantidad_verificada,
    estado_verificado: row.estado_verificado,
    etiqueta: formatEtiquetaLinea(linea, row.unidad),
    orden: row.orden
  }
}

function getRetornoLineas(db: ReturnType<typeof getDb>, retornoId: number) {
  return db.prepare(`
    SELECT
      rl.id, rl.producto_id, p.codigo_interno, p.nombre, p.unidad,
      rl.sector_id, s.nombre AS sector_nombre,
      rl.tipo_bulto, rl.cantidad_bultos, rl.unidades_por_bulto, rl.cantidad_suelta,
      rl.total_unidades, rl.estado_condicion, rl.linea_verificada,
      rl.cantidad_verificada, rl.estado_verificado, rl.orden
    FROM retorno_lineas rl
    JOIN productos p ON p.id = rl.producto_id
    JOIN sectores s ON s.id = rl.sector_id
    WHERE rl.retorno_id = ?
    ORDER BY rl.orden ASC, rl.id ASC
  `).all(retornoId) as Parameters<typeof mapLineaRow>[0][]
}

function getRetornoHeader(db: ReturnType<typeof getDb>, id: number) {
  return db.prepare(`
    SELECT
      r.id, r.fecha, r.numero_planilla, r.observacion, r.sector_id, r.estado,
      r.camionero_id, r.vehiculo_id, r.cargado_por_id, r.verificado_por_id,
      r.observacion_verificacion, r.created_at, r.verificado_at,
      sd.nombre AS sector_nombre,
      c.nombre AS camionero_nombre,
      c.numero_interno AS camionero_numero,
      c.empresa AS camionero_empresa,
      cv.marca AS vehiculo_marca,
      cv.modelo AS vehiculo_modelo,
      cv.patente AS vehiculo_patente,
      uc.nombre AS cargado_por_nombre,
      uv.nombre AS verificado_por_nombre
    FROM retornos r
    LEFT JOIN sectores sd ON sd.id = r.sector_id
    LEFT JOIN camioneros c ON c.id = r.camionero_id
    LEFT JOIN camionero_vehiculos cv ON cv.id = r.vehiculo_id
    JOIN usuarios uc ON uc.id = r.cargado_por_id
    LEFT JOIN usuarios uv ON uv.id = r.verificado_por_id
    WHERE r.id = ?
  `).get(id) as {
    id: number
    fecha: string
    numero_planilla: string | null
    observacion: string | null
    sector_id: number | null
    estado: 'PENDIENTE' | 'VERIFICADO'
    camionero_id: number | null
    vehiculo_id: number | null
    cargado_por_id: number
    verificado_por_id: number | null
    observacion_verificacion: string | null
    created_at: string
    verificado_at: string | null
    sector_nombre: string | null
    camionero_nombre: string | null
    camionero_numero: string | null
    camionero_empresa: string | null
    vehiculo_marca: string | null
    vehiculo_modelo: string | null
    vehiculo_patente: string | null
    cargado_por_nombre: string
    verificado_por_nombre: string | null
  } | undefined
}

export async function retornosRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/retornos', {
    preHandler: requirePermiso('retornos.ver')
  }, async (request) => {
    const { q, fecha_desde, fecha_hasta, estado } = request.query as {
      q?: string
      fecha_desde?: string
      fecha_hasta?: string
      estado?: string
    }
    const db = getDb()

    let sql = `
      SELECT
        r.id, r.fecha, r.numero_planilla, r.observacion, r.estado, r.created_at, r.verificado_at,
        (
          SELECT CASE
            WHEN COUNT(DISTINCT rl.sector_id) > 1 THEN 'Varios sectores'
            ELSE COALESCE(MAX(s.nombre), sd.nombre, '—')
          END
          FROM retorno_lineas rl
          LEFT JOIN sectores s ON s.id = rl.sector_id
          WHERE rl.retorno_id = r.id
        ) AS sector_nombre,
        c.nombre AS camionero_nombre,
        c.numero_interno AS camionero_numero,
        uc.nombre AS usuario_nombre,
        uv.nombre AS verificado_por_nombre,
        COALESCE((
          SELECT SUM(rl.total_unidades) FROM retorno_lineas rl WHERE rl.retorno_id = r.id
        ), 0) AS total_cajas,
        COALESCE((
          SELECT COUNT(*) FROM retorno_lineas rl WHERE rl.retorno_id = r.id
        ), 0) AS lineas_count
      FROM retornos r
      LEFT JOIN sectores sd ON sd.id = r.sector_id
      LEFT JOIN camioneros c ON c.id = r.camionero_id
      JOIN usuarios uc ON uc.id = r.cargado_por_id
      LEFT JOIN usuarios uv ON uv.id = r.verificado_por_id
      WHERE 1=1
    `
    const params: unknown[] = []

    if (q?.trim()) {
      sql += ` AND (
        c.nombre LIKE ? OR c.numero_interno LIKE ? OR r.numero_planilla LIKE ?
      )`
      const term = `%${q.trim()}%`
      params.push(term, term, term)
    }
    if (fecha_desde) {
      sql += ' AND r.fecha >= ?'
      params.push(fecha_desde)
    }
    if (fecha_hasta) {
      sql += ' AND r.fecha <= ?'
      params.push(fecha_hasta)
    }
    if (estado === 'PENDIENTE' || estado === 'VERIFICADO') {
      sql += ' AND r.estado = ?'
      params.push(estado)
    }

    sql += ' ORDER BY r.fecha DESC, r.id DESC'
    return db.prepare(sql).all(...params)
  })

  app.get('/api/retornos/:id', {
    preHandler: requirePermiso('retornos.ver')
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = getDb()
    const header = getRetornoHeader(db, Number(id))
    if (!header) return reply.status(404).send({ error: 'Retorno no encontrado' })

    const lineas = getRetornoLineas(db, Number(id)).map(mapLineaRow)
    const total_cajas = lineas.reduce((sum, l) => sum + l.total_unidades, 0)

    return {
      retorno: header,
      lineas,
      total_cajas,
      lineas_verificadas: lineas.filter((l) => l.linea_verificada).length
    }
  })

  app.post('/api/retornos', {
    preHandler: [blockIfInventarioActivo(), requirePermiso('retornos.crear')]
  }, async (request, reply) => {
    const body = request.body as RetornoBody
    const user = request.user!

    if (!body.fecha?.trim()) {
      return reply.status(400).send({ error: 'La fecha es requerida' })
    }
    if (!body.lineas?.length) {
      return reply.status(400).send({ error: 'Agregá al menos una línea de producto' })
    }

    const db = getDb()

    if (body.camionero_id) {
      const camionero = db.prepare(`
        SELECT id FROM camioneros WHERE id = ? AND activo = 1
      `).get(body.camionero_id)
      if (!camionero) {
        return reply.status(400).send({ error: 'Camionero no válido' })
      }
    } else if (body.vehiculo_id) {
      return reply.status(400).send({ error: 'Seleccioná un camionero para asignar vehículo' })
    }

    if (body.vehiculo_id && body.camionero_id) {
      const vehiculo = db.prepare(`
        SELECT id FROM camionero_vehiculos
        WHERE id = ? AND camionero_id = ? AND activo = 1
      `).get(body.vehiculo_id, body.camionero_id)
      if (!vehiculo) {
        return reply.status(400).send({ error: 'Vehículo no válido para el camionero' })
      }
    }

    if (body.sector_id) {
      try {
        assertSectorActivo(db, body.sector_id, 'Sector default')
      } catch (err) {
        return reply.status(400).send({ error: err instanceof Error ? err.message : 'Sector default inválido' })
      }
    }

    const estadosValidos: EstadoCondicion[] = ['BUEN_ESTADO', 'INCOMPLETA', 'MAL_ESTADO']
    for (let i = 0; i < body.lineas.length; i++) {
      const linea = body.lineas[i]
      if (!linea.producto_id || !linea.cantidad_cajas || linea.cantidad_cajas <= 0) {
        return reply.status(400).send({ error: `Línea ${i + 1}: cantidad inválida` })
      }
      if (!linea.sector_id) {
        return reply.status(400).send({ error: `Línea ${i + 1}: sector destino requerido` })
      }
      if (!estadosValidos.includes(linea.estado_condicion)) {
        return reply.status(400).send({ error: `Línea ${i + 1}: estado inválido` })
      }
      const producto = db.prepare(`
        SELECT id FROM productos WHERE id = ? AND activo = 1
      `).get(linea.producto_id)
      if (!producto) {
        return reply.status(400).send({ error: `Línea ${i + 1}: producto no válido` })
      }
      try {
        assertSectorActivo(db, linea.sector_id, `Línea ${i + 1}`)
      } catch (err) {
        return reply.status(400).send({ error: err instanceof Error ? err.message : 'Sector inválido' })
      }
    }

    const sectorDefault = body.sector_id ?? null

    try {
      const retornoId = db.transaction(() => {
        const result = db.prepare(`
          INSERT INTO retornos (
            fecha, numero_planilla, observacion, camionero_id, vehiculo_id,
            sector_id, estado, cargado_por_id
          ) VALUES (?, ?, ?, ?, ?, ?, 'PENDIENTE', ?)
        `).run(
          body.fecha!.trim(),
          body.numero_planilla?.trim() || null,
          body.observacion?.trim() || null,
          body.camionero_id ?? null,
          body.camionero_id && body.vehiculo_id ? body.vehiculo_id : null,
          sectorDefault,
          user.id
        )

        const retornoId = Number(result.lastInsertRowid)

        body.lineas!.forEach((linea, index) => {
          const { botellasPorCaja } = getProductoDefaults(db, linea.producto_id)
          db.prepare(`
            INSERT INTO retorno_lineas (
              retorno_id, producto_id, sector_id, tipo_bulto, cantidad_bultos, unidades_por_bulto,
              cantidad_suelta, total_unidades, estado_condicion, orden
            ) VALUES (?, ?, ?, 'CAJA', ?, ?, NULL, ?, ?, ?)
          `).run(
            retornoId,
            linea.producto_id,
            linea.sector_id,
            linea.cantidad_cajas,
            botellasPorCaja,
            linea.cantidad_cajas,
            linea.estado_condicion,
            index + 1
          )
        })

        return retornoId
      })()

      return { id: retornoId }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al registrar retorno'
      return reply.status(400).send({ error: msg })
    }
  })

  app.put('/api/retornos/:id/lineas/:lineaId', {
    preHandler: requirePermiso('retornos.verificar')
  }, async (request, reply) => {
    const { id, lineaId } = request.params as { id: string; lineaId: string }
    const body = request.body as VerificarLineaBody
    const user = request.user!
    const db = getDb()

    const retorno = db.prepare(`
      SELECT id, estado, cargado_por_id FROM retornos WHERE id = ?
    `).get(Number(id)) as { id: number; estado: string; cargado_por_id: number } | undefined

    if (!retorno) return reply.status(404).send({ error: 'Retorno no encontrado' })
    if (retorno.estado !== 'PENDIENTE') {
      return reply.status(400).send({ error: 'El retorno ya fue verificado' })
    }
    if (retorno.cargado_por_id === user.id) {
      return reply.status(403).send({ error: 'No podés verificar un retorno que cargaste vos' })
    }

    const linea = db.prepare(`
      SELECT id, total_unidades, estado_condicion, sector_id FROM retorno_lineas
      WHERE id = ? AND retorno_id = ?
    `).get(Number(lineaId), Number(id)) as {
      id: number
      total_unidades: number
      estado_condicion: EstadoCondicion
      sector_id: number
    } | undefined

    if (!linea) return reply.status(404).send({ error: 'Línea no encontrada' })

    const estadosValidos: EstadoCondicion[] = ['BUEN_ESTADO', 'INCOMPLETA', 'MAL_ESTADO']
    const cantidad = body.cantidad_cajas ?? linea.total_unidades
    const estado = body.estado_condicion ?? linea.estado_condicion
    const sectorId = body.sector_id ?? linea.sector_id

    if (cantidad <= 0) {
      return reply.status(400).send({ error: 'Cantidad inválida' })
    }
    if (!estadosValidos.includes(estado)) {
      return reply.status(400).send({ error: 'Estado inválido' })
    }
    try {
      assertSectorActivo(db, sectorId, 'Línea')
    } catch (err) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : 'Sector inválido' })
    }

    const verificada = body.verificada ? 1 : 0

    db.prepare(`
      UPDATE retorno_lineas SET
        sector_id = ?,
        cantidad_verificada = ?,
        estado_verificado = ?,
        linea_verificada = ?
      WHERE id = ?
    `).run(sectorId, cantidad, estado, verificada, Number(lineaId))

    return { ok: true }
  })

  app.post('/api/retornos/:id/verificar', {
    preHandler: [blockIfInventarioActivo(), requirePermiso('retornos.verificar')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as { observacion?: string | null }
    const user = request.user!
    const db = getDb()

    const retorno = getRetornoHeader(db, Number(id))
    if (!retorno) return reply.status(404).send({ error: 'Retorno no encontrado' })
    if (retorno.estado !== 'PENDIENTE') {
      return reply.status(400).send({ error: 'El retorno ya fue verificado' })
    }
    if (retorno.cargado_por_id === user.id) {
      return reply.status(403).send({ error: 'No podés verificar un retorno que cargaste vos' })
    }

    const lineas = getRetornoLineas(db, Number(id))
    if (lineas.length === 0) {
      return reply.status(400).send({ error: 'El retorno no tiene líneas' })
    }
    if (lineas.some((l) => !l.linea_verificada)) {
      return reply.status(400).send({ error: 'Confirmá todas las líneas antes de completar la verificación' })
    }

    const observacion = body.observacion?.trim() || null

    try {
      db.transaction(() => {
        for (const row of lineas) {
          const mapped = mapLineaRow(row)
          const estadoEfectivo = mapped.estado_efectivo
          const cantidadEfectiva = mapped.cantidad_efectiva

          if (estadoEfectivo !== 'BUEN_ESTADO' || cantidadEfectiva <= 0) continue

          const { botellasPorCaja } = getProductoDefaults(db, row.producto_id)
          const lineaDesglose = buildCajaLinea(cantidadEfectiva, botellasPorCaja)

          applyRetornoLineToStock(db, {
            producto_id: row.producto_id,
            sector_id: row.sector_id,
            linea: lineaDesglose,
            retorno_id: retorno.id,
            usuario_id: user.id,
            camionero_id: retorno.camionero_id ?? null,
            observacion: observacion ?? retorno.observacion,
            orden: row.orden
          })
        }

        db.prepare(`
          UPDATE retornos SET
            estado = 'VERIFICADO',
            verificado_por_id = ?,
            observacion_verificacion = ?,
            verificado_at = datetime('now')
          WHERE id = ?
        `).run(user.id, observacion, Number(id))
      })()

      return { ok: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al verificar retorno'
      return reply.status(400).send({ error: msg })
    }
  })
}
