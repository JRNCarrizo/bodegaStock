/** Delay de búsqueda tipado: código/barras casi al instante; texto un poco más. */
export function searchDelayMs(query: string): number {
  const q = query.trim()
  if (!q) return 0
  // Sin espacios: suele ser código interno, barras, nº remito/planilla
  if (!/\s/.test(q)) return 40
  return 90
}
