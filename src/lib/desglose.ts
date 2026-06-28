export type TipoBulto = 'PALLET' | 'CAJA' | 'SUELTO'
export type ModoSalidaPlanilla = 'CAJA' | 'BOTELLA'

/** Unidad mínima del producto (botella, etc.) */
export function normalizarUnidadProducto(unidad?: string | null): string {
  const u = (unidad ?? '').trim().toLowerCase()
  if (!u || u === 'unidad') return 'botella'
  return u
}

export function etiquetaUnidadProducto(unidad?: string | null): string {
  const n = normalizarUnidadProducto(unidad)
  return n.charAt(0).toUpperCase() + n.slice(1)
}

export function botellasPorCajaDefault(unidadesPorCajaDefault?: number | null): number {
  return unidadesPorCajaDefault && unidadesPorCajaDefault > 0 ? unidadesPorCajaDefault : 6
}

export function cajasPorPalletDefault(unidadesPorPalletDefault?: number | null): number {
  return unidadesPorPalletDefault && unidadesPorPalletDefault > 0 ? unidadesPorPalletDefault : 112
}

export function formatCantidadUnidad(cantidad: number | string, unidad?: string | null): string {
  const n = Number(cantidad)
  const nombre = normalizarUnidadProducto(unidad)
  return `${n} ${nombre}`
}

export function calcTotalUnidades(linea: {
  tipo_bulto: TipoBulto
  cantidad_bultos?: number | string
  unidades_por_bulto?: number | string
  cantidad_suelta?: number | string
}): number {
  if (linea.tipo_bulto === 'SUELTO') {
    return Number(linea.cantidad_suelta ?? 0)
  }
  return Number(linea.cantidad_bultos ?? 0) * Number(linea.unidades_por_bulto ?? 0)
}

/** Total en cajas para conteos finales (ingresos, consulta, stock). Botellerio = 1 caja. */
export function calcTotalEnCajas(
  linea: {
    tipo_bulto: TipoBulto
    cantidad_bultos?: number | string | null
    unidades_por_bulto?: number | string | null
    cantidad_suelta?: number | string | null
  },
  botellasPorCaja = 6
): number {
  if (linea.tipo_bulto === 'PALLET') {
    return Number(linea.cantidad_bultos ?? 0) * Number(linea.unidades_por_bulto ?? 0)
  }
  if (linea.tipo_bulto === 'CAJA') {
    const b = Number(linea.cantidad_bultos ?? 0)
    const u = Number(linea.unidades_por_bulto ?? 0)
    if (b === 1 && u > 0 && u < botellasPorCaja) return 1
    return b
  }
  if (linea.tipo_bulto === 'SUELTO') {
    const suelto = Number(linea.cantidad_suelta ?? 0)
    return suelto > 0 ? 1 : 0
  }
  return 0
}

/** Total en cajas desde línea persistida (stock / ingreso guardado). */
export function lineaTotalEnCajas(
  linea: {
    tipo_bulto: TipoBulto | string
    cantidad_bultos?: number | null
    unidades_por_bulto?: number | null
    total_unidades?: number
    cantidad_suelta?: number | null
  },
  botellasPorCaja: number
): number {
  const u = Number(linea.unidades_por_bulto ?? 0)
  if (linea.tipo_bulto === 'PALLET') {
    return Number(linea.total_unidades ?? 0)
  }
  if (linea.tipo_bulto === 'CAJA') {
    if (linea.cantidad_bultos === 1 && u > 0 && u < botellasPorCaja) {
      return 1
    }
    if (Number(linea.cantidad_bultos ?? 0) > 0) {
      return Number(linea.cantidad_bultos ?? 0)
    }
  }
  if (linea.tipo_bulto === 'SUELTO') {
    return Number(linea.cantidad_suelta ?? linea.total_unidades ?? 0) > 0 ? 1 : 0
  }
  return 0
}

export function formatCantidad(cantidad: number | string): string {
  const n = Math.round(Number(cantidad) * 1000) / 1000
  return Number.isInteger(n) ? String(n) : String(n)
}

export function formatTotalCajas(cantidad: number): string {
  return `${cantidad} caja${cantidad === 1 ? '' : 's'}`
}

export function formatPlanillaEtiqueta(
  modo: ModoSalidaPlanilla,
  cantidad: number,
  unidadProducto?: string | null
): string {
  if (modo === 'CAJA') {
    return `${cantidad} caja${cantidad === 1 ? '' : 's'}`
  }
  const unidad = normalizarUnidadProducto(unidadProducto)
  return `${cantidad} ${unidad}${cantidad === 1 ? '' : 's'}`
}
export function formatEtiqueta(
  linea: {
    tipo_bulto: TipoBulto
    cantidad_bultos?: number | string
    unidades_por_bulto?: number | string
    cantidad_suelta?: number | string
  },
  unidadProducto?: string | null
): string {
  const unidad = normalizarUnidadProducto(unidadProducto)
  const bultos = Number(linea.cantidad_bultos ?? 0)
  const porBulto = Number(linea.unidades_por_bulto ?? 0)

  if (linea.tipo_bulto === 'PALLET') {
    return `${bultos} pallet × ${porBulto} cajas`
  }
  if (linea.tipo_bulto === 'CAJA') {
    return `${bultos} caja × ${porBulto} ${unidad}`
  }
  if (linea.tipo_bulto === 'SUELTO') {
    return formatCantidadUnidad(linea.cantidad_suelta ?? 0, unidadProducto)
  }
  return `${bultos} × ${porBulto}`
}

export function todayIsoDate(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addIsoDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + days)
  const ny = date.getFullYear()
  const nm = String(date.getMonth() + 1).padStart(2, '0')
  const nd = String(date.getDate()).padStart(2, '0')
  return `${ny}-${nm}-${nd}`
}

export function formatPeriodoFechas(desde: string, hasta: string): string {
  if (desde === hasta) return formatDayTabLabel(desde)
  return `${formatDayTabLabel(desde)} – ${formatDayTabLabel(hasta)}`
}

export function formatDayTabLabel(isoDate: string): string {
  const today = todayIsoDate()
  if (isoDate === today) return 'Hoy'
  if (isoDate === addIsoDays(today, -1)) return 'Ayer'
  const [year, month, day] = isoDate.split('-')
  if (year !== today.slice(0, 4)) return `${day}/${month}/${year}`
  return `${day}/${month}`
}
