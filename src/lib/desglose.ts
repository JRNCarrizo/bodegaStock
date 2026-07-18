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

export function calcTotalInventarioLinea(
  linea: {
    tipo_bulto: TipoBulto
    cantidad_bultos?: number | string | null
    unidades_por_bulto?: number | string | null
    cantidad_suelta?: number | string | null
  },
  botellasPorCaja = 6
): number {
  return calcTotalEnCajas(linea, botellasPorCaja)
}

/** Total para conteo de inventario: cajas/pallets en bultos; suelto en unidades. */
export function calcTotalConteoInventarioLinea(
  linea: {
    tipo_bulto: TipoBulto
    cantidad_bultos?: number | string | null
    unidades_por_bulto?: number | string | null
    cantidad_suelta?: number | string | null
  },
  botellasPorCaja = 6
): number {
  if (linea.tipo_bulto === 'SUELTO') {
    return calcTotalUnidades(linea)
  }
  return calcTotalInventarioLinea(linea, botellasPorCaja)
}

export interface TotalesInventarioDesglose {
  cajas: number
  suelto: number
}

export function totalSueltoLineaConteo(linea: {
  tipo_bulto: TipoBulto
  cantidad_bultos?: number | string | null
  unidades_por_bulto?: number | string | null
  cantidad_suelta?: number | string | null
}): number {
  if (linea.tipo_bulto === 'SUELTO') {
    return calcTotalUnidades(linea)
  }
  if (linea.tipo_bulto === 'CAJA') {
    return Number(linea.cantidad_suelta ?? 0)
  }
  return 0
}

export function totalCajasLineaConteo(
  linea: {
    tipo_bulto: TipoBulto
    cantidad_bultos?: number | string | null
    unidades_por_bulto?: number | string | null
    cantidad_suelta?: number | string | null
  },
  botellasPorCaja = 6
): number {
  if (linea.tipo_bulto === 'SUELTO') return 0
  return calcTotalInventarioLinea(linea, botellasPorCaja)
}

export function sumarTotalesInventarioLineas(
  lineas: Array<{
    tipo_bulto: TipoBulto
    cantidad_bultos?: number | string | null
    unidades_por_bulto?: number | string | null
    cantidad_suelta?: number | string | null
  }>,
  botellasPorCaja = 6
): TotalesInventarioDesglose {
  return lineas.reduce(
    (acc, linea) => ({
      cajas: acc.cajas + totalCajasLineaConteo(linea, botellasPorCaja),
      suelto: acc.suelto + totalSueltoLineaConteo(linea)
    }),
    { cajas: 0, suelto: 0 }
  )
}

export function formatTotalesInventarioResumen(
  t: TotalesInventarioDesglose,
  unidadProducto?: string | null
): string {
  const parts: string[] = []
  if (t.cajas > 0) {
    parts.push(`${formatCantidad(t.cajas)}`)
  }
  if (t.suelto > 0) {
    const u = normalizarUnidadProducto(unidadProducto)
    parts.push(`${formatCantidad(t.suelto)} ${u}${t.suelto === 1 ? '' : 's'}`)
  }
  return parts.length > 0 ? parts.join(' · ') : '0'
}

export function totalesInventarioCoinciden(
  a: TotalesInventarioDesglose,
  b: TotalesInventarioDesglose
): boolean {
  return Math.abs(a.cajas - b.cajas) < 0.0001 && Math.abs(a.suelto - b.suelto) < 0.0001
}

export function formatValorLineaConteo(
  linea: {
    tipo_bulto: TipoBulto | string
    total_cajas?: number
    total_suelto?: number
    total_unidades?: number
  },
  unidadProducto?: string | null
): string {
  if (linea.tipo_bulto === 'SUELTO') {
    const n = linea.total_suelto ?? linea.total_unidades ?? 0
    const u = normalizarUnidadProducto(unidadProducto)
    return `${formatCantidad(n)} ${u}${n === 1 ? '' : 's'}`
  }
  const n = linea.total_cajas ?? linea.total_unidades ?? 0
  return `${formatCantidad(n)}`
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

/** Total en cajas (ingresos, stock, movimientos). CAJA/PALLET suman; SUELTO (pucherio) = 0. */
export function calcTotalEnCajas(
  linea: {
    tipo_bulto: TipoBulto
    cantidad_bultos?: number | string | null
    unidades_por_bulto?: number | string | null
    cantidad_suelta?: number | string | null
  },
  _botellasPorCaja = 6
): number {
  if (linea.tipo_bulto === 'PALLET') {
    return (
      Number(linea.cantidad_bultos ?? 0) * Number(linea.unidades_por_bulto ?? 0) +
      Number(linea.cantidad_suelta ?? 0)
    )
  }
  if (linea.tipo_bulto === 'CAJA') {
    return Number(linea.cantidad_bultos ?? 0)
  }
  if (linea.tipo_bulto === 'SUELTO') {
    return 0
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
  return calcTotalEnCajas(
    {
      tipo_bulto: linea.tipo_bulto as TipoBulto,
      cantidad_bultos: linea.cantidad_bultos,
      unidades_por_bulto: linea.unidades_por_bulto,
      cantidad_suelta: linea.cantidad_suelta
    },
    botellasPorCaja
  )
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
    const base = `${bultos} pallet por ${porBulto}`
    const extra = Number(linea.cantidad_suelta ?? 0)
    return extra > 0 ? `${base} + ${extra} cajas` : base
  }
  if (linea.tipo_bulto === 'CAJA') {
    const base = `${bultos} caja × ${porBulto} ${unidad}`
    const extra = Number(linea.cantidad_suelta ?? 0)
    return extra > 0 ? `${base} + ${extra} ${unidad}` : base
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

export function formatDayTabLabel(isoDate: string): string {
  const today = todayIsoDate()
  if (isoDate === today) return 'Hoy'
  if (isoDate === addIsoDays(today, -1)) return 'Ayer'
  const [year, month, day] = isoDate.split('-')
  if (year !== today.slice(0, 4)) return `${day}/${month}/${year}`
  return `${day}/${month}`
}

export function formatPeriodoFechas(desde: string, hasta: string): string {
  if (desde === hasta) return formatDayTabLabel(desde)
  return `${formatDayTabLabel(desde)} – ${formatDayTabLabel(hasta)}`
}
