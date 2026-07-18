import type { FastifyInstance } from 'fastify'
import { createReadStream } from 'fs'
import { getDb } from '../db'
import { requirePermiso, requirePermisoAny } from '../plugins/auth'
import {
  deleteProductImage,
  extFromFilename,
  getProductImagePath,
  saveProductImage
} from '../utils/files'
import {
  buildExcelBuffer,
  loadWorkbookFromBase64,
  readSheetAsObjects,
  sendExcelFile
} from '../utils/excel-export'

interface ProductoBody {
  codigo_interno?: string
  codigo_barras?: string | null
  nombre?: string
  descripcion?: string | null
  unidad?: string
  unidades_por_pallet_default?: number | null
  unidades_por_caja_default?: number | null
  activo?: boolean
  imagen_base64?: string | null
  imagen_mime?: string | null
  eliminar_imagen?: boolean
}

function generateCodigoInterno(db: ReturnType<typeof getDb>): string {
  const row = db.prepare('SELECT MAX(id) as maxId FROM productos').get() as { maxId: number | null }
  const next = (row.maxId ?? 0) + 1
  return `PRD-${String(next).padStart(6, '0')}`
}

function generateCodigoBarras(): string {
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
  return `BOD${Date.now().toString().slice(-9)}${random}`
}

function mimeFromExt(ext: string): string {
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  return 'image/jpeg'
}

