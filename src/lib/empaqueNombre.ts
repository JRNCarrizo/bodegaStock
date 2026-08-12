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
