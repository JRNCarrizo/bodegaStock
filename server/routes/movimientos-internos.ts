import type { FastifyInstance } from 'fastify'
import { getDb } from '../db'
import { requirePermiso } from '../plugins/auth'
import { blockIfInventarioActivo } from '../utils/inventario-block'
import { getMovimientosDobleVerificacion } from '../utils/app-settings'
import {
  applyMovimientoInternoDespachoLine,
  applyMovimientoInternoRecepcionLine,
  formatEtiquetaLinea,
  getStockDisponibleCajasEnSector
} from '../utils/stock'

type MovimientoTipo = 'ENVIAR' | 'RECIBIR'
type MovimientoEstado = 'PENDIENTE' | 'COMPLETADO' | 'CANCELADO'

interface LineaBody {
  producto_id: number
  cantidad_cajas: number
  sector_origen_id: number
  sector_destino_id: number
  ubicacion_destino_id?: number | null
  ubicacion_origen_id?: number | null
  tipo_bulto?: 'PALLET' | 'CAJA' | null
  cantidad_bultos?: number | null
  unidades_por_bulto?: number | null
  etiqueta?: string | null
}

interface LineaUpdateBody {
  id: number
  cancelada?: boolean
  sector_origen_id?: number
  sector_destino_id?: number
  ubicacion_destino_id?: number | null
  ubicacion_origen_id?: number | null
}

interface MovimientoBody {
  tipo?: MovimientoTipo
  fecha?: string
  sector_contexto_id?: number
  sector_destino_default_id?: number
  observacion?: string | null
  lineas?: LineaBody[]
}

function assertSectorActivo(db: ReturnType<typeof getDb>, sectorId: number, label: string) {
  const sector = db.prepare(`
    SELECT id FROM sectores WHERE id = ? AND activo = 1
  `).get(sectorId)
  if (!sector) throw new Error(`${label}: sector no válido`)
}

function assertProductoActivo(db: ReturnType<typeof getDb>, productoId: number) {
  const producto = db.prepare(`
    SELECT id FROM productos WHERE id = ? AND activo = 1
  `).get(productoId)
  if (!producto) throw new Error('Producto no válido')
}

function resolveUbicacionDestino(
  db: ReturnType<typeof getDb>,
  sectorDestinoId: number,
  ubicacionDestinoId: number | null | undefined
): number | null {
  if (ubicacionDestinoId == null || ubicacionDestinoId === 0) return null
  const ub = db.prepare(`
    SELECT id FROM sector_ubicaciones
    WHERE id = ? AND sector_id = ? AND activo = 1
  `).get(Number(ubicacionDestinoId), sectorDestinoId)
  if (!ub) throw new Error('Ubicación destino no válida para el sector')
  return Number(ubicacionDestinoId)
}

function resolveUbicacionOrigen(
  db: ReturnType<typeof getDb>,
  sectorOrigenId: number,
  ubicacionOrigenId: number | null | undefined
): number | null {
  if (ubicacionOrigenId == null || ubicacionOrigenId === 0) return null
  const ub = db.prepare(`
    SELECT id FROM sector_ubicaciones
    WHERE id = ? AND sector_id = ? AND activo = 1
  `).get(Number(ubicacionOrigenId), sectorOrigenId)
  if (!ub) throw new Error('Ubicación origen no válida para el sector')
  return Number(ubicacionOrigenId)
}

/** Reubicación dentro del mismo sector: exige ubicaciones distintas (origen puede ser sin ubicación). */
function assertMovimientoLineaSectoresOk(
  db: ReturnType<typeof getDb>,
  origenId: number,
  destinoId: number,
  ubicacionOrigenId: number | null,
  ubicacionDestinoId: number | null
): void {
  if (origenId !== destinoId) return

  const sector = db.prepare(`
    SELECT usa_ubicaciones FROM sectores WHERE id = ?
  `).get(origenId) as { usa_ubicaciones: number } | undefined
  if (!sector?.usa_ubicaciones) {
    throw new Error('Origen y destino deben ser distintos')
  }
  if (ubicacionDestinoId == null && ubicacionOrigenId == null) {
    throw new Error(
      'Para reubicar en el mismo sector, elegí una ubicación destino distinta a “sin ubicación”'
    )
  }
  if (ubicacionOrigenId === ubicacionDestinoId) {
    throw new Error('En el mismo sector, la ubicación origen y destino deben ser distintas')
  }
}