export async function productosRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/productos', {
    preHandler: requirePermisoAny('productos.ver', 'inventario.contar')
  }, async (request) => {
    const { q, activo } = request.query as { q?: string; activo?: string }
    const db = getDb()

    let sql = `
      SELECT id, codigo_interno, codigo_barras, nombre, descripcion, imagen_path,
             unidad, unidades_por_pallet_default, unidades_por_caja_default,
             activo, created_at, updated_at
      FROM productos
      WHERE 1=1
    `
    const params: unknown[] = []

    if (activo === '1') {
      sql += ' AND activo = 1'
    } else if (activo === '0') {
      sql += ' AND activo = 0'
    }

    if (q?.trim()) {
      sql += ` AND (
        codigo_interno LIKE ? OR
        codigo_barras LIKE ? OR
        nombre LIKE ?
      )`
      const term = `%${q.trim()}%`
      params.push(term, term, term)
    }

    sql += ' ORDER BY nombre COLLATE NOCASE ASC'

    return db.prepare(sql).all(...params)
  })

  app.get('/api/productos/generar-codigos', {
    preHandler: requirePermiso('productos.crear')
  }, async () => {
    const db = getDb()
    return {
      codigo_interno: generateCodigoInterno(db),
      codigo_barras: generateCodigoBarras()
    }
  })

  app.get('/api/productos/plantilla', {
    preHandler: requirePermiso('productos.crear')
  }, async (_request, reply) => {
    const buffer = await buildExcelBuffer(
      'Productos',
      [
        { header: 'Código interno', key: 'codigo_interno', width: 18 },
        { header: 'Nombre', key: 'nombre', width: 36 },
        { header: 'Descripción', key: 'descripcion', width: 40 }
      ],
      [
        {
          codigo_interno: 'EJ-001',
          nombre: 'Producto de ejemplo',
          descripcion: 'Opcional — podés dejarla vacía'
        }
      ]
    )
    return sendExcelFile(reply, buffer, 'plantilla-productos.xlsx')
  })

  app.post('/api/productos/import', {
    preHandler: requirePermiso('productos.crear')
  }, async (request, reply) => {
    const body = request.body as { file_base64?: string }
    if (!body.file_base64?.trim()) {
      return reply.status(400).send({ error: 'Subí un archivo Excel (.xlsx)' })
    }

    let workbook
    try {
      workbook = await loadWorkbookFromBase64(body.file_base64)
    } catch {
      return reply.status(400).send({ error: 'No se pudo leer el Excel. Usá la plantilla .xlsx' })
    }

    const { rows, errors: parseErrors } = readSheetAsObjects(workbook, {
      codigo_interno: ['codigo_interno', 'codigo', 'cod_interno', 'codigointerno'],
      nombre: ['nombre', 'producto', 'name'],
      descripcion: ['descripcion', 'description', 'desc', 'detalle']
    })

    if (parseErrors.length) {
      return reply.status(400).send({ error: parseErrors.join('. ') })
    }
    if (rows.length === 0) {
      return reply.status(400).send({ error: 'El Excel no tiene filas de productos para importar' })
    }

    const db = getDb()
    const existsStmt = db.prepare(`
      SELECT id FROM productos WHERE codigo_interno = ? COLLATE NOCASE
    `)
    const insertStmt = db.prepare(`
      INSERT INTO productos (
        codigo_interno, codigo_barras, nombre, descripcion, unidad,
        unidades_por_pallet_default, unidades_por_caja_default, activo
      ) VALUES (?, NULL, ?, ?, 'botella', 112, 6, 1)
    `)

    const detalle: Array<{ fila: number; codigo_interno: string; estado: string; motivo?: string }> =
      []
    let creados = 0
    let omitidos = 0

    const seen = new Set<string>()

    const run = db.transaction(() => {
      for (const row of rows) {
        const fila = Number(row.__fila) || 0
        const codigo = (row.codigo_interno ?? '').trim()
        const nombre = (row.nombre ?? '').trim()
        const descripcion = (row.descripcion ?? '').trim() || null
        const codigoKey = codigo.toLowerCase()

        if (!codigo || !nombre) {
          omitidos += 1
          detalle.push({
            fila,
            codigo_interno: codigo || '—',
            estado: 'omitido',
            motivo: !codigo ? 'Falta código interno' : 'Falta nombre'
          })
          continue
        }

        if (seen.has(codigoKey)) {
          omitidos += 1
          detalle.push({
            fila,
            codigo_interno: codigo,
            estado: 'omitido',
            motivo: 'Código duplicado en el mismo Excel'
          })
          continue
        }
        seen.add(codigoKey)

        if (existsStmt.get(codigo)) {
          omitidos += 1
          detalle.push({
            fila,
            codigo_interno: codigo,
            estado: 'omitido',
            motivo: 'Ya existe en el catálogo'
          })
          continue
        }

        try {
          insertStmt.run(codigo, nombre, descripcion)
          creados += 1
          detalle.push({ fila, codigo_interno: codigo, estado: 'creado' })
        } catch (err) {
          omitidos += 1
          const msg =
            err instanceof Error && err.message.includes('UNIQUE')
              ? 'Código interno o de barras ya existe'
              : 'Error al guardar'
          detalle.push({ fila, codigo_interno: codigo, estado: 'omitido', motivo: msg })
        }
      }
    })

    try {
      run()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al importar'
      return reply.status(400).send({ error: msg })
    }

    return {
      total_filas: rows.length,
      creados,
      omitidos,
      detalle
    }
  })

  app.get('/api/productos/:id/imagen', {
    preHandler: requirePermiso('productos.ver')
  }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id)
    const db = getDb()
    const producto = db.prepare('SELECT imagen_path FROM productos WHERE id = ?').get(id) as
      | { imagen_path: string | null }
      | undefined

    if (!producto?.imagen_path) {
      return reply.status(404).send({ error: 'Sin imagen' })
    }

    const filepath = getProductImagePath(producto.imagen_path)
    if (!filepath) return reply.status(404).send({ error: 'Archivo no encontrado' })

    const ext = extFromFilename(producto.imagen_path)
    reply.header('Content-Type', mimeFromExt(ext))
    return reply.send(createReadStream(filepath))
  })

  app.get('/api/productos/:id', {
    preHandler: requirePermiso('productos.ver')
  }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id)
    const db = getDb()
    const producto = db.prepare(`
      SELECT id, codigo_interno, codigo_barras, nombre, descripcion, imagen_path,
             unidad, unidades_por_pallet_default, unidades_por_caja_default,
             activo, created_at, updated_at
      FROM productos WHERE id = ?
    `).get(id)

    if (!producto) return reply.status(404).send({ error: 'Producto no encontrado' })
    return producto
  })

  app.post('/api/productos', {
    preHandler: requirePermiso('productos.crear')
  }, async (request, reply) => {
    const body = request.body as ProductoBody

    if (!body.codigo_interno?.trim() || !body.nombre?.trim()) {
      return reply.status(400).send({ error: 'Código interno y nombre son requeridos' })
    }

    const db = getDb()

    try {
      const result = db.prepare(`
        INSERT INTO productos (
          codigo_interno, codigo_barras, nombre, descripcion, unidad,
          unidades_por_pallet_default, unidades_por_caja_default, activo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        body.codigo_interno.trim(),
        body.codigo_barras?.trim() || null,
        body.nombre.trim(),
        body.descripcion?.trim() || null,
        body.unidad?.trim() || 'unidad',
        body.unidades_por_pallet_default ?? null,
        body.unidades_por_caja_default ?? null,
        body.activo === false ? 0 : 1
      )

      const id = Number(result.lastInsertRowid)
      let imagen_path: string | null = null

      if (body.imagen_base64) {
        imagen_path = saveProductImage(id, body.imagen_base64, body.imagen_mime ?? undefined)
        db.prepare('UPDATE productos SET imagen_path = ?, updated_at = datetime(\'now\') WHERE id = ?')
          .run(imagen_path, id)
      }

      return { id, imagen_path }
    } catch (err: unknown) {
      const message = err instanceof Error && err.message.includes('UNIQUE')
        ? 'Código interno o de barras ya existe'
        : 'Error al crear producto'
      return reply.status(409).send({ error: message })
    }
  })

  app.put('/api/productos/:id', {
    preHandler: requirePermiso('productos.editar')
  }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id)
    const body = request.body as ProductoBody
    const db = getDb()

    const existing = db.prepare('SELECT id, imagen_path FROM productos WHERE id = ?').get(id) as
      | { id: number; imagen_path: string | null }
      | undefined

    if (!existing) return reply.status(404).send({ error: 'Producto no encontrado' })

    try {
      db.prepare(`
        UPDATE productos SET
          codigo_interno = COALESCE(?, codigo_interno),
          codigo_barras = ?,
          nombre = COALESCE(?, nombre),
          descripcion = ?,
          unidad = COALESCE(?, unidad),
          unidades_por_pallet_default = ?,
          unidades_por_caja_default = ?,
          activo = COALESCE(?, activo),
          updated_at = datetime('now')
        WHERE id = ?
      `).run(
        body.codigo_interno?.trim() ?? null,
        body.codigo_barras?.trim() || null,
        body.nombre?.trim() ?? null,
        body.descripcion?.trim() ?? null,
        body.unidad?.trim() ?? null,
        body.unidades_por_pallet_default ?? null,
        body.unidades_por_caja_default ?? null,
        body.activo === undefined ? null : body.activo ? 1 : 0,
        id
      )

      if (body.eliminar_imagen) {
        deleteProductImage(existing.imagen_path)
        db.prepare('UPDATE productos SET imagen_path = NULL WHERE id = ?').run(id)
      } else if (body.imagen_base64) {
        deleteProductImage(existing.imagen_path)
        const imagen_path = saveProductImage(id, body.imagen_base64, body.imagen_mime ?? undefined)
        db.prepare('UPDATE productos SET imagen_path = ? WHERE id = ?').run(imagen_path, id)
      }

      return { ok: true }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al actualizar producto'
      if (message.includes('UNIQUE')) {
        return reply.status(409).send({ error: 'Código interno o de barras ya existe' })
      }
      return reply.status(500).send({ error: message })
    }
  })
}
