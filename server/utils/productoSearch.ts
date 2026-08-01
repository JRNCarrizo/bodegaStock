/**
 * Búsqueda flexible de códigos (330-24 ≈ "330 24" ≈ "33024") para SQL SQLite.
 */

export function normalizeCodigoBusquedaSql(value: string): string {
  return value.trim().toLowerCase().replace(/[\s\-_.]+/g, '')
}

/** Expresión SQL que quita separadores de un código. */
export function sqlNormalizeCodigoExpr(columnSql: string): string {
  return `REPLACE(REPLACE(REPLACE(LOWER(${columnSql}), '-', ''), ' ', ''), '_', '')`
}

/**
 * Condición AND para buscar producto por código (flexible), barras y nombre.
 * Prefijo tipico: `p.` o vacío.
 */
export function sqlProductoSearchClause(
  q: string,
  opts?: { prefix?: string; includeBarras?: boolean }
): { sql: string; params: string[] } | null {
  const raw = q.trim()
  if (!raw) return null

  const prefix = opts?.prefix ?? ''
  const includeBarras = opts?.includeBarras !== false
  const codigoCol = `${prefix}codigo_interno`
  const barrasCol = `${prefix}codigo_barras`
  const nombreCol = `${prefix}nombre`

  const term = `%${raw}%`
  const norm = `%${normalizeCodigoBusquedaSql(raw)}%`
  const params: string[] = [term]
  let sql = `(
    ${codigoCol} LIKE ?
    OR ${nombreCol} LIKE ?
  `

  params.push(term)

  if (includeBarras) {
    sql += ` OR ${barrasCol} LIKE ?`
    params.push(term)
  }

  sql += ` OR ${sqlNormalizeCodigoExpr(codigoCol)} LIKE ?`
  params.push(norm)

  if (includeBarras) {
    sql += ` OR ${sqlNormalizeCodigoExpr(`COALESCE(${barrasCol}, '')`)} LIKE ?`
    params.push(norm)
  }

  sql += ')'
  return { sql, params }
}
