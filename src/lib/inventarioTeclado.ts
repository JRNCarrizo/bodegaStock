const KEY = 'inventario.teclado_numerico_busqueda'

/** Preferencia local: teclado numérico/tel en el buscador de productos del conteo. */
export function loadTecladoNumericoBusqueda(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function saveTecladoNumericoBusqueda(enabled: boolean): void {
  try {
    localStorage.setItem(KEY, enabled ? '1' : '0')
  } catch {
    // ignore quota / private mode
  }
}
