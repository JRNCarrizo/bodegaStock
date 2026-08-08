import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { getDb } from '../db'
import { requirePermiso, requirePermisoAny } from '../plugins/auth'
import { getInventarioActivo, inventarioActivoErrorPayload } from '../utils/inventario-block'
import { isAdministradorRol } from '../utils/secciones'
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
  cerrarSectorSinComparacionPares,
  compararContadores,
  compararVsSistema,
  crearSnapshotInventario,
  ejecutarComparacionSector,
  esVerificacionSimple,
  getSesionOrThrow,
  getInventarioSector,
  getConteoFinalSector,
  iniciarReconteoSector,
  mapConteoLinea,
  reabrirConteoPropio,
  repararStockInventarioCerrado,
  validarYCalcularLinea,
  type ConteoLineaInput,
  type CierreDecisionInput,
  type ModoVerificacionInventario
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
import { getProductoDefaults, rememberUnidadesPorCajaDefault, STOCK_LINEA_SUELTO_SQL } from '../utils/stock'

interface SectorAsignacion {
  sector_id: number
  contador_1_id: number
  contador_2_id?: number | null
  modo_conectividad?: ModoConectividadInventario
  modo_verificacion?: ModoVerificacionInventario
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
    archivada: Boolean(Number(row.archivada ?? 0)),
    created_at: String(row.created_at)
  }
}

