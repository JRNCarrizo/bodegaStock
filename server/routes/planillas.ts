import type { FastifyInstance } from 'fastify'
import { getDb } from '../db'
import { requirePermiso } from '../plugins/auth'
import { blockIfInventarioActivo } from '../utils/inventario-block'
import {
  applyLineDeduction,
  applyProductDeduction,
  computeProductDeduction,
  formatEtiquetaLinea,
  formatPlanillaEtiqueta,
  findReferenciasBultoProducto,
  getProductoDefaults,
  getProductoUnidad,
  getStockDisponibleModo,
  getStockDisponibleProducto,
  resolvePlanillaLineaFromTotal,
  resolvePlanillaLineaModo,
  validateLineaDesglose,
  type LineaDesgloseInput,
  type ModoSalidaPlanilla,
  type PlanillaLineaResolved
} from '../utils/stock'

interface PlanillaLineaBody {
  producto_id: number
  modo_salida?: ModoSalidaPlanilla
  cantidad?: number
  total_unidades?: number
  tipo_bulto?: LineaDesgloseInput['tipo_bulto']
  cantidad_bultos?: number | null
  unidades_por_bulto?: number | null
  cantidad_suelta?: number | null
}

interface PlanillaBody {
  fecha?: string
  numero?: string
  observacion?: string | null
  camionero_id?: number
  vehiculo_id?: number | null
  lineas?: PlanillaLineaBody[]
}

function resolvePlanillaLineaBody(
  db: ReturnType<typeof getDb>,
  linea: PlanillaLineaBody
): PlanillaLineaResolved {
  if (linea.modo_salida && linea.cantidad != null) {
    return resolvePlanillaLineaModo(
      db,
      linea.producto_id,
      linea.modo_salida,
      Number(linea.cantidad)
    )
  }

  const hasExplicitBulto =
    (linea.tipo_bulto === 'PALLET' || linea.tipo_bulto === 'CAJA') &&
    linea.cantidad_bultos != null &&
    linea.unidades_por_bulto != null

  if (hasExplicitBulto) {
    const desglose: LineaDesgloseInput = {
      tipo_bulto: linea.tipo_bulto!,
      cantidad_bultos: Number(linea.cantidad_bultos),
      unidades_por_bulto: Number(linea.unidades_por_bulto)
    }
    const err = validateLineaDesglose(desglose)
    if (err) throw new Error(err)

    const unidad = getProductoUnidad(db, linea.producto_id)
    const { botellasPorCaja } = getProductoDefaults(db, linea.producto_id)
    const modo: ModoSalidaPlanilla =
      desglose.tipo_bulto === 'CAJA' &&
      desglose.unidades_por_bulto === botellasPorCaja
        ? 'CAJA'
        : 'BOTELLA'

    if (modo === 'BOTELLA') {
      const botellas =
        Number(desglose.cantidad_bultos) * Number(desglose.unidades_por_bulto)
      return {
        tipo_bulto: 'SUELTO',
        cantidad_suelta: botellas,
        total_unidades: botellas,
        etiqueta: formatPlanillaEtiqueta('BOTELLA', botellas, unidad),
        modo_salida: 'BOTELLA',
        unidades_por_bulto_referencia: desglose.unidades_por_bulto ?? null,
        tipo_bulto_referencia: desglose.tipo_bulto
      }
    }

    return {
      ...desglose,
      total_unidades: Number(desglose.cantidad_bultos),
      etiqueta: formatPlanillaEtiqueta('CAJA', Number(desglose.cantidad_bultos), unidad),
      modo_salida: 'CAJA',
      unidades_por_bulto_referencia: desglose.unidades_por_bulto ?? null,
      tipo_bulto_referencia: desglose.tipo_bulto
    }
  }

  if (linea.total_unidades != null && Number(linea.total_unidades) > 0) {
    return resolvePlanillaLineaModo(
      db,
      linea.producto_id,
      'CAJA',
      Number(linea.total_unidades)
    )
  }

  const desglose: LineaDesgloseInput = {
    tipo_bulto: linea.tipo_bulto!,
    cantidad_bultos: linea.cantidad_bultos,
    unidades_por_bulto: linea.unidades_por_bulto,
    cantidad_suelta: linea.cantidad_suelta
  }
  const err = validateLineaDesglose(desglose)
  if (err) throw new Error(err)

  const unidad = getProductoUnidad(db, linea.producto_id)

  if (desglose.tipo_bulto === 'SUELTO') {
    const botellas = Number(desglose.cantidad_suelta ?? 0)
    return {
      ...desglose,
      total_unidades: botellas,
      etiqueta: formatPlanillaEtiqueta('BOTELLA', botellas, unidad),
      modo_salida: 'BOTELLA',
      unidades_por_bulto_referencia: desglose.unidades_por_bulto ?? null,
      tipo_bulto_referencia: null
    }
  }

  return {
    ...desglose,
    total_unidades:
      desglose.tipo_bulto === 'SUELTO'
        ? Number(desglose.cantidad_suelta ?? 0)
        : Number(desglose.cantidad_bultos ?? 0) * Number(desglose.unidades_por_bulto ?? 0) +
          Number(desglose.cantidad_suelta ?? 0),
    etiqueta: formatEtiquetaLinea(desglose, unidad),
    modo_salida: 'BOTELLA',
    unidades_por_bulto_referencia: desglose.unidades_por_bulto ?? null,
    tipo_bulto_referencia:
      desglose.tipo_bulto === 'SUELTO' ? null : desglose.tipo_bulto
  }
}

