import type { FastifyInstance } from 'fastify'
import { getDb } from '../db'
import { requirePermiso, requirePermisoAny } from '../plugins/auth'
import { getInventarioActivo, inventarioActivoErrorPayload } from '../utils/inventario-block'
import {
  buildMultiSheetExcel,
  resumenSheet,
  sendExcelFile,
  todayFileStamp
} from '../utils/excel-export'
import {
  aplicarCierreInventario,
  asegurarPrecargaReconteo,
  assertContadorEnSector,
  assertSectorEditable,
  assertSectorFinalizable,
  compararContadores,
  compararVsSistema,
  crearSnapshotInventario,
  ejecutarComparacionSector,
  getSesionOrThrow,
  getInventarioSector,
  iniciarReconteoSector,
  mapConteoLinea,
  reabrirConteoPropio,
  validarYCalcularLinea,
  type ConteoLineaInput,
  type CierreDecisionInput
} from '../utils/inventario'
import {
  assertNoConteoOnlineEnOffline,
  buildPaqueteOffline,
  getImportacionOfflineActiva,
  importarConteoOffline,
  limpiarImportacionOfflineActiva,
  marcarImportacionOfflineActiva,
  validarPaqueteImportacionPc,
  type ImportarOfflineArchivoBody,
  type ImportarOfflineBody,
  type ModoConectividadInventario
} from '../utils/inventario-offline'
import { getProductoDefaults } from '../utils/stock'

interface SectorAsignacion {
  sector_id: number
  contador_1_id: number
  contador_2_id: number
  modo_conectividad?: ModoConectividadInventario
}

interface CrearSesionBody {
  nombre?: string
  observacion?: string | null
  sectores?: SectorAsignacion[]
}

function mapSesionListItem(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    nombre: String(row.nombre),
    estado: String(row.estado),
    creado_por_nombre: String(row.creado_por_nombre),
    fecha_inicio: row.fecha_inicio as string | null,
    fecha_cierre: row.fecha_cierre as string | null,
    sectores_total: Number(row.sectores_total ?? 0),
    sectores_ok: Number(row.sectores_ok ?? 0),
    created_at: String(row.created_at)
  }
}

function getSectoresSesion(db: ReturnType<typeof getDb>, sesionId: number) {
  return db.prepare(`
    SELECT
      isec.*,
      s.nombre AS sector_nombre,
      s.codigo AS sector_codigo,
      u1.nombre AS contador_1_nombre,
      u2.nombre AS contador_2_nombre
    FROM inventario_sectores isec
    JOIN sectores s ON s.id = isec.sector_id
    JOIN usuarios u1 ON u1.id = isec.contador_1_id
    JOIN usuarios u2 ON u2.id = isec.contador_2_id
    WHERE isec.sesion_id = ?
    ORDER BY s.nombre
  `).all(sesionId) as Array<Record<string, unknown>>
}

function resultadoInventarioExport(sistema: number, contado: number): string {
  const dif = contado - sistema
  if (Math.abs(dif) < 1e-9) return 'Sin cambio'
  if (dif < 0) return 'Faltante'
  return 'Sobrante'
}

type InventarioExportItem = {
  producto_id: number
  codigo_interno: string
  nombre: string
  total_sistema: number
  total_contado: number
}

/** Agrega por producto el reporte con diferencias (sin sectores ni desglose). */
function agregarProductosInventarioExport(
  db: ReturnType<typeof getDb>,
  items: InventarioExportItem[]
): Array<{
  codigo_interno: string
  nombre: string
  descripcion: string
  sistema: number
  contado: number
  diferencia: number
  resultado: string
}> {
  const map = new Map<
    number,
    { codigo_interno: string; nombre: string; sistema: number; contado: number }
  >()

  for (const item of items) {
    const prev = map.get(item.producto_id)
    if (prev) {
      prev.sistema += item.total_sistema
      prev.contado += item.total_contado
    } else {
      map.set(item.producto_id, {
        codigo_interno: item.codigo_interno,
        nombre: item.nombre,
        sistema: item.total_sistema,
        contado: item.total_contado
      })
    }
  }

  const descStmt = db.prepare(`
    SELECT COALESCE(descripcion, '') AS descripcion FROM productos WHERE id = ?
  `)

  return [...map.entries()]
    .map(([productoId, row]) => {
      const desc = descStmt.get(productoId) as { descripcion: string } | undefined
      const diferencia = row.contado - row.sistema
      return {
        codigo_interno: row.codigo_interno,
        nombre: row.nombre,
        descripcion: desc?.descripcion ?? '',
        sistema: row.sistema,
        contado: row.contado,
        diferencia,
        resultado: resultadoInventarioExport(row.sistema, row.contado)
      }
    })
    .sort((a, b) =>
      a.codigo_interno.localeCompare(b.codigo_interno, 'es', { sensitivity: 'base' })
    )
}

/** Stock final agregado por producto (sin sectores ni diferencias). */
function stockFinalInventarioExport(
  detalle: Array<Record<string, unknown>>
): Array<{ codigo_interno: string; nombre: string; cantidad: number }> {
  const map = new Map<number, { codigo_interno: string; nombre: string; cantidad: number }>()

  for (const item of detalle) {
    const productoId = Number(item.producto_id)
    if (!Number.isFinite(productoId) || productoId <= 0) continue
    const cantidad = Number(
      item.total_aplicado != null ? item.total_aplicado : item.total_contado ?? 0
    )
    const prev = map.get(productoId)
    if (prev) {
      prev.cantidad += cantidad
    } else {
      map.set(productoId, {
        codigo_interno: String(item.codigo_interno ?? ''),
        nombre: String(item.nombre ?? ''),
        cantidad
      })
    }
  }

  return [...map.values()]
    .filter((row) => row.cantidad > 0)
    .sort((a, b) =>
      a.codigo_interno.localeCompare(b.codigo_interno, 'es', { sensitivity: 'base' })
    )
}