function assertAdminPassword(
  db: ReturnType<typeof getDb>,
  userId: number,
  password: unknown
): { ok: true } | { ok: false; error: string; status: number } {
  if (typeof password !== 'string' || !password.trim()) {
    return { ok: false, status: 400, error: 'Ingresá tu contraseña para confirmar' }
  }
  const row = db
    .prepare(`SELECT password_hash, rol_id FROM usuarios WHERE id = ? AND activo = 1`)
    .get(userId) as { password_hash: string; rol_id: number } | undefined
  if (!row) {
    return { ok: false, status: 401, error: 'Usuario no encontrado' }
  }
  if (!isAdministradorRol(db, row.rol_id)) {
    return { ok: false, status: 403, error: 'Solo un administrador puede archivar inventarios' }
  }
  if (!bcrypt.compareSync(password, row.password_hash)) {
    return { ok: false, status: 401, error: 'Contraseña incorrecta' }
  }
  return { ok: true }
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
    LEFT JOIN usuarios u2 ON u2.id = isec.contador_2_id
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
  items: InventarioExportItem[]
): Array<{
  codigo_interno: string
  nombre: string
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

  return [...map.values()]
    .map((row) => {
      const diferencia = row.contado - row.sistema
      return {
        codigo_interno: row.codigo_interno,
        nombre: row.nombre,
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
  detalle: Array<Record<string, unknown>>,
  incluirCeros = false
): Array<{ codigo_interno: string; nombre: string; cajas: number; botellas: number }> {
  const map = new Map<
    number,
    { codigo_interno: string; nombre: string; cajas: number; botellas: number }
  >()

  for (const item of detalle) {
    const productoId = Number(item.producto_id)
    if (!Number.isFinite(productoId) || productoId <= 0) continue
    const cajas = Number(
      item.total_aplicado != null ? item.total_aplicado : item.total_contado ?? 0
    )
    const botellas = Number(
      item.total_suelto_aplicado != null
        ? item.total_suelto_aplicado
        : item.total_suelto_contado ?? 0
    )
    const prev = map.get(productoId)
    if (prev) {
      prev.cajas += cajas
      prev.botellas += botellas
    } else {
      map.set(productoId, {
        codigo_interno: String(item.codigo_interno ?? ''),
        nombre: String(item.nombre ?? ''),
        cajas,
        botellas
      })
    }
  }

  return [...map.values()]
    .filter((row) => incluirCeros || row.cajas > 0 || row.botellas > 0)
    .sort((a, b) =>
      a.codigo_interno.localeCompare(b.codigo_interno, 'es', { sensitivity: 'base' })
    )
}

type StockPorSectorItem = {
  producto_id: number
  codigo_interno: string
  nombre: string
  sector_id: number
  sector_nombre: string
  cajas: number
  botellas: number
}

type SectorExportCol = {
  sector_id: number
  sector_nombre: string
  key: string
  keyBotellas: string
  conBotellas: boolean
}

/**
 * Matriz: Código | Producto | [cada sector (+ botellas solo si hay sueltas)] | Totales.
 */
function stockPorSectoresInventarioExport(
  items: StockPorSectorItem[],
  sectoresBase: Array<{ sector_id: number; sector_nombre: string }>,
  incluirCeros = false
): {
  sectores: SectorExportCol[]
  rows: Array<Record<string, unknown>>
} {
  const sectoresMap = new Map<number, string>()
  for (const s of sectoresBase) {
    sectoresMap.set(Number(s.sector_id), String(s.sector_nombre))
  }
  for (const item of items) {
    if (!sectoresMap.has(item.sector_id)) {
      sectoresMap.set(item.sector_id, item.sector_nombre || `Sector ${item.sector_id}`)
    }
  }

  const sectoresConBotellas = new Set<number>()
  for (const item of items) {
    if (Number(item.botellas) > 0) sectoresConBotellas.add(item.sector_id)
  }

  const sectores: SectorExportCol[] = [...sectoresMap.entries()]
    .map(([sector_id, sector_nombre]) => ({
      sector_id,
      sector_nombre,
      key: `s_${sector_id}`,
      keyBotellas: `b_${sector_id}`,
      conBotellas: sectoresConBotellas.has(sector_id)
    }))
    .sort((a, b) =>
      a.sector_nombre.localeCompare(b.sector_nombre, 'es', { sensitivity: 'base' })
    )

  const productos = new Map<
    number,
    {
      codigo_interno: string
      nombre: string
      cajasPorSector: Map<number, number>
      botellasPorSector: Map<number, number>
    }
  >()

  for (const item of items) {
    const productoId = Number(item.producto_id)
    if (!Number.isFinite(productoId) || productoId <= 0) continue
    let row = productos.get(productoId)
    if (!row) {
      row = {
        codigo_interno: item.codigo_interno,
        nombre: item.nombre,
        cajasPorSector: new Map(),
        botellasPorSector: new Map()
      }
      productos.set(productoId, row)
    }
    row.cajasPorSector.set(
      item.sector_id,
      (row.cajasPorSector.get(item.sector_id) ?? 0) + (Number(item.cajas) || 0)
    )
    row.botellasPorSector.set(
      item.sector_id,
      (row.botellasPorSector.get(item.sector_id) ?? 0) + (Number(item.botellas) || 0)
    )
  }

  const rows = [...productos.values()]
    .map((p) => {
      const out: Record<string, unknown> = {
        codigo_interno: p.codigo_interno,
        nombre: p.nombre
      }
      let totalCajas = 0
      let totalBotellas = 0
      for (const sec of sectores) {
        const cajas = p.cajasPorSector.get(sec.sector_id) ?? 0
        out[sec.key] = cajas
        totalCajas += cajas

        const botellas = p.botellasPorSector.get(sec.sector_id) ?? 0
        if (sec.conBotellas) out[sec.keyBotellas] = botellas
        totalBotellas += botellas
      }
      out.total_cajas = totalCajas
      out.total_botellas = totalBotellas
      return out
    })
    .filter(
      (r) => incluirCeros || Number(r.total_cajas) > 0 || Number(r.total_botellas) > 0
    )
    .sort((a, b) =>
      String(a.codigo_interno).localeCompare(String(b.codigo_interno), 'es', {
        sensitivity: 'base'
      })
    )

  return { sectores, rows }
}

function cantidadExportItem(item: Record<string, unknown>): number {
  return Number(item.total_aplicado != null ? item.total_aplicado : item.total_contado ?? 0)
}

function sueltoExportItem(item: Record<string, unknown>): number {
  return Number(
    item.total_suelto_aplicado != null
      ? item.total_suelto_aplicado
      : item.total_suelto_contado ?? 0
  )
}

function stockSistemaSectoresNoInventariados(
  db: ReturnType<typeof getDb>,
  sectoresInventariadosIds: number[]
): StockPorSectorItem[] {
  const inventariados = [...new Set(sectoresInventariadosIds.filter((id) => id > 0))]
  const notInClause =
    inventariados.length > 0
      ? `AND s.id NOT IN (${inventariados.map(() => '?').join(',')})`
      : ''

  const rows = db
    .prepare(
      `
      SELECT
        p.id AS producto_id,
        p.codigo_interno,
        p.nombre,
        s.id AS sector_id,
        s.nombre AS sector_nombre,
        ss.cantidad_total AS cajas,
        COALESCE((
          SELECT SUM(${STOCK_LINEA_SUELTO_SQL})
          FROM stock_lineas sl
          WHERE sl.stock_sector_id = ss.id
        ), 0) AS botellas
      FROM stock_sector ss
      JOIN productos p ON p.id = ss.producto_id
      JOIN sectores s ON s.id = ss.sector_id
      WHERE p.activo = 1
        ${notInClause}
        AND (
          ss.cantidad_total > 0
          OR EXISTS (
            SELECT 1 FROM stock_lineas sl2 WHERE sl2.stock_sector_id = ss.id
          )
        )
    `
    )
    .all(...inventariados) as Array<{
    producto_id: number
    codigo_interno: string
    nombre: string
    sector_id: number
    sector_nombre: string
    cajas: number
    botellas: number
  }>

  return rows.map((r) => ({
    producto_id: Number(r.producto_id),
    codigo_interno: String(r.codigo_interno ?? ''),
    nombre: String(r.nombre ?? ''),
    sector_id: Number(r.sector_id),
    sector_nombre: String(r.sector_nombre ?? ''),
    cajas: Number(r.cajas) || 0,
    botellas: Number(r.botellas) || 0
  }))
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

  app.get<{ Querystring: { archivadas?: string } }>(
    '/api/inventario/sesiones',
    { preHandler: requirePermiso('inventario.ver') },
    async (req) => {
      const db = getDb()
      const incluirArchivadas = String(req.query.archivadas ?? '').toLowerCase() === '1'
      const rows = db
        .prepare(
          `
      SELECT
        s.*,
        u.nombre AS creado_por_nombre,
        (SELECT COUNT(*) FROM inventario_sectores WHERE sesion_id = s.id) AS sectores_total,
        (SELECT COUNT(*) FROM inventario_sectores WHERE sesion_id = s.id AND estado = 'CERRADO_OK') AS sectores_ok
      FROM inventario_sesiones s
      JOIN usuarios u ON u.id = s.creado_por_id
      WHERE ${incluirArchivadas ? 'COALESCE(s.archivada, 0) = 1' : 'COALESCE(s.archivada, 0) = 0'}
      ORDER BY s.id DESC
    `
        )
        .all() as Array<Record<string, unknown>>
      return rows.map(mapSesionListItem)
    }
  )

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
          archivada: Boolean(Number(sesion.archivada ?? 0)),
          created_at: String(sesion.created_at)
        },
        sectores: sectores.map((s) => ({
          id: Number(s.id),
          sector_id: Number(s.sector_id),
          sector_nombre: String(s.sector_nombre),
          sector_codigo: String(s.sector_codigo),
          contador_1_id: Number(s.contador_1_id),
          contador_2_id: s.contador_2_id == null ? null : Number(s.contador_2_id),
          contador_1_nombre: String(s.contador_1_nombre),
          contador_2_nombre: s.contador_2_nombre == null ? null : String(s.contador_2_nombre),
          estado: String(s.estado),
          ronda_actual: Number(s.ronda_actual),
          contador_1_finalizo: Boolean(s.contador_1_finalizo),
          contador_2_finalizo: Boolean(s.contador_2_finalizo),
          modo_conectividad: String(s.modo_conectividad ?? 'ONLINE') === 'OFFLINE' ? 'OFFLINE' : 'ONLINE',
          modo_verificacion: String(s.modo_verificacion ?? 'DOBLE') === 'SIMPLE' ? 'SIMPLE' : 'DOBLE',
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

      const rows = agregarProductosInventarioExport(rawItems)
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

  app.get<{ Params: { id: string }; Querystring: { incluirCeros?: string } }>(
    '/api/inventario/sesiones/:id/export-stock',
    { preHandler: requirePermiso('inventario.ver') },
    async (req, reply) => {
      const db = getDb()
      const sesionId = Number(req.params.id)
      const incluirCeros = req.query.incluirCeros === '1'
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
      const rows = stockFinalInventarioExport(detalle, incluirCeros)
      const totalCajas = rows.reduce((s, r) => s + r.cajas, 0)
      const totalBotellas = rows.reduce((s, r) => s + r.botellas, 0)

      const buffer = await buildMultiSheetExcel([
        resumenSheet('Resumen', [
          ['Nombre', String(sesion.nombre)],
          ['Estado', String(sesion.estado)],
          ['Creada', String(sesion.created_at)],
          ['Inicio', sesion.fecha_inicio as string | null],
          ['Cierre', sesion.fecha_cierre as string | null],
          ['Observación', sesion.observacion as string | null],
          [incluirCeros ? 'Productos incluidos' : 'Productos con stock', rows.length],
          ['Total cajas', totalCajas],
          ['Total botellas', totalBotellas]
        ]),
        {
          name: 'Stock final',
          columns: [
            { header: 'Código interno', key: 'codigo_interno', width: 18 },
            { header: 'Nombre', key: 'nombre', width: 36 },
            { header: 'Cajas', key: 'cajas', width: 14 },
            { header: 'Botellas', key: 'botellas', width: 14 }
          ],
          rows: [
            ...rows,
            {
              codigo_interno: '',
              nombre: 'TOTAL',
              cajas: totalCajas,
              botellas: totalBotellas
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

  /** Excel matriz: Código | Producto | columnas por sector (+ botellas si hay sueltas) | Totales. */
  app.get<{
    Params: { id: string }
    Querystring: { incluirCeros?: string; incluirSectoresNoContados?: string }
  }>(
    '/api/inventario/sesiones/:id/export-por-sectores',
    { preHandler: requirePermiso('inventario.ver') },
    async (req, reply) => {
      const db = getDb()
      const sesionId = Number(req.params.id)
      const incluirCeros = req.query.incluirCeros === '1'
      const incluirSectoresNoContados = req.query.incluirSectoresNoContados === '1'
      const sesion = getSesionOrThrow(db, sesionId)
      const sectoresSesion = getSectoresSesion(db, sesionId).map((s) => ({
        sector_id: Number(s.sector_id),
        sector_nombre: String(s.sector_nombre)
      }))

      let rawItems: StockPorSectorItem[] = []

      const reporte = db
        .prepare(`SELECT detalle FROM inventario_reportes WHERE sesion_id = ?`)
        .get(sesionId) as { detalle: string } | undefined

      if (reporte?.detalle) {
        const detalle = JSON.parse(reporte.detalle) as Array<Record<string, unknown>>
        rawItems = detalle.map((item) => ({
          producto_id: Number(item.producto_id),
          codigo_interno: String(item.codigo_interno ?? ''),
          nombre: String(item.nombre ?? ''),
          sector_id: Number(item.sector_id),
          sector_nombre: String(item.sector_nombre ?? ''),
          cajas: cantidadExportItem(item),
          botellas: sueltoExportItem(item)
        }))
      } else {
        try {
          const comparacion = compararVsSistema(db, sesionId)
          rawItems = comparacion.items.map((item) => ({
            producto_id: Number(item.producto_id),
            codigo_interno: String(item.codigo_interno ?? ''),
            nombre: String(item.nombre ?? ''),
            sector_id: Number(item.sector_id),
            sector_nombre: String(item.sector_nombre ?? ''),
            cajas: Number(item.total_contado ?? 0),
            botellas: Number(item.total_suelto_contado ?? 0)
          }))
        } catch (e) {
          return reply.status(400).send({
            error:
              (e as Error).message ||
              'El export por sectores requiere el inventario cerrado o todos los sectores OK'
          })
        }
      }

      const sectoresBase = [...sectoresSesion]
      if (incluirSectoresNoContados) {
        const extras = stockSistemaSectoresNoInventariados(
          db,
          sectoresSesion.map((s) => s.sector_id)
        )
        rawItems = [...rawItems, ...extras]
        const nombresExtras = new Map<number, string>()
        for (const item of extras) {
          nombresExtras.set(item.sector_id, item.sector_nombre)
        }
        for (const [sector_id, sector_nombre] of nombresExtras) {
          if (!sectoresBase.some((s) => s.sector_id === sector_id)) {
            sectoresBase.push({ sector_id, sector_nombre })
          }
        }
      }

      const { sectores, rows } = stockPorSectoresInventarioExport(
        rawItems,
        sectoresBase,
        incluirCeros
      )
      const totalCajas = rows.reduce((s, r) => s + (Number(r.total_cajas) || 0), 0)
      const totalBotellas = rows.reduce((s, r) => s + (Number(r.total_botellas) || 0), 0)

      const columns = [
        { header: 'Codigo', key: 'codigo_interno', width: 18 },
        { header: 'Descripcion', key: 'nombre', width: 36 },
        ...sectores.flatMap((sec) => {
          const width = Math.min(22, Math.max(12, sec.sector_nombre.length + 2))
          const base = [{ header: sec.sector_nombre, key: sec.key, width }]
          return sec.conBotellas
            ? [
                ...base,
                {
                  header: `${sec.sector_nombre} (botellas)`,
                  key: sec.keyBotellas,
                  width
                }
              ]
            : base
        }),
        { header: 'Total cajas', key: 'total_cajas', width: 14 },
        { header: 'Total botellas', key: 'total_botellas', width: 15 }
      ]

      const totalRow: Record<string, unknown> = {
        codigo_interno: '',
        nombre: 'TOTAL',
        total_cajas: totalCajas,
        total_botellas: totalBotellas
      }
      for (const sec of sectores) {
        totalRow[sec.key] = rows.reduce((s, r) => s + (Number(r[sec.key]) || 0), 0)
        if (sec.conBotellas) {
          totalRow[sec.keyBotellas] = rows.reduce(
            (s, r) => s + (Number(r[sec.keyBotellas]) || 0),
            0
          )
        }
      }

      const buffer = await buildMultiSheetExcel([
        resumenSheet('Resumen', [
          ['Nombre', String(sesion.nombre)],
          ['Estado', String(sesion.estado)],
          ['Creada', String(sesion.created_at)],
          ['Inicio', sesion.fecha_inicio as string | null],
          ['Cierre', sesion.fecha_cierre as string | null],
          ['Observación', sesion.observacion as string | null],
          ['Sectores', sectores.length],
          ['Productos', rows.length],
          ['Total cajas', totalCajas],
          ['Total botellas', totalBotellas],
          [
            'Incluye sectores no inventariados',
            incluirSectoresNoContados ? 'Sí' : 'No'
          ]
        ]),
        {
          name: 'Por sectores',
          columns,
          rows: [...rows, totalRow]
        }
      ])

      const safeName = String(sesion.nombre)
        .replace(/[^\w.\-() áéíóúÁÉÍÓÚñÑ]/g, '_')
        .trim()
        .slice(0, 40)
      return sendExcelFile(
        reply,
        buffer,
        `inventario-por-sectores-${safeName || sesionId}-${todayFileStamp()}.xlsx`
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
        const modoVerif = s.modo_verificacion === 'SIMPLE' ? 'SIMPLE' : 'DOBLE'
        if (!s.sector_id || !s.contador_1_id) {
          return reply.status(400).send({ error: 'Cada sector requiere al menos un contador' })
        }
        if (modoVerif === 'DOBLE') {
          if (!s.contador_2_id) {
            return reply.status(400).send({ error: 'Verificación doble: cada sector requiere dos contadores' })
          }
          if (s.contador_1_id === s.contador_2_id) {
            return reply.status(400).send({ error: 'Los dos contadores deben ser distintos' })
          }
        } else if (s.contador_2_id) {
          return reply.status(400).send({
            error: 'Verificación simple: no asignes un segundo contador'
          })
        }
        if (s.modo_conectividad && !['ONLINE', 'OFFLINE'].includes(s.modo_conectividad)) {
          return reply.status(400).send({ error: 'modo_conectividad inválido' })
        }
        if (s.modo_verificacion && !['DOBLE', 'SIMPLE'].includes(s.modo_verificacion)) {
          return reply.status(400).send({ error: 'modo_verificacion inválido' })
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
          INSERT INTO inventario_sectores (
            sesion_id, sector_id, contador_1_id, contador_2_id, modo_conectividad, modo_verificacion
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `)
        for (const s of sectores) {
          const modoVerif = s.modo_verificacion === 'SIMPLE' ? 'SIMPLE' : 'DOBLE'
          insertSec.run(
            sesionId,
            s.sector_id,
            s.contador_1_id,
            modoVerif === 'SIMPLE' ? null : s.contador_2_id,
            s.modo_conectividad === 'OFFLINE' ? 'OFFLINE' : 'ONLINE',
            modoVerif
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

  app.delete<{ Params: { id: string } }>(
    '/api/inventario/sesiones/:id',
    { preHandler: requirePermiso('inventario.crear_sesion') },
    async (req, reply) => {
      const db = getDb()
      const sesionId = Number(req.params.id)
      const sesion = getSesionOrThrow(db, sesionId)
      if (String(sesion.estado) !== 'CANCELADA') {
        return reply.status(400).send({
          error: 'Solo se pueden eliminar sesiones canceladas. Las cerradas quedan en el historial.'
        })
      }
      db.prepare(`DELETE FROM inventario_sesiones WHERE id = ?`).run(sesionId)
      return { ok: true }
    }
  )

  app.post<{ Params: { id: string }; Body: { password?: string } }>(
    '/api/inventario/sesiones/:id/archivar',
    { preHandler: requirePermiso('inventario.ver') },
    async (req, reply) => {
      const db = getDb()
      const userId = req.user!.id
      const auth = assertAdminPassword(db, userId, req.body?.password)
      if (!auth.ok) {
        return reply.status(auth.status).send({ error: auth.error })
      }

      const sesionId = Number(req.params.id)
      const sesion = getSesionOrThrow(db, sesionId)
      const estado = String(sesion.estado)
      if (!['CERRADA', 'CANCELADA'].includes(estado)) {
        return reply.status(400).send({
          error: 'Solo se pueden ocultar inventarios cerrados o cancelados'
        })
      }
      if (Number(sesion.archivada ?? 0) === 1) {
        return reply.status(400).send({ error: 'Este inventario ya está oculto del listado' })
      }

      db.prepare(
        `
        UPDATE inventario_sesiones
        SET archivada = 1, archivada_at = datetime('now'), archivada_por_id = ?
        WHERE id = ?
      `
      ).run(userId, sesionId)

      return { ok: true }
    }
  )

  app.post<{ Params: { id: string }; Body: { password?: string } }>(
    '/api/inventario/sesiones/:id/desarchivar',
    { preHandler: requirePermiso('inventario.ver') },
    async (req, reply) => {
      const db = getDb()
      const userId = req.user!.id
      const auth = assertAdminPassword(db, userId, req.body?.password)
      if (!auth.ok) {
        return reply.status(auth.status).send({ error: auth.error })
      }

      const sesionId = Number(req.params.id)
      const sesion = getSesionOrThrow(db, sesionId)
      if (Number(sesion.archivada ?? 0) !== 1) {
        return reply.status(400).send({ error: 'Este inventario no está archivado' })
      }

      db.prepare(
        `
        UPDATE inventario_sesiones
        SET archivada = 0, archivada_at = NULL, archivada_por_id = NULL
        WHERE id = ?
      `
      ).run(sesionId)

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
        LEFT JOIN usuarios u2 ON u2.id = isec.contador_2_id
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
          contador_2_id: s.contador_2_id == null ? null : Number(s.contador_2_id),
          contador_1_nombre: String(s.contador_1_nombre),
          contador_2_nombre: s.contador_2_nombre == null ? null : String(s.contador_2_nombre),
          contador_1_finalizo: Boolean(s.contador_1_finalizo),
          contador_2_finalizo: Boolean(s.contador_2_finalizo),
          soy_contador_1: Number(s.contador_1_id) === userId,
          modo_conectividad: String(s.modo_conectividad ?? 'ONLINE') === 'OFFLINE' ? 'OFFLINE' : 'ONLINE',
          modo_verificacion: String(s.modo_verificacion ?? 'DOBLE') === 'SIMPLE' ? 'SIMPLE' : 'DOBLE',
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
      const c2 = sector.contador_2_id == null ? null : Number(sector.contador_2_id)
      const simple = esVerificacionSimple(sector)

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
        !simple &&
        (canSupervise ||
          (Boolean(sector.contador_1_finalizo) &&
            Boolean(sector.contador_2_finalizo) &&
            ['CON_DIFERENCIAS', 'CERRADO_OK'].includes(String(sector.estado))))

      const mostrarLineasCompanero =
        !simple &&
        (canSupervise ||
          (Boolean(sector.contador_1_finalizo) && Boolean(sector.contador_2_finalizo)))

      let comparacion = null
      if (mostrarComparacion) {
        comparacion = compararContadores(db, inventarioSectorId, ronda)
      }

      const referencia_reconteo =
        !simple && ronda > 1 ? compararContadores(db, inventarioSectorId, ronda - 1) : null

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
          contador_1_nombre: String(sector.contador_1_nombre ?? ''),
          contador_2_nombre: sector.contador_2_nombre == null ? null : String(sector.contador_2_nombre),
          contador_1_finalizo: Boolean(sector.contador_1_finalizo),
          contador_2_finalizo: Boolean(sector.contador_2_finalizo),
          usa_ubicaciones,
          modo_conectividad: String(sector.modo_conectividad ?? 'ONLINE') === 'OFFLINE' ? 'OFFLINE' : 'ONLINE',
          modo_verificacion: simple ? 'SIMPLE' : 'DOBLE',
          paquete_descargado_at: (sector.paquete_descargado_at as string | null) ?? null,
          importado_at: (sector.importado_at as string | null) ?? null
        },
        ubicaciones,
        mi_rol: rol,
        mis_lineas: rol ? mapLineas(rol === 1 ? c1 : (c2 as number)) : [],
        lineas_contador_1: mostrarLineasCompanero || canSupervise ? mapLineas(c1) : undefined,
        lineas_contador_2:
          c2 != null && (mostrarLineasCompanero || canSupervise) ? mapLineas(c2) : undefined,
        comparacion,
        referencia_reconteo
      }
    }
  )

  app.get<{ Params: { id: string } }>(
    '/api/inventario/sectores/:id/conteo-final',
    { preHandler: requirePermisoAny('inventario.ver', 'inventario.supervisar', 'inventario.cerrar') },
    async (req, reply) => {
      const db = getDb()
      try {
        return getConteoFinalSector(db, Number(req.params.id))
      } catch (e) {
        return reply.status(400).send({ error: (e as Error).message })
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

          if (body.tipo_bulto === 'CAJA') {
            rememberUnidadesPorCajaDefault(db, body.producto_id, body.unidades_por_bulto)
          }

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

        if (body.tipo_bulto === 'CAJA') {
          rememberUnidadesPorCajaDefault(db, productoId, body.unidades_por_bulto)
        }

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

        if (esVerificacionSimple(sector)) {
          if (rol !== 1) {
            return reply.status(403).send({ error: 'Solo el contador asignado puede finalizar' })
          }
          cerrarSectorSinComparacionPares(db, inventarioSectorId)
          return { ok: true, comparacion: null, modo_verificacion: 'SIMPLE' }
        }

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

  app.post<{ Params: { id: string } }>(
    '/api/inventario/sesiones/:id/reparar-cierre',
    { preHandler: requirePermiso('inventario.cerrar', 'ajustes.crear') },
    async (req, reply) => {
      const db = getDb()
      const sesionId = Number(req.params.id)
      try {
        return repararStockInventarioCerrado(db, sesionId, req.user!.id)
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
