import type { FastifyInstance } from 'fastify'
import { createReadStream } from 'fs'
import { getDb } from '../db'
import { requirePermiso } from '../plugins/auth'
import {
  deleteProductImage,
  extFromFilename,
  getProductImagePath,
  saveProductImage
} from '../utils/files'

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
    preHandler: requirePermiso('productos.ver')
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
