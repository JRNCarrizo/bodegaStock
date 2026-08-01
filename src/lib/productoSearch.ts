/**
 * Búsqueda flexible de códigos de producto.
 * Ej.: 330-24 ≈ "330 24" ≈ "33024" (cosecha / código interno).
 */

/** Quita espacios, guiones y separadores similares para comparar códigos. */
export function normalizeCodigoBusqueda(value: string): string {
  return value.trim().toLowerCase().replace(/[\s\-_.]+/g, '')
}

export function textoProductoMatches(
  fields: {
    codigo_interno?: string | null
    codigo_barras?: string | null
    nombre?: string | null
  },
  query: string
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true

  const codigo = (fields.codigo_interno ?? '').toLowerCase()
  const barras = (fields.codigo_barras ?? '').toLowerCase()
  const nombre = (fields.nombre ?? '').toLowerCase()

  if (nombre.includes(q) || codigo.includes(q) || barras.includes(q)) return true

  const qNorm = normalizeCodigoBusqueda(q)
  if (qNorm.length === 0) return false
  if (normalizeCodigoBusqueda(codigo).includes(qNorm)) return true
  if (barras && normalizeCodigoBusqueda(barras).includes(qNorm)) return true
  return false
}

/** Match exacto de código / barras (Enter para elegir en el buscador). */
export function codigoProductoExacto(
  codigo_interno: string | null | undefined,
  codigo_barras: string | null | undefined,
  term: string
): boolean {
  const t = term.trim().toLowerCase()
  if (!t) return false
  const codigo = (codigo_interno ?? '').toLowerCase()
  const barras = (codigo_barras ?? '').toLowerCase()
  if (codigo === t || barras === t) return true
  const tNorm = normalizeCodigoBusqueda(t)
  if (!tNorm) return false
  return (
    normalizeCodigoBusqueda(codigo) === tNorm ||
    (barras.length > 0 && normalizeCodigoBusqueda(barras) === tNorm)
  )
}
