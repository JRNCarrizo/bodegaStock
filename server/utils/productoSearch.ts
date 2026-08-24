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

/**
 * ORDER BY por relevancia: 420 → primero 420-23, después 4201-nv.
 */
export function sqlProductoSearchOrderClause(
  q: string,
  opts?: { prefix?: string }
): { sql: string; params: string[] } {
  const raw = q.trim()
  const prefix = opts?.prefix ?? ''
  const codigoCol = `${prefix}codigo_interno`
  const nombreCol = `${prefix}nombre`
  const qLower = raw.toLowerCase()
  const qNorm = normalizeCodigoBusquedaSql(raw)
  const normExpr = sqlNormalizeCodigoExpr(codigoCol)

  const params = [
    qLower,
    `${qLower}-%`,
    `${qLower}_%`,
    `${qLower}.%`,
    `${qLower}%`,
    `%${qLower}%`,
    `%${qNorm}%`,
    `%${qLower}%`
  ]

  const sql = `
    CASE
      WHEN LOWER(${codigoCol}) = ? THEN 0
      WHEN LOWER(${codigoCol}) LIKE ? THEN 10
      WHEN LOWER(${codigoCol}) LIKE ? THEN 10
      WHEN LOWER(${codigoCol}) LIKE ? THEN 10
      WHEN LOWER(${codigoCol}) LIKE ? THEN 30
      WHEN LOWER(${codigoCol}) LIKE ? THEN 40
      WHEN ${normExpr} LIKE ? THEN 42
      WHEN LOWER(${nombreCol}) LIKE ? THEN 60
      ELSE 99
    END ASC,
    ${codigoCol} COLLATE NOCASE ASC,
    ${nombreCol} COLLATE NOCASE ASC
  `.trim()

  return { sql, params }
}