function getMovimientoLineas(db: ReturnType<typeof getDb>, movimientoId: number, soloActivas = false) {
  let sql = `
    SELECT
      ml.id, ml.producto_id, p.codigo_interno, p.nombre, p.unidad,
      ml.sector_origen_id, so.nombre AS sector_origen_nombre,
      ml.sector_destino_id, sd.nombre AS sector_destino_nombre,
      ml.ubicacion_destino_id, su.nombre AS ubicacion_destino_nombre,
      ml.ubicacion_origen_id, suo.nombre AS ubicacion_origen_nombre,
      ml.cantidad_cajas, ml.tipo_bulto, ml.cantidad_bultos, ml.unidades_por_bulto, ml.etiqueta,
      ml.cancelada, ml.orden
    FROM movimiento_interno_lineas ml
    JOIN productos p ON p.id = ml.producto_id
    JOIN sectores so ON so.id = ml.sector_origen_id
    JOIN sectores sd ON sd.id = ml.sector_destino_id
    LEFT JOIN sector_ubicaciones su ON su.id = ml.ubicacion_destino_id
    LEFT JOIN sector_ubicaciones suo ON suo.id = ml.ubicacion_origen_id
    WHERE ml.movimiento_interno_id = ?
  `
  if (soloActivas) sql += ' AND ml.cancelada = 0'
  sql += ' ORDER BY ml.orden ASC, ml.id ASC'
  return db.prepare(sql).all(movimientoId) as Array<{
    id: number
    producto_id: number
    codigo_interno: string
    nombre: string
    unidad: string | null
    sector_origen_id: number
    sector_origen_nombre: string
    sector_destino_id: number
    sector_destino_nombre: string
    ubicacion_destino_id: number | null
    ubicacion_destino_nombre: string | null
    ubicacion_origen_id: number | null
    ubicacion_origen_nombre: string | null
    cantidad_cajas: number
    tipo_bulto: string | null
    cantidad_bultos: number | null
    unidades_por_bulto: number | null
    etiqueta: string | null
    cancelada: number
    orden: number
  }>
}

function getMovimientoHeader(db: ReturnType<typeof getDb>, id: number) {
  return db.prepare(`
    SELECT
      m.id, m.fecha, m.tipo, m.estado, m.observacion, m.created_at, m.ingreso_directo,
      m.sector_origen_id, so.nombre AS sector_origen_nombre,
      m.sector_destino_id, sd.nombre AS sector_destino_nombre,
      m.creado_por_id, uc.nombre AS creado_por_nombre,
      m.recibido_por_id, ur.nombre AS recibido_por_nombre,
      m.cancelado_por_id, uca.nombre AS cancelado_por_nombre,
      m.recibido_at, m.cancelado_at
    FROM movimientos_internos m
    LEFT JOIN sectores so ON so.id = m.sector_origen_id
    LEFT JOIN sectores sd ON sd.id = m.sector_destino_id
    JOIN usuarios uc ON uc.id = m.creado_por_id
    LEFT JOIN usuarios ur ON ur.id = m.recibido_por_id
    LEFT JOIN usuarios uca ON uca.id = m.cancelado_por_id
    WHERE m.id = ?
  `).get(id) as
    | {
        id: number
        fecha: string
        tipo: MovimientoTipo
        estado: MovimientoEstado
        observacion: string | null
        created_at: string
        ingreso_directo: number
        sector_origen_id: number | null
        sector_origen_nombre: string | null
        sector_destino_id: number | null
        sector_destino_nombre: string | null
        creado_por_id: number
        creado_por_nombre: string
        recibido_por_id: number | null
        recibido_por_nombre: string | null
        cancelado_por_id: number | null
        cancelado_por_nombre: string | null
        recibido_at: string | null
        cancelado_at: string | null
      }
    | undefined
}