export async function inventarioRoutes(app: FastifyInstance): Promise<void> {
  /** Visible para cualquier usuario autenticado (banner global). */
  app.get('/api/inventario/activo-banner', async () => {
    const db = getDb()
    const activo = getInventarioActivo(db)
    if (!activo) return { activo: null }

    const counts = db.prepare(`
      SELECT
        COUNT(*) AS sectores_total,
        SUM(CASE WHEN estado = 'CERRADO_OK' THEN 1 ELSE 0 END) AS sectores_ok
      FROM inventario_sectores WHERE sesion_id = ?
    `).get(activo.id) as { sectores_total: number; sectores_ok: number }

    return {
      activo: {
        id: activo.id,
        nombre: activo.nombre,
        estado: activo.estado,
        sectores_total: Number(counts.sectores_total ?? 0),
        sectores_ok: Number(counts.sectores_ok ?? 0)
      }
    }
  })

  app.get('/api/inventario/activo', { preHandler: requirePermiso('inventario.ver') }, async () => {
    const db = getDb()
    return { activo: getInventarioActivo(db) }
  })

  app.get('/api/inventario/sesiones', { preHandler: requirePermiso('inventario.ver') }, async () => {
    const db = getDb()
    const rows = db.prepare(`
      SELECT
        s.*,
        u.nombre AS creado_por_nombre,
        (SELECT COUNT(*) FROM inventario_sectores WHERE sesion_id = s.id) AS sectores_total,
        (SELECT COUNT(*) FROM inventario_sectores WHERE sesion_id = s.id AND estado = 'CERRADO_OK') AS sectores_ok
      FROM inventario_sesiones s
      JOIN usuarios u ON u.id = s.creado_por_id
      ORDER BY s.id DESC
    `).all() as Array<Record<string, unknown>>
    return rows.map(mapSesionListItem)
  })

  app.get<{ Params: { id: string } }>(
    '/api/inventario/sesiones/:id',
    { preHandler: requirePermiso('inventario.ver') },
    async (req) => {
      const db = getDb()
      const sesionId = Number(req.params.id)
      const sesion = getSesionOrThrow(db, sesionId)
      const sectores = getSectoresSesion(db, sesionId)
      const reporte = db.prepare(`
        SELECT * FROM inventario_reportes WHERE sesion_id = ?
      `).get(sesionId)
      return {
        sesion: {
          id: Number(sesion.id),
          nombre: String(sesion.nombre),
          estado: String(sesion.estado),
          observacion: sesion.observacion as string | null,
          creado_por_id: Number(sesion.creado_por_id),
          creado_por_nombre: String(sesion.creado_por_nombre),
          cerrado_por_id: sesion.cerrado_por_id ? Number(sesion.cerrado_por_id) : null,
          fecha_inicio: sesion.fecha_inicio as string | null,
          fecha_cierre: sesion.fecha_cierre as string | null,
          created_at: String(sesion.created_at)
        },
        sectores: sectores.map((s) => ({
          id: Number(s.id),
          sector_id: Number(s.sector_id),
          sector_nombre: String(s.sector_nombre),
          sector_codigo: String(s.sector_codigo),
          contador_1_id: Number(s.contador_1_id),
          contador_2_id: Number(s.contador_2_id),
          contador_1_nombre: String(s.contador_1_nombre),
          contador_2_nombre: String(s.contador_2_nombre),
          estado: String(s.estado),
          ronda_actual: Number(s.ronda_actual),
          contador_1_finalizo: Boolean(s.contador_1_finalizo),
          contador_2_finalizo: Boolean(s.contador_2_finalizo),
          modo_conectividad: String(s.modo_conectividad ?? 'ONLINE') === 'OFFLINE' ? 'OFFLINE' : 'ONLINE',
          paquete_descargado_at: (s.paquete_descargado_at as string | null) ?? null,
          importado_at: (s.importado_at as string | null) ?? null,
          importacion_offline: getImportacionOfflineActiva(Number(s.id))
        })),
        reporte: reporte
          ? {
              resumen: JSON.parse(String((reporte as { resumen: string }).resumen)),
              detalle: JSON.parse(String((reporte as { detalle: string }).detalle)),
              ajustes_aplicados: JSON.parse(String((reporte as { ajustes_aplicados: string }).ajustes_aplicados)),
              created_at: String((reporte as { created_at: string }).created_at)
            }
          : null
      }
    }
  )

  app.get<{ Params: { id: string } }>(
    '/api/inventario/sesiones/:id/export',
    { preHandler: requirePermiso('inventario.ver') },
    async (req, reply) => {
      const db = getDb()
      const sesionId = Number(req.params.id)
      const sesion = getSesionOrThrow(db, sesionId)

      let rawItems: InventarioExportItem[] = []

      const reporte = db.prepare(`
        SELECT detalle FROM inventario_reportes WHERE sesion_id = ?
      `).get(sesionId) as { detalle: string } | undefined

      if (reporte?.detalle) {
        const detalle = JSON.parse(reporte.detalle) as Array<Record<string, unknown>>
        rawItems = detalle.map((item) => ({
          producto_id: Number(item.producto_id),
          codigo_interno: String(item.codigo_interno ?? ''),
          nombre: String(item.nombre ?? ''),
          total_sistema: Number(item.total_sistema ?? 0),
          total_contado: Number(
            item.total_aplicado != null ? item.total_aplicado : item.total_contado ?? 0
          )
        }))
      } else {
        try {
          const comparacion = compararVsSistema(db, sesionId)
          rawItems = comparacion.items.map((item) => ({
            producto_id: Number(item.producto_id),
            codigo_interno: String(item.codigo_interno ?? ''),
            nombre: String(item.nombre ?? ''),
            total_sistema: Number(item.total_sistema ?? 0),
            total_contado: Number(item.total_contado ?? 0)
          }))
        } catch (e) {
          return reply.status(400).send({
            error:
              (e as Error).message ||
              'El export requiere el inventario cerrado o todos los sectores OK'
          })
        }
      }

      const rows = agregarProductosInventarioExport(db, rawItems)
      const totalSistema = rows.reduce((s, r) => s + r.sistema, 0)
      const totalContado = rows.reduce((s, r) => s + r.contado, 0)
      const totalDif = totalContado - totalSistema
      const conDif = rows.filter((r) => r.resultado !== 'Sin cambio').length

      const buffer = await buildMultiSheetExcel([
        resumenSheet('Resumen', [
          ['Nombre', String(sesion.nombre)],
          ['Estado', String(sesion.estado)],
          ['Creada', String(sesion.created_at)],
          ['Inicio', sesion.fecha_inicio as string | null],
          ['Cierre', sesion.fecha_cierre as string | null],
          ['Observación', sesion.observacion as string | null],
          ['Productos', rows.length],
          ['Con diferencias', conDif],
          ['Total sistema', totalSistema],
          ['Total contado', totalContado],
          ['Diferencia', totalDif]
        ]),
        {
          name: 'Productos',
          columns: [
            { header: 'Código interno', key: 'codigo_interno', width: 18 },
            { header: 'Nombre', key: 'nombre', width: 36 },
            { header: 'Descripción', key: 'descripcion', width: 40 },
            { header: 'Sistema', key: 'sistema', width: 12 },
            { header: 'Contado', key: 'contado', width: 12 },
            { header: 'Diferencia', key: 'diferencia', width: 12 },
            { header: 'Resultado', key: 'resultado', width: 14 }
          ],
          rows: [
            ...rows,
            {
              codigo_interno: '',
              nombre: 'TOTAL',
              descripcion: '',
              sistema: totalSistema,
              contado: totalContado,
              diferencia: totalDif,
              resultado: ''
            }
          ]
        }
      ])

      const safeName = String(sesion.nombre)
        .replace(/[^\w.\-() áéíóúÁÉÍÓÚñÑ]/g, '_')
        .trim()
        .slice(0, 40)
      return sendExcelFile(
        reply,
        buffer,
        `inventario-${safeName || sesionId}-${todayFileStamp()}.xlsx`
      )
    }
  )

  app.get<{ Params: { id: string } }>(
    '/api/inventario/sesiones/:id/export-stock',
    { preHandler: requirePermiso('inventario.ver') },
    async (req, reply) => {
      const db = getDb()
      const sesionId = Number(req.params.id)
      const sesion = getSesionOrThrow(db, sesionId)

      const reporte = db.prepare(`
        SELECT detalle FROM inventario_reportes WHERE sesion_id = ?
      `).get(sesionId) as { detalle: string } | undefined

      if (!reporte?.detalle) {
        return reply.status(400).send({
          error: 'El export de stock final requiere el inventario cerrado'
        })
      }

      const detalle = JSON.parse(reporte.detalle) as Array<Record<string, unknown>>
      const rows = stockFinalInventarioExport(detalle)
      const totalCantidad = rows.reduce((s, r) => s + r.cantidad, 0)

      const buffer = await buildMultiSheetExcel([
        resumenSheet('Resumen', [
          ['Nombre', String(sesion.nombre)],
          ['Estado', String(sesion.estado)],
          ['Creada', String(sesion.created_at)],
          ['Inicio', sesion.fecha_inicio as string | null],
          ['Cierre', sesion.fecha_cierre as string | null],
          ['Observación', sesion.observacion as string | null],
          ['Productos con stock', rows.length],
          ['Cantidad total', totalCantidad]
        ]),
        {
          name: 'Stock final',
          columns: [
            { header: 'Código interno', key: 'codigo_interno', width: 18 },
            { header: 'Nombre', key: 'nombre', width: 36 },
            { header: 'Cantidad', key: 'cantidad', width: 14 }
          ],
          rows: [
            ...rows,
            {
              codigo_interno: '',
              nombre: 'TOTAL',
              cantidad: totalCantidad
            }
          ]
        }
      ])

      const safeName = String(sesion.nombre)
        .replace(/[^\w.\-() áéíóúÁÉÍÓÚñÑ]/g, '_')
        .trim()
        .slice(0, 40)
      return sendExcelFile(
        reply,
        buffer,
        `inventario-stock-${safeName || sesionId}-${todayFileStamp()}.xlsx`
      )
    }
  )

  app.post<{ Body: CrearSesionBody }>(
    '/api/inventario/sesiones',
    { preHandler: requirePermiso('inventario.crear_sesion') },
    async (req, reply) => {
      const db = getDb()
      if (getInventarioActivo(db)) {
        return reply.status(409).send({ error: 'Ya hay un inventario en curso' })
      }

      const nombre = req.body.nombre?.trim()
      const sectores = req.body.sectores ?? []
      if (!nombre) return reply.status(400).send({ error: 'Nombre requerido' })
      if (sectores.length === 0) return reply.status(400).send({ error: 'Seleccioná al menos un sector' })

      for (const s of sectores) {
        if (!s.sector_id || !s.contador_1_id || !s.contador_2_id) {
          return reply.status(400).send({ error: 'Cada sector requiere dos contadores' })
        }
        if (s.contador_1_id === s.contador_2_id) {
          return reply.status(400).send({ error: 'Los dos contadores deben ser distintos' })
        }
        if (s.modo_conectividad && !['ONLINE', 'OFFLINE'].includes(s.modo_conectividad)) {
          return reply.status(400).send({ error: 'modo_conectividad inválido' })
        }
        const sector = db.prepare('SELECT id FROM sectores WHERE id = ? AND activo = 1').get(s.sector_id)
        if (!sector) return reply.status(400).send({ error: `Sector ${s.sector_id} no válido` })
      }

      const userId = req.user!.id
      const tx = db.transaction(() => {
        const result = db.prepare(`
          INSERT INTO inventario_sesiones (nombre, observacion, creado_por_id, estado)
          VALUES (?, ?, ?, 'ABIERTA')
        `).run(nombre, req.body.observacion ?? null, userId)
        const sesionId = Number(result.lastInsertRowid)

        const insertSec = db.prepare(`
          INSERT INTO inventario_sectores (sesion_id, sector_id, contador_1_id, contador_2_id, modo_conectividad)
          VALUES (?, ?, ?, ?, ?)
        `)
        for (const s of sectores) {
          insertSec.run(
            sesionId,
            s.sector_id,
            s.contador_1_id,
            s.contador_2_id,
            s.modo_conectividad === 'OFFLINE' ? 'OFFLINE' : 'ONLINE'
          )
        }
        return sesionId
      })

      const sesionId = tx()
      return { id: sesionId }
    }
  )

  app.post<{ Params: { id: string } }>(
    '/api/inventario/sesiones/:id/iniciar',
    { preHandler: requirePermiso('inventario.crear_sesion') },
    async (req, reply) => {
      const db = getDb()
      const sesionId = Number(req.params.id)
      const sesion = getSesionOrThrow(db, sesionId)

      if (String(sesion.estado) !== 'ABIERTA') {
        return reply.status(400).send({ error: 'La sesión no está en estado ABIERTA' })
      }
      if (getInventarioActivo(db)) {
        return reply.status(409).send({ error: 'Ya hay un inventario en curso' })
      }

      const sectorIds = db.prepare(`
        SELECT sector_id FROM inventario_sectores WHERE sesion_id = ?
      `).all(sesionId) as Array<{ sector_id: number }>

      const tx = db.transaction(() => {
        db.prepare(`
          UPDATE inventario_sesiones
          SET estado = 'EN_PROGRESO', fecha_inicio = datetime('now')
          WHERE id = ?
        `).run(sesionId)
        crearSnapshotInventario(
          db,
          sesionId,
          sectorIds.map((s) => s.sector_id)
        )
      })
      tx()
      return { ok: true }
    }
  )

  app.post<{ Params: { id: string } }>(
    '/api/inventario/sesiones/:id/cancelar',
    { preHandler: requirePermiso('inventario.crear_sesion') },
    async (req, reply) => {
      const db = getDb()
      const sesionId = Number(req.params.id)
      const sesion = getSesionOrThrow(db, sesionId)
      if (!['ABIERTA', 'EN_PROGRESO'].includes(String(sesion.estado))) {
        return reply.status(400).send({ error: 'No se puede cancelar esta sesión' })
      }
      db.prepare(`
        UPDATE inventario_sesiones SET estado = 'CANCELADA' WHERE id = ?
      `).run(sesionId)
      return { ok: true }
    }
  )

  app.get(
    '/api/inventario/mis-sectores',
    { preHandler: requirePermiso('inventario.contar') },
    async (req) => {
      const db = getDb()
      const userId = req.user!.id
      const activo = getInventarioActivo(db)
      if (!activo) return { activo: null, sectores: [] }

      const sectores = db.prepare(`
        SELECT
          isec.*,
          s.nombre AS sector_nombre,
          s.codigo AS sector_codigo,
          u1.nombre AS contador_1_nombre,
          u2.nombre AS contador_2_nombre
        FROM inventario_sectores isec
        JOIN inventario_sesiones ses ON ses.id = isec.sesion_id
        JOIN sectores s ON s.id = isec.sector_id
        JOIN usuarios u1 ON u1.id = isec.contador_1_id
        JOIN usuarios u2 ON u2.id = isec.contador_2_id
        WHERE ses.estado = 'EN_PROGRESO'
          AND (isec.contador_1_id = ? OR isec.contador_2_id = ?)
        ORDER BY s.nombre
      `).all(userId, userId) as Array<Record<string, unknown>>

      return {
        activo,
        sectores: sectores.map((s) => ({
          id: Number(s.id),
          sesion_id: Number(s.sesion_id),
          sector_id: Number(s.sector_id),
          sector_nombre: String(s.sector_nombre),
          sector_codigo: String(s.sector_codigo),
          estado: String(s.estado),
          ronda_actual: Number(s.ronda_actual),
          contador_1_id: Number(s.contador_1_id),
          contador_2_id: Number(s.contador_2_id),
          contador_1_nombre: String(s.contador_1_nombre),
          contador_2_nombre: String(s.contador_2_nombre),
          contador_1_finalizo: Boolean(s.contador_1_finalizo),
          contador_2_finalizo: Boolean(s.contador_2_finalizo),
          soy_contador_1: Number(s.contador_1_id) === userId,
          modo_conectividad: String(s.modo_conectividad ?? 'ONLINE') === 'OFFLINE' ? 'OFFLINE' : 'ONLINE',
          paquete_descargado_at: (s.paquete_descargado_at as string | null) ?? null,
          importado_at: (s.importado_at as string | null) ?? null
        }))
      }
    }
  )

  app.get<{ Params: { id: string } }>(
    '/api/inventario/sectores/:id',
    { preHandler: requirePermisoAny('inventario.ver', 'inventario.contar') },
    async (req, reply) => {
      const db = getDb()
      const inventarioSectorId = Number(req.params.id)
      const userId = req.user!.id
      const canSupervise = req.user!.permisos.includes('inventario.supervisar')

      let sector: Record<string, unknown>
      let rol: 1 | 2 | null = null
      try {
        sector = getInventarioSector(db, inventarioSectorId)
        try {
          const assigned = assertContadorEnSector(db, inventarioSectorId, userId)
          rol = assigned.rol
        } catch (assignErr) {
          if (!canSupervise) {
            throw assignErr
          }
        }
      } catch (e) {
        return reply.status(403).send({ error: (e as Error).message })
      }

      if (
        Number(sector.contador_1_finalizo) &&
        Number(sector.contador_2_finalizo) &&
        String(sector.estado) === 'ESPERANDO_COMPANERO'
      ) {
        ejecutarComparacionSector(db, inventarioSectorId)
        sector = getInventarioSector(db, inventarioSectorId)
      }

      const ronda = Number(sector.ronda_actual)
      const c1 = Number(sector.contador_1_id)
      const c2 = Number(sector.contador_2_id)

      asegurarPrecargaReconteo(db, inventarioSectorId)
      sector = getInventarioSector(db, inventarioSectorId)

      const lineas = db.prepare(`
        SELECT icl.*, p.codigo_interno, p.nombre, p.unidad
        FROM inventario_conteo_lineas icl
        JOIN productos p ON p.id = icl.producto_id
        WHERE icl.inventario_sector_id = ? AND icl.ronda = ?
        ORDER BY icl.producto_id, icl.contador_id, icl.orden, icl.id
      `).all(inventarioSectorId, ronda) as Array<Record<string, unknown>>

      const mapLineas = (contadorId: number | null) => {
        const filtered = lineas.filter(
          (l) => contadorId === null || Number(l.contador_id) === contadorId
        )
        return filtered.map((l) => {
          const { botellasPorCaja } = getProductoDefaults(db, Number(l.producto_id))
          return mapConteoLinea(l as Parameters<typeof mapConteoLinea>[0], botellasPorCaja)
        })
      }

      const mostrarComparacion =
        canSupervise ||
        (Boolean(sector.contador_1_finalizo) &&
          Boolean(sector.contador_2_finalizo) &&
          ['CON_DIFERENCIAS', 'CERRADO_OK'].includes(String(sector.estado)))

      const mostrarLineasCompanero =
        canSupervise ||
        (Boolean(sector.contador_1_finalizo) &&
          Boolean(sector.contador_2_finalizo))

      let comparacion = null
      if (mostrarComparacion) {
        comparacion = compararContadores(db, inventarioSectorId, ronda)
      }

      const referencia_reconteo =
        ronda > 1 ? compararContadores(db, inventarioSectorId, ronda - 1) : null

      const sectorId = Number(sector.sector_id)
      const sectorMeta = db.prepare(`
        SELECT usa_ubicaciones FROM sectores WHERE id = ?
      `).get(sectorId) as { usa_ubicaciones: number } | undefined
      const usa_ubicaciones = Boolean(sectorMeta?.usa_ubicaciones)
      const ubicaciones = usa_ubicaciones
        ? (db.prepare(`
            SELECT id, sector_id, codigo, nombre, orden, activo, created_at
            FROM sector_ubicaciones
            WHERE sector_id = ? AND activo = 1
            ORDER BY orden ASC, nombre COLLATE NOCASE ASC, id ASC
          `).all(sectorId) as Array<{
            id: number
            sector_id: number
            codigo: string
            nombre: string
            orden: number
            activo: number
            created_at: string
          }>)
        : []

      return {
        sector: {
          id: Number(sector.id),
          sesion_id: Number(sector.sesion_id),
          sector_id: sectorId,
          sector_nombre: String(sector.sector_nombre),
          estado: String(sector.estado),
          ronda_actual: ronda,
          contador_1_id: c1,
          contador_2_id: c2,
          contador_1_nombre: String(sector.contador_1_nombre),
          contador_2_nombre: String(sector.contador_2_nombre),
          contador_1_finalizo: Boolean(sector.contador_1_finalizo),
          contador_2_finalizo: Boolean(sector.contador_2_finalizo),
          usa_ubicaciones,
          modo_conectividad: String(sector.modo_conectividad ?? 'ONLINE') === 'OFFLINE' ? 'OFFLINE' : 'ONLINE',
          paquete_descargado_at: (sector.paquete_descargado_at as string | null) ?? null,
          importado_at: (sector.importado_at as string | null) ?? null
        },
        ubicaciones,
        mi_rol: rol,
        mis_lineas: rol ? mapLineas(rol === 1 ? c1 : c2) : [],
        lineas_contador_1: mostrarLineasCompanero || canSupervise ? mapLineas(c1) : undefined,
        lineas_contador_2: mostrarLineasCompanero || canSupervise ? mapLineas(c2) : undefined,
        comparacion,
        referencia_reconteo
      }
    }
  )

  app.post<{ Params: { id: string }; Body: ConteoLineaInput }>(
    '/api/inventario/sectores/:id/lineas',
    { preHandler: requirePermiso('inventario.contar') },
    async (req, reply) => {
      const db = getDb()
      const inventarioSectorId = Number(req.params.id)
      const userId = req.user!.id

      try {
        const { rol, sector } = assertContadorEnSector(db, inventarioSectorId, userId)
        assertNoConteoOnlineEnOffline(sector)
        assertSectorEditable(sector, rol)

        const sesion = getSesionOrThrow(db, Number(sector.sesion_id))
        if (String(sesion.estado) !== 'EN_PROGRESO') {
          return reply.status(400).send({ error: 'El inventario no está en curso' })
        }

        const body = req.body
        if (!body.producto_id) return reply.status(400).send({ error: 'producto_id requerido' })

        const { total } = validarYCalcularLinea(db, body.producto_id, body)
        const ronda = Number(sector.ronda_actual)
        const contadorId = rol === 1 ? Number(sector.contador_1_id) : Number(sector.contador_2_id)

        const maxOrden = db.prepare(`
          SELECT COALESCE(MAX(orden), 0) AS m FROM inventario_conteo_lineas
          WHERE inventario_sector_id = ? AND contador_id = ? AND ronda = ? AND producto_id = ?
        `).get(inventarioSectorId, contadorId, ronda, body.producto_id) as { m: number }

        const tx = db.transaction(() => {
          db.prepare(`
            INSERT INTO inventario_conteo_lineas (
              inventario_sector_id, producto_id, contador_id, ronda,
              tipo_bulto, cantidad_bultos, unidades_por_bulto, cantidad_suelta,
              ubicacion, ubicacion_id, total_unidades, orden
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            inventarioSectorId,
            body.producto_id,
            contadorId,
            ronda,
            body.tipo_bulto,
            body.tipo_bulto === 'SUELTO' ? null : body.cantidad_bultos ?? null,
            body.tipo_bulto === 'SUELTO' ? null : body.unidades_por_bulto ?? null,
            body.tipo_bulto === 'SUELTO' ? body.cantidad_suelta ?? null : body.cantidad_suelta ?? null,
            body.ubicacion ?? null,
            body.ubicacion_id ?? null,
            total,
            Number(maxOrden.m) + 1
          )

          if (String(sector.estado) === 'PENDIENTE') {
            db.prepare(`
              UPDATE inventario_sectores SET estado = 'EN_CONTEO' WHERE id = ?
            `).run(inventarioSectorId)
          }
        })
        tx()
        return { ok: true, total_unidades: total }
      } catch (e) {
        return reply.status(400).send({ error: (e as Error).message })
      }
    }
  )

  app.put<{ Params: { sectorId: string; lineaId: string }; Body: ConteoLineaInput }>(
    '/api/inventario/sectores/:sectorId/lineas/:lineaId',
    { preHandler: requirePermiso('inventario.contar') },
    async (req, reply) => {
      const db = getDb()
      const inventarioSectorId = Number(req.params.sectorId)
      const lineaId = Number(req.params.lineaId)
      const userId = req.user!.id

      try {
        const { rol, sector } = assertContadorEnSector(db, inventarioSectorId, userId)
        assertNoConteoOnlineEnOffline(sector)
        assertSectorEditable(sector, rol)

        const sesion = getSesionOrThrow(db, Number(sector.sesion_id))
        if (String(sesion.estado) !== 'EN_PROGRESO') {
          return reply.status(400).send({ error: 'El inventario no está en curso' })
        }

        const existente = db.prepare(`
          SELECT * FROM inventario_conteo_lineas
          WHERE id = ? AND inventario_sector_id = ?
        `).get(lineaId, inventarioSectorId) as
          | { contador_id: number; ronda: number; producto_id: number }
          | undefined

        if (!existente) return reply.status(404).send({ error: 'Línea no encontrada' })

        const contadorId = rol === 1 ? Number(sector.contador_1_id) : Number(sector.contador_2_id)
        if (
          existente.contador_id !== contadorId ||
          existente.ronda !== Number(sector.ronda_actual)
        ) {
          return reply.status(403).send({ error: 'No podés editar esta línea' })
        }

        const body = req.body
        const productoId = body.producto_id ?? existente.producto_id
        const { total } = validarYCalcularLinea(db, productoId, {
          ...body,
          producto_id: productoId
        })

        db.prepare(`
          UPDATE inventario_conteo_lineas SET
            tipo_bulto = ?,
            cantidad_bultos = ?,
            unidades_por_bulto = ?,
            cantidad_suelta = ?,
            ubicacion = ?,
            ubicacion_id = ?,
            total_unidades = ?
          WHERE id = ?
        `).run(
          body.tipo_bulto,
          body.tipo_bulto === 'SUELTO' ? null : body.cantidad_bultos ?? null,
          body.tipo_bulto === 'SUELTO' ? null : body.unidades_por_bulto ?? null,
          body.tipo_bulto === 'SUELTO' ? body.cantidad_suelta ?? null : body.cantidad_suelta ?? null,
          body.ubicacion ?? null,
          body.ubicacion_id ?? null,
          total,
          lineaId
        )

        return { ok: true, total_unidades: total }
      } catch (e) {
        return reply.status(400).send({ error: (e as Error).message })
      }
    }
  )

  app.delete<{ Params: { sectorId: string; lineaId: string } }>(
    '/api/inventario/sectores/:sectorId/lineas/:lineaId',
    { preHandler: requirePermiso('inventario.contar') },
    async (req, reply) => {
      const db = getDb()
      const inventarioSectorId = Number(req.params.sectorId)
      const lineaId = Number(req.params.lineaId)
      const userId = req.user!.id

      try {
        const { rol, sector } = assertContadorEnSector(db, inventarioSectorId, userId)
        assertNoConteoOnlineEnOffline(sector)
        assertSectorEditable(sector, rol)

        const linea = db.prepare(`
          SELECT * FROM inventario_conteo_lineas
          WHERE id = ? AND inventario_sector_id = ?
        `).get(lineaId, inventarioSectorId) as { contador_id: number; ronda: number } | undefined

        if (!linea) return reply.status(404).send({ error: 'Línea no encontrada' })
        const contadorId = rol === 1 ? Number(sector.contador_1_id) : Number(sector.contador_2_id)
        if (linea.contador_id !== contadorId || linea.ronda !== Number(sector.ronda_actual)) {
          return reply.status(403).send({ error: 'No podés eliminar esta línea' })
        }

        db.prepare('DELETE FROM inventario_conteo_lineas WHERE id = ?').run(lineaId)
        return { ok: true }
      } catch (e) {
        return reply.status(400).send({ error: (e as Error).message })
      }
    }
  )

  app.post<{ Params: { id: string } }>(
    '/api/inventario/sectores/:id/finalizar',
    { preHandler: requirePermiso('inventario.contar') },
    async (req, reply) => {
      const db = getDb()
      const inventarioSectorId = Number(req.params.id)
      const userId = req.user!.id

      try {
        const { rol, sector } = assertContadorEnSector(db, inventarioSectorId, userId)
        assertNoConteoOnlineEnOffline(sector)
        assertSectorFinalizable(sector, rol)

        const col = rol === 1 ? 'contador_1_finalizo' : 'contador_2_finalizo'
        db.prepare(`UPDATE inventario_sectores SET ${col} = 1 WHERE id = ?`).run(inventarioSectorId)

        const updated = db.prepare('SELECT * FROM inventario_sectores WHERE id = ?').get(
          inventarioSectorId
        ) as Record<string, unknown>

        let comparacion = null
        if (Number(updated.contador_1_finalizo) && Number(updated.contador_2_finalizo)) {
          comparacion = ejecutarComparacionSector(db, inventarioSectorId)
        } else {
          db.prepare(`
            UPDATE inventario_sectores SET estado = 'ESPERANDO_COMPANERO' WHERE id = ?
          `).run(inventarioSectorId)
        }

        return { ok: true, comparacion }
      } catch (e) {
        return reply.status(400).send({ error: (e as Error).message })
      }
    }
  )

  app.post<{ Params: { id: string } }>(
    '/api/inventario/sectores/:id/reabrir-conteo',
    { preHandler: requirePermiso('inventario.contar') },
    async (req, reply) => {
      const db = getDb()
      try {
        return reabrirConteoPropio(db, Number(req.params.id), req.user!.id)
      } catch (e) {
        return reply.status(400).send({ error: (e as Error).message })
      }
    }
  )

  app.post<{ Params: { id: string } }>(
    '/api/inventario/sectores/:id/reconteo',
    { preHandler: requirePermiso('inventario.contar') },
    async (req, reply) => {
      const db = getDb()
      const inventarioSectorId = Number(req.params.id)
      try {
        assertContadorEnSector(db, inventarioSectorId, req.user!.id)
        const sector = getInventarioSector(db, inventarioSectorId)
        assertNoConteoOnlineEnOffline(sector)
        const result = iniciarReconteoSector(db, inventarioSectorId)
        return { ok: true, ...result }
      } catch (e) {
        return reply.status(400).send({ error: (e as Error).message })
      }
    }
  )

  app.get<{ Params: { id: string } }>(
    '/api/inventario/sectores/:id/paquete-offline',
    { preHandler: requirePermiso('inventario.contar') },
    async (req, reply) => {
      const db = getDb()
      try {
        return buildPaqueteOffline(db, Number(req.params.id), req.user!.id)
      } catch (e) {
        return reply.status(400).send({ error: (e as Error).message })
      }
    }
  )

  app.post<{ Params: { id: string }; Body: ImportarOfflineBody }>(
    '/api/inventario/sectores/:id/importar-offline',
    { preHandler: requirePermisoAny('inventario.contar', 'inventario.supervisar') },
    async (req, reply) => {
      const db = getDb()
      const inventarioSectorId = Number(req.params.id)
      try {
        try {
          assertContadorEnSector(db, inventarioSectorId, req.user!.id)
        } catch {
          if (!req.user!.permisos.includes('inventario.supervisar')) {
            throw new Error('No estás asignado como contador en este sector')
          }
        }
        return importarConteoOffline(
          db,
          inventarioSectorId,
          req.body ?? { ronda_actual: 1, lineas: [] }
        )
      } catch (e) {
        return reply.status(400).send({ error: (e as Error).message })
      } finally {
        limpiarImportacionOfflineActiva(inventarioSectorId)
      }
    }
  )

  app.post<{ Params: { id: string } }>(
    '/api/inventario/sectores/:id/iniciar-importacion-offline',
    { preHandler: requirePermisoAny('inventario.contar', 'inventario.supervisar') },
    async (req, reply) => {
      const db = getDb()
      const inventarioSectorId = Number(req.params.id)
      try {
        const sector = getInventarioSector(db, inventarioSectorId)
        if (String(sector.modo_conectividad ?? 'ONLINE') !== 'OFFLINE') {
          throw new Error('Este sector no está en modo offline')
        }
        try {
          assertContadorEnSector(db, inventarioSectorId, req.user!.id)
        } catch {
          if (!req.user!.permisos.includes('inventario.supervisar')) {
            throw new Error('No estás asignado como contador en este sector')
          }
        }
        if (sector.importado_at || String(sector.estado) === 'CERRADO_OK') {
          throw new Error('Este sector ya fue importado al PC')
        }
        marcarImportacionOfflineActiva(inventarioSectorId, req.user!.id)
        return { ok: true }
      } catch (e) {
        return reply.status(400).send({ error: (e as Error).message })
      }
    }
  )

  app.post<{ Params: { id: string }; Body: ImportarOfflineArchivoBody }>(
    '/api/inventario/sectores/:id/importar-offline-archivo',
    { preHandler: requirePermiso('inventario.supervisar') },
    async (req, reply) => {
      const db = getDb()
      const inventarioSectorId = Number(req.params.id)
      try {
        const body = validarPaqueteImportacionPc(db, inventarioSectorId, req.body)
        return importarConteoOffline(db, inventarioSectorId, body)
      } catch (e) {
        return reply.status(400).send({ error: (e as Error).message })
      }
    }
  )

  app.patch<{ Params: { id: string }; Body: { modo_conectividad?: ModoConectividadInventario } }>(
    '/api/inventario/sectores/:id/modo',
    { preHandler: requirePermiso('inventario.crear_sesion') },
    async (req, reply) => {
      const db = getDb()
      const inventarioSectorId = Number(req.params.id)
      const modo = req.body?.modo_conectividad
      if (modo !== 'ONLINE' && modo !== 'OFFLINE') {
        return reply.status(400).send({ error: 'modo_conectividad debe ser ONLINE u OFFLINE' })
      }

      try {
        const sector = getInventarioSector(db, inventarioSectorId)
        const sesion = getSesionOrThrow(db, Number(sector.sesion_id))
        if (!['ABIERTA', 'EN_PROGRESO'].includes(String(sesion.estado))) {
          return reply.status(400).send({ error: 'La sesión no admite cambio de modo' })
        }
        if (String(sector.estado) !== 'PENDIENTE') {
          return reply.status(400).send({ error: 'Solo se puede cambiar el modo si el sector está pendiente' })
        }
        const lineas = db
          .prepare(`SELECT 1 FROM inventario_conteo_lineas WHERE inventario_sector_id = ? LIMIT 1`)
          .get(inventarioSectorId)
        if (lineas) {
          return reply.status(400).send({ error: 'El sector ya tiene líneas de conteo' })
        }
        if (sector.paquete_descargado_at) {
          return reply.status(400).send({ error: 'Ya se descargó un paquete offline para este sector' })
        }

        db.prepare(`UPDATE inventario_sectores SET modo_conectividad = ? WHERE id = ?`).run(
          modo,
          inventarioSectorId
        )
        return { ok: true, modo_conectividad: modo }
      } catch (e) {
        return reply.status(400).send({ error: (e as Error).message })
      }
    }
  )

  app.get<{ Params: { id: string } }>(
    '/api/inventario/sesiones/:id/comparacion-sistema',
    { preHandler: requirePermiso('inventario.supervisar', 'inventario.cerrar') },
    async (req, reply) => {
      const db = getDb()
      try {
        return compararVsSistema(db, Number(req.params.id))
      } catch (e) {
        return reply.status(400).send({ error: (e as Error).message })
      }
    }
  )

  app.post<{ Params: { id: string }; Body: { decisiones?: CierreDecisionInput[] } }>(
    '/api/inventario/sesiones/:id/cerrar',
    { preHandler: requirePermiso('inventario.cerrar', 'ajustes.crear') },
    async (req, reply) => {
      const db = getDb()
      const sesionId = Number(req.params.id)
      const sesion = getSesionOrThrow(db, sesionId)
      if (String(sesion.estado) !== 'EN_PROGRESO') {
        return reply.status(400).send({ error: 'La sesión no está en curso' })
      }
      try {
        const decisiones = req.body?.decisiones ?? []
        const result = aplicarCierreInventario(db, sesionId, req.user!.id, decisiones)
        return result
      } catch (e) {
        return reply.status(400).send({ error: (e as Error).message })
      }
    }
  )

  app.get('/api/inventario/usuarios-contadores', {
    preHandler: requirePermiso('inventario.crear_sesion')
  }, async () => {
    const db = getDb()
    return db.prepare(`
      SELECT u.id, u.username, u.nombre, r.nombre AS rol_nombre
      FROM usuarios u
      LEFT JOIN roles r ON r.id = u.rol_id
      WHERE u.activo = 1
      ORDER BY u.nombre
    `).all()
  })
}

export { inventarioActivoErrorPayload }
