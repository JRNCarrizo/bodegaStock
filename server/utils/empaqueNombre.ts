/**
 * Extrae botellas por caja desde el nombre del producto.
 * Formato típico Bodegas Esmeralda: "... 3X750", "6x750", "12 X 375".
 * El primer número es la cantidad de botellas; el segundo suele ser ml.
 */
export function parseBotellasPorCajaFromNombre(nombre: string | null | undefined): number | null {
  const text = String(nombre ?? '').trim()
  if (!text) return null

  const re = /(\d{1,2})\s*[xX×]\s*(\d{2,5})\b/g
  let match: RegExpExecArray | null
  let last: { botellas: number; ml: number } | null = null

  while ((match = re.exec(text)) != null) {
    const botellas = Number(match[1])
    const ml = Number(match[2])
    if (!Number.isInteger(botellas) || !Number.isInteger(ml)) continue
    if (botellas < 1 || botellas > 48) continue
    if (ml < 100) continue
    last = { botellas, ml }
  }

  return last?.botellas ?? null
}

/** Si hay valor explícito válido lo usa; si no, intenta extraerlo del nombre. */
export function resolveUnidadesPorCajaDefault(
  nombre: string | null | undefined,
  explicit?: number | null
): number | null {
  const n = Number(explicit)
  if (Number.isFinite(n) && n > 0 && Number.isInteger(n)) return n
  return parseBotellasPorCajaFromNombre(nombre)
}

/**
 * Completa unidades_por_caja_default desde el nombre cuando está vacío
 * o quedó en el 6 genérico de importaciones viejas.
 */
export function syncUnidadesPorCajaFromNombres(db: {
  prepare: (sql: string) => {
    all: (...params: unknown[]) => unknown[]
    run: (...params: unknown[]) => unknown
  }
}): number {
  const rows = db
    .prepare(
      `
      SELECT id, nombre, unidades_por_caja_default
      FROM productos
    `
    )
    .all() as Array<{
    id: number
    nombre: string
    unidades_por_caja_default: number | null
  }>

  const update = db.prepare(`
    UPDATE productos
    SET unidades_por_caja_default = ?, updated_at = datetime('now')
    WHERE id = ?
  `)

  let updated = 0
  for (const row of rows) {
    const parsed = parseBotellasPorCajaFromNombre(row.nombre)
    if (parsed == null) continue

    const current = row.unidades_por_caja_default
    const shouldSet =
      current == null ||
      !Number.isFinite(Number(current)) ||
      Number(current) <= 0 ||
      Number(current) === 6 ||
      Number(current) === parsed

    if (!shouldSet) continue
    if (Number(current) === parsed) continue

    update.run(parsed, row.id)
    updated += 1
  }

  return updated
}
