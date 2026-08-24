/**
 * Búsqueda flexible de códigos de producto.
 * Ej.: 330-24 ≈ "330 24" ≈ "33024" (cosecha / código interno).
 */

export type ProductoSearchFields = {
  codigo_interno?: string | null
  codigo_barras?: string | null
  nombre?: string | null
}

/** Quita espacios, guiones y separadores similares para comparar códigos. */
export function normalizeCodigoBusqueda(value: string): string {
  return value.trim().toLowerCase().replace(/[\s\-_.]+/g, '')
}

function codigoConCosechaTrasPrefijo(codigo: string, q: string): boolean {
  if (codigo === q) return true
  if (codigo.startsWith(`${q}-`) || codigo.startsWith(`${q}_`) || codigo.startsWith(`${q}.`)) {
    return true
  }
  return false
}

/**
 * Menor = más relevante.
 * Prioriza código base + cosecha (420 → 420-23) antes que prefijos ampliados (4201-nv).
 */
export function productoSearchRelevanceScore(fields: ProductoSearchFields, query: string): number {
  const q = query.trim().toLowerCase()
  if (!q) return 0

  const codigo = (fields.codigo_interno ?? '').toLowerCase()
  const barras = (fields.codigo_barras ?? '').toLowerCase()
  const nombre = (fields.nombre ?? '').toLowerCase()
  const qNorm = normalizeCodigoBusqueda(q)
  const cNorm = normalizeCodigoBusqueda(codigo)
  const bNorm = barras ? normalizeCodigoBusqueda(barras) : ''

  if (codigo === q || (barras && barras === q)) return 0
  if (qNorm && (cNorm === qNorm || bNorm === qNorm)) return 1

  if (codigoConCosechaTrasPrefijo(codigo, q)) return 10

  if (codigo.startsWith(q)) return 30
  if (barras.startsWith(q)) return 32

  if (codigo.includes(q)) return 40
  if (qNorm && cNorm.includes(qNorm)) return 42
  if (barras.includes(q)) return 44
  if (qNorm && bNorm.includes(qNorm)) return 45

  if (nombre.startsWith(q)) return 50
  if (nombre.includes(q)) return 60

  return 99
}

export function compareProductoSearchRelevance(
  a: ProductoSearchFields,
  b: ProductoSearchFields,
  query: string
): number {
  const sa = productoSearchRelevanceScore(a, query)
  const sb = productoSearchRelevanceScore(b, query)
  if (sa !== sb) return sa - sb
  return (a.codigo_interno ?? '').localeCompare(b.codigo_interno ?? '', 'es', {
    sensitivity: 'base'
  })
}

export function sortProductosBySearchRelevance<T extends ProductoSearchFields>(
  items: T[],
  query: string
): T[] {
  const q = query.trim()
  if (!q) return items
  return [...items].sort((a, b) => compareProductoSearchRelevance(a, b, q))
}

export function textoProductoMatches(fields: ProductoSearchFields, query: string): boolean {
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

export function filterProductosBySearchQuery<T extends ProductoSearchFields>(
  items: T[],
  query: string
): T[] {
  const q = query.trim()
  if (!q) return items
  return sortProductosBySearchRelevance(
    items.filter((item) => textoProductoMatches(item, q)),
    q
  )
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