function enrichLineaEtiqueta(l: ReturnType<typeof getMovimientoLineas>[number]) {
  if (l.etiqueta) return l.etiqueta
  if (!l.tipo_bulto || l.cantidad_bultos == null || l.unidades_por_bulto == null) return null
  return formatEtiquetaLinea(
    {
      tipo_bulto: l.tipo_bulto as 'PALLET' | 'CAJA' | 'SUELTO',
      cantidad_bultos: l.cantidad_bultos,
      unidades_por_bulto: l.unidades_por_bulto
    },
    l.unidad
  )
}

function aplicarStockLineasActivas(
  db: ReturnType<typeof getDb>,
  movimientoId: number,
  usuarioId: number,
  observacion: string | null
) {
  const lineas = getMovimientoLineas(db, movimientoId, true)
  if (lineas.length === 0) {
    throw new Error('No hay productos activos para completar')
  }

  for (const linea of lineas) {
    const origenMeta = db.prepare(`
      SELECT usa_ubicaciones FROM sectores WHERE id = ?
    `).get(linea.sector_origen_id) as { usa_ubicaciones: number } | undefined
    const filtrarOrigen = Boolean(origenMeta?.usa_ubicaciones)

    applyMovimientoInternoDespachoLine(db, {
      producto_id: linea.producto_id,
      sector_origen_id: linea.sector_origen_id,
      cantidad_cajas: linea.cantidad_cajas,
      movimiento_id: movimientoId,
      movimiento_linea_id: linea.id,
      usuario_id: usuarioId,
      observacion,
      ubicacion_origen_id: linea.ubicacion_origen_id,
      filtrar_ubicacion_origen: filtrarOrigen
    })

    applyMovimientoInternoRecepcionLine(db, {
      producto_id: linea.producto_id,
      sector_destino_id: linea.sector_destino_id,
      cantidad_cajas: linea.cantidad_cajas,
      movimiento_id: movimientoId,
      usuario_id: usuarioId,
      observacion,
      ubicacion_destino_id: linea.ubicacion_destino_id,
      tipo_bulto: linea.tipo_bulto,
      cantidad_bultos: linea.cantidad_bultos,
      unidades_por_bulto: linea.unidades_por_bulto
    })
  }
}

function buildDetalle(db: ReturnType<typeof getDb>, id: number) {
  const movimiento = getMovimientoHeader(db, id)
  if (!movimiento) return null

  const lineas = getMovimientoLineas(db, id).map((l) => ({
    ...l,
    cancelada: !!l.cancelada,
    etiqueta: enrichLineaEtiqueta(l)
  }))
  const lineasActivas = lineas.filter((l) => !l.cancelada)
  const total_cajas = lineasActivas.reduce((s, l) => s + l.cantidad_cajas, 0)

  return {
    movimiento: {
      ...movimiento,
      ingreso_directo: !!movimiento.ingreso_directo
    },
    lineas,
    total_cajas,
    lineas_activas: lineasActivas.length
  }
}

function resumenRutaFromLineas(
  lineas: ReturnType<typeof getMovimientoLineas>,
  tipo: MovimientoTipo
): { origen: string; destino: string } {
  const activas = lineas.filter((l) => !l.cancelada)
  if (activas.length === 0) return { origen: '—', destino: '—' }

  const origenes = [...new Set(activas.map((l) => l.sector_origen_nombre))]
  const destinos = [...new Set(activas.map((l) => l.sector_destino_nombre))]

  return {
    origen: origenes.length === 1 ? origenes[0] : 'Varios orígenes',
    destino: destinos.length === 1 ? destinos[0] : 'Varios destinos'
  }
}