export async function planillasRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/planillas', {
    preHandler: requirePermiso('planillas.ver')
  }, async (request) => {
    const { q, fecha_desde, fecha_hasta } = request.query as {
      q?: string
      fecha_desde?: string
      fecha_hasta?: string
    }
    const db = getDb()

    let sql = `
      SELECT
        p.id, p.fecha, p.numero, p.observacion, p.camionero_id, p.vehiculo_id, p.created_at,
        c.nombre AS camionero_nombre,
        c.numero_interno AS camionero_numero,
        u.nombre AS usuario_nombre,
        cv.modelo AS vehiculo_modelo,
        COALESCE((
          SELECT SUM(pl.total_unidades) FROM planilla_lineas pl WHERE pl.planilla_id = p.id
        ), 0) AS total_unidades,
        COALESCE((
          SELECT COUNT(*) FROM planilla_lineas pl WHERE pl.planilla_id = p.id
        ), 0) AS lineas_count
      FROM planillas p
      JOIN camioneros c ON c.id = p.camionero_id
      JOIN usuarios u ON u.id = p.usuario_id
      LEFT JOIN camionero_vehiculos cv ON cv.id = p.vehiculo_id
      WHERE 1=1
    `
    const params: unknown[] = []

    if (q?.trim()) {
      sql += ' AND (p.numero LIKE ? OR p.observacion LIKE ? OR c.nombre LIKE ? OR c.numero_interno LIKE ?)'
      const term = `%${q.trim()}%`
      params.push(term, term, term, term)
    }

    if (fecha_desde?.trim() && fecha_hasta?.trim()) {
      let desde = fecha_desde.trim()
      let hasta = fecha_hasta.trim()
      if (desde > hasta) [desde, hasta] = [hasta, desde]
      sql += ' AND p.fecha >= ? AND p.fecha <= ?'
      params.push(desde, hasta)
    } else if (fecha_desde?.trim()) {
      sql += ' AND p.fecha = ?'
      params.push(fecha_desde.trim())
    } else if (fecha_hasta?.trim()) {
      sql += ' AND p.fecha = ?'
      params.push(fecha_hasta.trim())
    }

    sql += ' ORDER BY p.fecha DESC, p.created_at DESC'

    return db.prepare(sql).all(...params)
  })

  app.get('/api/planillas/:id', {
    preHandler: requirePermiso('planillas.ver')
  }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id)
    const db = getDb()

    const planilla = db.prepare(`
      SELECT
        p.id, p.fecha, p.numero, p.observacion, p.camionero_id, p.vehiculo_id, p.created_at,
        c.nombre AS camionero_nombre,
        c.numero_interno AS camionero_numero,
        c.empresa AS camionero_empresa,
        u.nombre AS usuario_nombre,
        cv.marca AS vehiculo_marca,
        cv.modelo AS vehiculo_modelo,
        cv.patente AS vehiculo_patente
      FROM planillas p
      JOIN camioneros c ON c.id = p.camionero_id
      JOIN usuarios u ON u.id = p.usuario_id
      LEFT JOIN camionero_vehiculos cv ON cv.id = p.vehiculo_id
      WHERE p.id = ?
    `).get(id)

    if (!planilla) return reply.status(404).send({ error: 'Planilla no encontrada' })

    const lineas = db.prepare(`
      SELECT
        pl.id, pl.producto_id, p.codigo_interno, p.nombre, p.unidad,
        pl.tipo_bulto, pl.cantidad_bultos, pl.unidades_por_bulto,
        pl.cantidad_suelta, pl.total_unidades, pl.modo_salida, pl.orden
      FROM planilla_lineas pl
      JOIN productos p ON p.id = pl.producto_id
      WHERE pl.planilla_id = ?
      ORDER BY pl.orden ASC, pl.id ASC
    `).all(id) as {
      id: number
      producto_id: number
      codigo_interno: string
      nombre: string
      unidad: string
      tipo_bulto: string
      cantidad_bultos: number | null
      unidades_por_bulto: number | null
      cantidad_suelta: number | null
      total_unidades: number
      modo_salida: ModoSalidaPlanilla
      orden: number
    }[]

    const descuentosStmt = db.prepare(`
      SELECT
        pd.id, pd.planilla_linea_id, pd.sector_id, s.nombre AS sector_nombre,
        pd.unidades, pd.etiqueta
      FROM planilla_descuentos pd
      JOIN sectores s ON s.id = pd.sector_id
      WHERE pd.planilla_linea_id = ?
      ORDER BY pd.id ASC
    `)

    const lineasConDescuentos = lineas.map((l) => {
      const lineaInput: LineaDesgloseInput = {
        tipo_bulto: l.tipo_bulto as LineaDesgloseInput['tipo_bulto'],
        cantidad_bultos: l.cantidad_bultos,
        unidades_por_bulto: l.unidades_por_bulto,
        cantidad_suelta: l.cantidad_suelta
      }
      const etiqueta =
        l.modo_salida === 'BOTELLA'
          ? formatPlanillaEtiqueta('BOTELLA', l.total_unidades, l.unidad)
          : l.modo_salida === 'CAJA' && l.tipo_bulto === 'CAJA'
            ? formatPlanillaEtiqueta('CAJA', l.total_unidades, l.unidad)
            : formatEtiquetaLinea(lineaInput, l.unidad)
      return {
        ...l,
        etiqueta,
        descuentos: descuentosStmt.all(l.id)
      }
    })

    const total_unidades = lineas.reduce((s, l) => s + l.total_unidades, 0)

    return { planilla, lineas: lineasConDescuentos, total_unidades }
  })

  app.get('/api/planillas/producto/:id/referencias', {
    preHandler: requirePermiso('planillas.crear')
  }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id)
    const db = getDb()

    const producto = db.prepare(`
      SELECT id, unidad, unidades_por_pallet_default, unidades_por_caja_default
      FROM productos WHERE id = ? AND activo = 1
    `).get(id) as
      | {
          id: number
          unidad: string
          unidades_por_pallet_default: number | null
          unidades_por_caja_default: number | null
        }
      | undefined

    if (!producto) {
      return reply.status(404).send({ error: 'Producto no válido' })
    }

    return {
      unidad: producto.unidad,
      stock_disponible: getStockDisponibleProducto(db, id),
      stock_disponible_cajas: getStockDisponibleModo(db, id, 'CAJA'),
      stock_disponible_botellas: getStockDisponibleModo(db, id, 'BOTELLA'),
      referencias_bulto: findReferenciasBultoProducto(db, id),
      unidades_por_pallet_default: producto.unidades_por_pallet_default,
      unidades_por_caja_default: producto.unidades_por_caja_default
    }
  })

  app.get('/api/planillas/desglose-sugerido', {
    preHandler: requirePermiso('planillas.crear')
  }, async (request, reply) => {
    const { producto_id, total } = request.query as {
      producto_id?: string
      total?: string
    }
    const db = getDb()
    const pid = Number(producto_id)
    const cantidad = Number(total)

    if (!pid || !Number.isFinite(cantidad) || cantidad <= 0) {
      return reply.status(400).send({ error: 'Producto y cantidad total válidos son requeridos' })
    }

    const producto = db.prepare(`
      SELECT id FROM productos WHERE id = ? AND activo = 1
    `).get(pid)
    if (!producto) {
      return reply.status(404).send({ error: 'Producto no válido' })
    }

    try {
      const resolved = resolvePlanillaLineaFromTotal(db, pid, cantidad)
      return {
        ...resolved,
        producto_id: pid,
        stock_disponible: getStockDisponibleProducto(db, pid)
      }
    } catch (e) {
      return reply.status(400).send({
        error: e instanceof Error ? e.message : 'No se pudo calcular el desglose'
      })
    }
  })

  app.post('/api/planillas/preview', {
    preHandler: requirePermiso('planillas.crear')
  }, async (request, reply) => {
    const body = request.body as { lineas?: PlanillaLineaBody[] }
    const db = getDb()

    if (!body.lineas?.length) {
      return reply.status(400).send({ error: 'Agregá al menos una línea de producto' })
    }

    for (let i = 0; i < body.lineas.length; i++) {
      const linea = body.lineas[i]
      const producto = db.prepare(`
        SELECT id FROM productos WHERE id = ? AND activo = 1
      `).get(linea.producto_id)
      if (!producto) {
        return reply.status(400).send({ error: `Línea ${i + 1}: producto no válido` })
      }
      try {
        resolvePlanillaLineaBody(db, linea)
      } catch (e) {
        return reply.status(400).send({
          error: `Línea ${i + 1}: ${e instanceof Error ? e.message : 'datos inválidos'}`
        })
      }
    }

    db.exec('SAVEPOINT planilla_preview')
    try {
      const preview: {
        producto_id: number
        codigo_interno: string
        nombre: string
        total_solicitado: number
        etiqueta: string
        descuentos: ReturnType<typeof computeProductDeduction>
        error?: string
      }[] = []

      for (const linea of body.lineas) {
        const producto = db.prepare(`
          SELECT id, codigo_interno, nombre FROM productos WHERE id = ?
        `).get(linea.producto_id) as { id: number; codigo_interno: string; nombre: string }

        const mapped = resolvePlanillaLineaBody(db, linea)
        try {
          const { botellasPorCaja } = getProductoDefaults(db, linea.producto_id)
          const descuentos = computeProductDeduction(
            db,
            linea.producto_id,
            mapped.total_unidades,
            mapped.modo_salida
          )
          for (const d of descuentos) {
            if (d.stock_linea_id) {
              applyLineDeduction(db, d.stock_linea_id, d.unidades, d.modo_salida, botellasPorCaja)
            }
          }
          preview.push({
            producto_id: producto.id,
            codigo_interno: producto.codigo_interno,
            nombre: producto.nombre,
            total_solicitado: mapped.total_unidades,
            etiqueta: mapped.etiqueta,
            descuentos
          })
        } catch (e) {
          preview.push({
            producto_id: producto.id,
            codigo_interno: producto.codigo_interno,
            nombre: producto.nombre,
            total_solicitado: mapped.total_unidades,
            etiqueta: mapped.etiqueta,
            descuentos: [],
            error: e instanceof Error ? e.message : 'Error al calcular descuento'
          })
        }
      }

      const hasErrors = preview.some((p) => p.error)
      return { lineas: preview, ok: !hasErrors }
    } finally {
      db.exec('ROLLBACK TO planilla_preview')
      db.exec('RELEASE planilla_preview')
    }
  })

  app.post('/api/planillas', {
    preHandler: [blockIfInventarioActivo(), requirePermiso('planillas.crear')]
  }, async (request, reply) => {
    const body = request.body as PlanillaBody
    const user = request.user!

    if (!body.fecha?.trim() || !body.numero?.trim() || !body.camionero_id) {
      return reply.status(400).send({
        error: 'Fecha, número de planilla y camionero son requeridos'
      })
    }

    if (!body.lineas?.length) {
      return reply.status(400).send({ error: 'Agregá al menos una línea de producto' })
    }

    const db = getDb()

    const camionero = db.prepare(`
      SELECT id FROM camioneros WHERE id = ? AND activo = 1
    `).get(body.camionero_id)

    if (!camionero) {
      return reply.status(400).send({ error: 'Camionero no válido' })
    }

    if (body.vehiculo_id) {
      const vehiculo = db.prepare(`
        SELECT id FROM camionero_vehiculos
        WHERE id = ? AND camionero_id = ? AND activo = 1
      `).get(body.vehiculo_id, body.camionero_id)
      if (!vehiculo) {
        return reply.status(400).send({ error: 'Vehículo no válido para el camionero' })
      }
    }

    for (let i = 0; i < body.lineas.length; i++) {
      const linea = body.lineas[i]
      const producto = db.prepare(`
        SELECT id FROM productos WHERE id = ? AND activo = 1
      `).get(linea.producto_id)
      if (!producto) {
        return reply.status(400).send({ error: `Línea ${i + 1}: producto no válido` })
      }
      try {
        resolvePlanillaLineaBody(db, linea)
      } catch (e) {
        return reply.status(400).send({
          error: `Línea ${i + 1}: ${e instanceof Error ? e.message : 'datos inválidos'}`
        })
      }
    }

    const observacion = body.observacion?.trim() || null

    try {
      const planillaId = db.transaction(() => {
        const result = db.prepare(`
          INSERT INTO planillas (fecha, numero, observacion, camionero_id, vehiculo_id, usuario_id)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          body.fecha.trim(),
          body.numero.trim(),
          observacion,
          body.camionero_id,
          body.vehiculo_id ?? null,
          user.id
        )

        const planillaId = Number(result.lastInsertRowid)

        body.lineas!.forEach((lineaBody, index) => {
          const linea = resolvePlanillaLineaBody(db, lineaBody)
          const total = linea.total_unidades

          const lineaResult = db.prepare(`
            INSERT INTO planilla_lineas (
              planilla_id, producto_id, tipo_bulto,
              cantidad_bultos, unidades_por_bulto, cantidad_suelta,
              total_unidades, modo_salida, orden
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            planillaId,
            lineaBody.producto_id,
            linea.tipo_bulto,
            linea.tipo_bulto === 'SUELTO' ? null : linea.cantidad_bultos,
            linea.tipo_bulto === 'SUELTO' ? null : linea.unidades_por_bulto,
            linea.tipo_bulto === 'SUELTO' ? linea.cantidad_suelta : linea.cantidad_suelta ?? null,
            total,
            linea.modo_salida,
            index + 1
          )

          const planillaLineaId = Number(lineaResult.lastInsertRowid)

          applyProductDeduction(db, {
            producto_id: lineaBody.producto_id,
            cantidad: total,
            modo_salida: linea.modo_salida,
            planilla_id: planillaId,
            planilla_linea_id: planillaLineaId,
            usuario_id: user.id,
            camionero_id: body.camionero_id!,
            observacion
          })
        })

        return planillaId
      })()

      return { id: planillaId }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al registrar planilla'
      return reply.status(400).send({ error: msg })
    }
  })
}