export async function movimientosInternosRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/movimientos-internos/productos', {
    preHandler: requirePermiso('movimientos_internos.crear')
  }, async (request, reply) => {
    const { modo, sector_id, q } = request.query as {
      modo?: string
      sector_id?: string
      q?: string
    }
    const sectorId = Number(sector_id)
    if (!sectorId || (modo !== 'enviar' && modo !== 'recibir')) {
      return reply.status(400).send({ error: 'Parámetros modo y sector_id requeridos' })
    }

    const db = getDb()
    assertSectorActivo(db, sectorId, 'Sector')

    const term = q?.trim() ? `%${q.trim()}%` : null
    let sql: string
    const params: Array<number | string> = []

    if (modo === 'enviar') {
      sql = `
        SELECT
          p.id, p.codigo_interno, p.codigo_barras, p.nombre, p.imagen_path, p.unidad,
          p.unidades_por_pallet_default, p.unidades_por_caja_default,
          ss.cantidad_total AS stock_cajas
        FROM productos p
        JOIN stock_sector ss ON ss.producto_id = p.id AND ss.sector_id = ? AND ss.cantidad_total > 0
        WHERE p.activo = 1
      `
      params.push(sectorId)
    } else {
      sql = `
        SELECT DISTINCT
          p.id, p.codigo_interno, p.codigo_barras, p.nombre, p.imagen_path, p.unidad,
          p.unidades_por_pallet_default, p.unidades_por_caja_default,
          (
            SELECT COALESCE(SUM(ss2.cantidad_total), 0)
            FROM stock_sector ss2
            WHERE ss2.producto_id = p.id AND ss2.sector_id != ? AND ss2.cantidad_total > 0
          ) AS stock_cajas
        FROM productos p
        JOIN stock_sector ss ON ss.producto_id = p.id AND ss.sector_id != ? AND ss.cantidad_total > 0
        WHERE p.activo = 1
      `
      params.push(sectorId, sectorId)
    }

    if (term) {
      sql += ' AND (p.codigo_interno LIKE ? OR p.nombre LIKE ? OR p.codigo_barras LIKE ?)'
      params.push(term, term, term)
    }

    sql += ' ORDER BY p.nombre COLLATE NOCASE ASC LIMIT 40'

    return db.prepare(sql).all(...params)
  })

  app.get('/api/movimientos-internos/producto/:id/sectores-stock', {
    preHandler: requirePermiso('movimientos_internos.crear')
  }, async (request) => {
    const productoId = Number((request.params as { id: string }).id)
    const { excluir_sector_id } = request.query as { excluir_sector_id?: string }
    const excluirId = excluir_sector_id ? Number(excluir_sector_id) : null
    const db = getDb()
    assertProductoActivo(db, productoId)

    let sql = `
      SELECT
        s.id AS sector_id,
        s.nombre AS sector_nombre,
        ss.cantidad_total AS stock_cajas
      FROM stock_sector ss
      JOIN sectores s ON s.id = ss.sector_id AND s.activo = 1
      WHERE ss.producto_id = ? AND ss.cantidad_total > 0
    `
    const params: number[] = [productoId]
    if (excluirId) {
      sql += ' AND ss.sector_id != ?'
      params.push(excluirId)
    }
    sql += ' ORDER BY ss.cantidad_total DESC, s.nombre COLLATE NOCASE ASC'

    return db.prepare(sql).all(...params) as Array<{
      sector_id: number
      sector_nombre: string
      stock_cajas: number
    }>
  })

  app.get('/api/movimientos-internos/producto/:id/stock-sector/:sectorId', {
    preHandler: requirePermiso('movimientos_internos.crear')
  }, async (request) => {
    const productoId = Number((request.params as { id: string }).id)
    const sectorId = Number((request.params as { sectorId: string }).sectorId)
    const { sin_ubicacion, ubicacion_id } = request.query as {
      sin_ubicacion?: string
      ubicacion_id?: string
    }
    const db = getDb()
    assertProductoActivo(db, productoId)
    assertSectorActivo(db, sectorId, 'Sector')

    let ubicacionFilter: { ubicacion_id: number | null } | null = null
    if (sin_ubicacion === '1') {
      ubicacionFilter = { ubicacion_id: null }
    } else if (ubicacion_id) {
      ubicacionFilter = { ubicacion_id: Number(ubicacion_id) }
    }

    return {
      stock_disponible_cajas: getStockDisponibleCajasEnSector(
        db,
        productoId,
        sectorId,
        ubicacionFilter
      )
    }
  })

  app.get('/api/movimientos-internos', {
    preHandler: requirePermiso('movimientos_internos.ver')
  }, async (request) => {
    const { q, fecha_desde, fecha_hasta, estado, tipo } = request.query as {
      q?: string
      fecha_desde?: string
      fecha_hasta?: string
      estado?: string
      tipo?: string
    }

    const db = getDb()
    let sql = `
      SELECT
        m.id, m.fecha, m.tipo, m.estado, m.observacion, m.created_at, m.ingreso_directo,
        so.nombre AS sector_origen_nombre,
        sd.nombre AS sector_destino_nombre,
        uc.nombre AS creado_por_nombre,
        ur.nombre AS recibido_por_nombre,
        COALESCE((
          SELECT SUM(ml.cantidad_cajas) FROM movimiento_interno_lineas ml
          WHERE ml.movimiento_interno_id = m.id AND ml.cancelada = 0
        ), 0) AS total_cajas,
        COALESCE((
          SELECT COUNT(*) FROM movimiento_interno_lineas ml
          WHERE ml.movimiento_interno_id = m.id AND ml.cancelada = 0
        ), 0) AS lineas_count
      FROM movimientos_internos m
      LEFT JOIN sectores so ON so.id = m.sector_origen_id
      LEFT JOIN sectores sd ON sd.id = m.sector_destino_id
      JOIN usuarios uc ON uc.id = m.creado_por_id
      LEFT JOIN usuarios ur ON ur.id = m.recibido_por_id
      WHERE 1=1
    `
    const params: string[] = []

    if (fecha_desde) {
      sql += ' AND m.fecha >= ?'
      params.push(fecha_desde)
    }
    if (fecha_hasta) {
      sql += ' AND m.fecha <= ?'
      params.push(fecha_hasta)
    }
    if (estado && estado !== 'TODOS') {
      sql += ' AND m.estado = ?'
      params.push(estado)
    }
    if (tipo && tipo !== 'TODOS') {
      sql += ' AND m.tipo = ?'
      params.push(tipo)
    }
    if (q?.trim()) {
      sql += ` AND (
        m.observacion LIKE ?
        OR so.nombre LIKE ?
        OR sd.nombre LIKE ?
        OR EXISTS (
          SELECT 1 FROM movimiento_interno_lineas ml
          JOIN productos p ON p.id = ml.producto_id
          WHERE ml.movimiento_interno_id = m.id
            AND (p.codigo_interno LIKE ? OR p.nombre LIKE ?)
        )
      )`
      const term = `%${q.trim()}%`
      params.push(term, term, term, term, term)
    }

    sql += ' ORDER BY m.fecha DESC, m.id DESC LIMIT 500'
    const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown> & { id: number; tipo: MovimientoTipo }>

    return rows.map((row) => {
      const lineas = getMovimientoLineas(db, row.id, true)
      const ruta = resumenRutaFromLineas(lineas, row.tipo)
      return {
        ...row,
        ingreso_directo: !!row.ingreso_directo,
        sector_origen_nombre: ruta.origen,
        sector_destino_nombre: ruta.destino
      }
    })
  })

  app.get('/api/movimientos-internos/:id', {
    preHandler: requirePermiso('movimientos_internos.ver')
  }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id)
    const detalle = buildDetalle(getDb(), id)
    if (!detalle) {
      return reply.status(404).send({ error: 'Registro no encontrado' })
    }
    return detalle
  })

  app.post('/api/movimientos-internos', {
    preHandler: [blockIfInventarioActivo(), requirePermiso('movimientos_internos.crear')]
  }, async (request, reply) => {
    const body = (request.body ?? {}) as MovimientoBody
    const user = request.user!
    const db = getDb()

    const tipo = body.tipo
    if (tipo !== 'ENVIAR' && tipo !== 'RECIBIR') {
      return reply.status(400).send({ error: 'Tipo inválido (ENVIAR o RECIBIR)' })
    }

    const fecha = body.fecha?.trim()
    if (!fecha) {
      return reply.status(400).send({ error: 'Fecha requerida' })
    }

    const sectorContextoId = Number(body.sector_contexto_id)
    if (!sectorContextoId) {
      return reply.status(400).send({ error: 'Sector requerido' })
    }

    try {
      assertSectorActivo(db, sectorContextoId, 'Sector')
    } catch (err) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : 'Sector inválido' })
    }

    const lineas = Array.isArray(body.lineas) ? body.lineas : []
    if (lineas.length === 0) {
      return reply.status(400).send({ error: 'Agregá al menos una línea' })
    }

    const sectorDestinoDefault = Number(body.sector_destino_default_id) || null

    for (const linea of lineas) {
      const qty = Number(linea.cantidad_cajas)
      const origenId = Number(linea.sector_origen_id)
      const destinoId = Number(linea.sector_destino_id)
      if (!linea.producto_id || !qty || qty <= 0 || !origenId || !destinoId) {
        return reply.status(400).send({ error: 'Línea inválida' })
      }
      try {
        assertProductoActivo(db, linea.producto_id)
        assertSectorActivo(db, origenId, 'Origen')
        assertSectorActivo(db, destinoId, 'Destino')
      } catch (err) {
        return reply.status(400).send({ error: err instanceof Error ? err.message : 'Datos inválidos' })
      }

      if (tipo === 'ENVIAR' && origenId !== sectorContextoId) {
        return reply.status(400).send({ error: 'En enviar, el origen de cada línea debe ser el sector elegido' })
      }
      if (tipo === 'RECIBIR' && destinoId !== sectorContextoId) {
        return reply.status(400).send({ error: 'En recibir, el destino de cada línea debe ser el sector elegido' })
      }
      if (tipo === 'RECIBIR' && origenId === sectorContextoId) {
        return reply.status(400).send({ error: 'El origen debe ser un sector distinto al destino' })
      }

      let ubicacionDestinoId: number | null
      let ubicacionOrigenId: number | null
      try {
        ubicacionDestinoId = resolveUbicacionDestino(db, destinoId, linea.ubicacion_destino_id)
        ubicacionOrigenId = resolveUbicacionOrigen(db, origenId, linea.ubicacion_origen_id)
        assertMovimientoLineaSectoresOk(db, origenId, destinoId, ubicacionOrigenId, ubicacionDestinoId)
      } catch (err) {
        return reply.status(400).send({ error: err instanceof Error ? err.message : 'Ubicación inválida' })
      }
    }

    const headerOrigenId = tipo === 'ENVIAR'
      ? sectorContextoId
      : lineas[0].sector_origen_id
    const headerDestinoId = tipo === 'RECIBIR'
      ? sectorContextoId
      : (sectorDestinoDefault ?? lineas[0].sector_destino_id)

    const dobleVerificacion = getMovimientosDobleVerificacion(db)
    const observacion = body.observacion?.trim() || null
    const obsDirecto = dobleVerificacion
      ? observacion
      : observacion
        ? `${observacion} · Ingreso directo (sin doble verificación)`
        : 'Ingreso directo (sin doble verificación)'

    try {
      const movimientoId = db.transaction(() => {
        const result = db.prepare(`
          INSERT INTO movimientos_internos (
            fecha, tipo, sector_origen_id, sector_destino_id, observacion,
            estado, creado_por_id, recibido_por_id, ingreso_directo, recibido_at
          ) VALUES (
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END
          )
        `).run(
          fecha,
          tipo,
          headerOrigenId,
          headerDestinoId,
          obsDirecto,
          dobleVerificacion ? 'PENDIENTE' : 'COMPLETADO',
          user.id,
          dobleVerificacion ? null : user.id,
          dobleVerificacion ? 0 : 1,
          dobleVerificacion ? 0 : 1
        )

        const movimientoId = Number(result.lastInsertRowid)

        lineas.forEach((linea, index) => {
          const producto = db.prepare(`
            SELECT unidad FROM productos WHERE id = ?
          `).get(linea.producto_id) as { unidad: string | null } | undefined

          const tipoBulto = linea.tipo_bulto ?? null
          const cantidadBultos =
            linea.cantidad_bultos != null ? Number(linea.cantidad_bultos) : null
          const unidadesPorBulto =
            linea.unidades_por_bulto != null ? Number(linea.unidades_por_bulto) : null

          let etiqueta = linea.etiqueta?.trim() || null
          if (!etiqueta && tipoBulto && cantidadBultos && unidadesPorBulto) {
            etiqueta = formatEtiquetaLinea(
              {
                tipo_bulto: tipoBulto,
                cantidad_bultos: cantidadBultos,
                unidades_por_bulto: unidadesPorBulto
              },
              producto?.unidad
            )
          }

          db.prepare(`
            INSERT INTO movimiento_interno_lineas (
              movimiento_interno_id, producto_id, sector_origen_id, sector_destino_id,
              ubicacion_destino_id, ubicacion_origen_id,
              cantidad_cajas, tipo_bulto, cantidad_bultos, unidades_por_bulto, etiqueta, orden
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            movimientoId,
            linea.producto_id,
            linea.sector_origen_id,
            linea.sector_destino_id,
            resolveUbicacionDestino(db, linea.sector_destino_id, linea.ubicacion_destino_id),
            resolveUbicacionOrigen(db, linea.sector_origen_id, linea.ubicacion_origen_id),
            Number(linea.cantidad_cajas),
            tipoBulto,
            cantidadBultos,
            unidadesPorBulto,
            etiqueta,
            index + 1
          )
        })

        if (!dobleVerificacion) {
          aplicarStockLineasActivas(db, movimientoId, user.id, obsDirecto)
        }

        return movimientoId
      })()

      return buildDetalle(db, movimientoId)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al crear movimiento'
      return reply.status(400).send({ error: message })
    }
  })

  app.patch('/api/movimientos-internos/:id/lineas', {
    preHandler: requirePermiso('movimientos_internos.crear')
  }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id)
    const db = getDb()
    const body = (request.body ?? {}) as { lineas?: LineaUpdateBody[] }

    const movimiento = getMovimientoHeader(db, id)
    if (!movimiento) {
      return reply.status(404).send({ error: 'Registro no encontrado' })
    }
    if (movimiento.estado !== 'PENDIENTE') {
      return reply.status(400).send({ error: 'Solo se pueden editar movimientos pendientes' })
    }

    const updates = Array.isArray(body.lineas) ? body.lineas : []
    if (updates.length === 0) {
      return reply.status(400).send({ error: 'Sin cambios' })
    }

    try {
      const tx = db.transaction(() => {
        for (const upd of updates) {
          const linea = db.prepare(`
            SELECT id, producto_id, sector_origen_id, sector_destino_id
            FROM movimiento_interno_lineas
            WHERE id = ? AND movimiento_interno_id = ?
          `).get(upd.id, id) as
            | { id: number; producto_id: number; sector_origen_id: number; sector_destino_id: number }
            | undefined

          if (!linea) throw new Error('Línea no encontrada')

          let origenId = linea.sector_origen_id
          let destinoId = linea.sector_destino_id
          let cancelada = upd.cancelada ? 1 : 0
          const currentUb = db.prepare(`
            SELECT ubicacion_destino_id, ubicacion_origen_id FROM movimiento_interno_lineas WHERE id = ?
          `).get(upd.id) as {
            ubicacion_destino_id: number | null
            ubicacion_origen_id: number | null
          } | undefined
          let ubicacionDestinoId: number | null = currentUb?.ubicacion_destino_id ?? null
          let ubicacionOrigenId: number | null = currentUb?.ubicacion_origen_id ?? null

          if (upd.sector_origen_id !== undefined) {
            origenId = Number(upd.sector_origen_id)
            assertSectorActivo(db, origenId, 'Origen')
            if (movimiento.tipo === 'RECIBIR') {
              const stock = getStockDisponibleCajasEnSector(db, linea.producto_id, origenId)
              if (stock <= 0) throw new Error(`Sin stock en ${origenId} para el producto`)
            }
            if (upd.ubicacion_origen_id === undefined && origenId !== destinoId) {
              ubicacionOrigenId = null
            }
          }
          if (upd.sector_destino_id !== undefined) {
            destinoId = Number(upd.sector_destino_id)
            assertSectorActivo(db, destinoId, 'Destino')
            if (upd.ubicacion_destino_id === undefined) {
              ubicacionDestinoId = null
            }
          }

          if (upd.ubicacion_destino_id !== undefined) {
            ubicacionDestinoId = resolveUbicacionDestino(db, destinoId, upd.ubicacion_destino_id)
          } else if (ubicacionDestinoId != null) {
            resolveUbicacionDestino(db, destinoId, ubicacionDestinoId)
          }

          if (upd.ubicacion_origen_id !== undefined) {
            ubicacionOrigenId = resolveUbicacionOrigen(db, origenId, upd.ubicacion_origen_id)
          } else if (ubicacionOrigenId != null) {
            resolveUbicacionOrigen(db, origenId, ubicacionOrigenId)
          }

          assertMovimientoLineaSectoresOk(db, origenId, destinoId, ubicacionOrigenId, ubicacionDestinoId)

          if (upd.cancelada === undefined) {
            const current = db.prepare(`
              SELECT cancelada FROM movimiento_interno_lineas WHERE id = ?
            `).get(upd.id) as { cancelada: number }
            cancelada = current.cancelada
          }

          db.prepare(`
            UPDATE movimiento_interno_lineas
            SET sector_origen_id = ?, sector_destino_id = ?,
                ubicacion_destino_id = ?, ubicacion_origen_id = ?, cancelada = ?
            WHERE id = ?
          `).run(
            origenId,
            destinoId,
            ubicacionDestinoId,
            ubicacionOrigenId,
            cancelada ? 1 : 0,
            upd.id
          )
        }
      })

      tx()
      return buildDetalle(db, id)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al actualizar líneas'
      return reply.status(400).send({ error: message })
    }
  })

  app.post('/api/movimientos-internos/:id/completar', {
    preHandler: [blockIfInventarioActivo(), requirePermiso('movimientos_internos.crear')]
  }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id)
    const user = request.user!
    const db = getDb()

    const movimiento = getMovimientoHeader(db, id)
    if (!movimiento) {
      return reply.status(404).send({ error: 'Registro no encontrado' })
    }
    if (movimiento.estado !== 'PENDIENTE') {
      return reply.status(400).send({ error: 'Solo se pueden completar movimientos pendientes' })
    }

    try {
      const tx = db.transaction(() => {
        aplicarStockLineasActivas(db, id, user.id, movimiento.observacion)

        db.prepare(`
          UPDATE movimientos_internos
          SET estado = 'COMPLETADO',
              recibido_por_id = ?,
              recibido_at = datetime('now')
          WHERE id = ?
        `).run(user.id, id)
      })

      tx()
      return buildDetalle(db, id)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al completar'
      return reply.status(400).send({ error: message })
    }
  })

  app.post('/api/movimientos-internos/:id/cancelar', {
    preHandler: [blockIfInventarioActivo(), requirePermiso('movimientos_internos.crear')]
  }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id)
    const user = request.user!
    const db = getDb()

    const movimiento = getMovimientoHeader(db, id)
    if (!movimiento) {
      return reply.status(404).send({ error: 'Registro no encontrado' })
    }
    if (movimiento.estado !== 'PENDIENTE') {
      return reply.status(400).send({ error: 'Este movimiento ya no se puede cancelar' })
    }

    db.prepare(`
      UPDATE movimientos_internos
      SET estado = 'CANCELADO',
          cancelado_por_id = ?,
          cancelado_at = datetime('now')
      WHERE id = ?
    `).run(user.id, id)

    return buildDetalle(db, id)
  })
}
