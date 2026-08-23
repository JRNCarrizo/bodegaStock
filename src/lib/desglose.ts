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
    parts.push(`${formatCantidad(t.suelto)} ${abreviaturaUnidadSuelto(unidadProducto)}`)
  }
  return parts.length > 0 ? parts.join(' · ') : '0'
}

/** Totales físicos: pallets y cajas tal cual se cargaron (sin convertir pallet→cajas). */
export type TotalesInventarioFisicos = {
  pallets: number
  cajas: number
  suelto: number
}

export function sumarTotalesInventarioFisicos(
  lineas: Array<{
    tipo_bulto: TipoBulto | string
    cantidad_bultos?: number | string | null
    cantidad_suelta?: number | string | null
  }>
): TotalesInventarioFisicos {
  let pallets = 0
  let cajas = 0
  let suelto = 0
  for (const l of lineas) {
    const tipo = String(l.tipo_bulto)
    const bultos = Number(l.cantidad_bultos ?? 0)
    const suelta = Number(l.cantidad_suelta ?? 0)
    if (tipo === 'PALLET') {
      if (bultos > 0) pallets += bultos
      if (suelta > 0) cajas += suelta
    } else if (tipo === 'CAJA') {
      if (bultos > 0) cajas += bultos
      if (suelta > 0) suelto += suelta
    } else if (tipo === 'SUELTO') {
      const n = suelta > 0 ? suelta : bultos
      if (n > 0) suelto += n
    }
  }
  return { pallets, cajas, suelto }
}

export function formatTotalesInventarioFisicos(
  t: TotalesInventarioFisicos,
  unidadProducto?: string | null
): string {
  const parts: string[] = []
  if (t.pallets > 0) {
    parts.push(`${formatCantidad(t.pallets)} pallet${t.pallets === 1 ? '' : 's'}`)
  }
  if (t.cajas > 0) {
    parts.push(`${formatCantidad(t.cajas)} caja${t.cajas === 1 ? '' : 's'}`)
  }
  if (t.suelto > 0) {
    parts.push(`${formatCantidad(t.suelto)} ${abreviaturaUnidadSuelto(unidadProducto)}`)
  }
  return parts.length > 0 ? parts.join(' · ') : '0'
}

export function totalesInventarioCoinciden(
  a: TotalesInventarioDesglose,
  b: TotalesInventarioDesglose
): boolean {
  return Math.abs(a.cajas - b.cajas) < 0.0001 && Math.abs(a.suelto - b.suelto) < 0.0001
}

/** Etiqueta corta para sueltos en listados de conteo (ej. botellas → bot). */
export function abreviaturaUnidadSuelto(unidadProducto?: string | null): string {
  const u = normalizarUnidadProducto(unidadProducto)
  if (u === 'botella') return 'bot'
  return u
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
    return `${formatCantidad(n)} ${abreviaturaUnidadSuelto(unidadProducto)}`
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
  const etiqueta = n === 1 || nombre.endsWith('s') ? nombre : `${nombre}s`
  return `${n} ${etiqueta}`
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

export type LineaBultosPieInput = {
  tipo_bulto?: TipoBulto | string | null
  cantidad_bultos?: number | string | null
  cantidad_cajas?: number | string | null
  unidades_por_bulto?: number | string | null
  cancelada?: boolean | number
}

/** unidades_por_bulto en pallet = cajas por pallet (típ. 84–112); en caja = botellas por caja (≤24). */
const UMBRAL_CAJAS_POR_PALLET = 24

function lineaEsPallet(l: LineaBultosPieInput): boolean {
  const tipo = l.tipo_bulto
  if (tipo === 'PALLET') return true
  if (tipo === 'CAJA' || tipo === 'SUELTO') return false
  const upb = Number(l.unidades_por_bulto ?? 0)
  const cajas = Number(l.cantidad_cajas ?? 0)
  const bultos = Number(l.cantidad_bultos ?? 0)
  if (upb < UMBRAL_CAJAS_POR_PALLET) return false
  if (bultos > 0) return true
  return cajas > 0 && Math.abs(cajas % upb) < 0.0001
}

function palletsDesdeLinea(l: LineaBultosPieInput): number {
  let bultos = Number(l.cantidad_bultos ?? 0)
  if (bultos <= 0) {
    const cajasEq = Number(l.cantidad_cajas ?? 0)
    const upb = Number(l.unidades_por_bulto ?? 0)
    if (cajasEq > 0 && upb > 0) {
      bultos = cajasEq / upb
    }
  }
  return bultos
}

/** Suma pallets y cajas sueltas (no convierte pallets a cajas). */
export function sumBultosPieFromLineas(
  lineas: LineaBultosPieInput[],
  opts?: { incluirCanceladas?: boolean }
): { pallets: number; cajas: number } {
  let pallets = 0
  let cajas = 0
  for (const l of lineas) {
    if (!opts?.incluirCanceladas && l.cancelada) continue
    if (lineaEsPallet(l)) {
      pallets += palletsDesdeLinea(l)
    } else if (l.tipo_bulto === 'SUELTO') {
      continue
    } else {
      cajas += Number(l.cantidad_bultos ?? l.cantidad_cajas ?? 0)
    }
  }
  return { pallets, cajas }
}

export function formatBultosPieLabel(pie: { pallets: number; cajas: number }): string {
  const parts: string[] = []
  if (pie.pallets > 0) {
    parts.push(`${formatCantidad(pie.pallets)} pallet${pie.pallets === 1 ? '' : 's'}`)
  }
  if (pie.cajas > 0) {
    parts.push(`${formatCantidad(pie.cajas)} caja${pie.cajas === 1 ? '' : 's'}`)
  }
  if (parts.length === 0) return '0'
  return parts.join(' + ')
}

/** Total en listado de movimientos (historial). */
export function formatMovimientoListBultos(m: {
  total_pallets?: number
  total_cajas_bulto?: number
  total_cajas: number
  lineas_resumen?: LineaBultosPieInput[]
}): string {
  if (m.lineas_resumen?.length) {
    return formatBultosPieLabel(sumBultosPieFromLineas(m.lineas_resumen))
  }
  const pallets = Number(m.total_pallets ?? 0)
  const cajas = Number(m.total_cajas_bulto ?? 0)
  return formatBultosPieLabel({ pallets, cajas })
}

export function formatResumenBultosPieFromLineas(
  lineas: Array<
    LineaBultosPieInput & {
      cantidad_bultos?: number | string | null
      unidades_por_bulto?: number | string | null
      cantidad_suelta?: number | string | null
    }
  >,
  opts?: { incluirCanceladas?: boolean }
): { label: string; suelto: number } {
  const activas = opts?.incluirCanceladas
    ? lineas
    : lineas.filter((l) => !l.cancelada)
  const pie = sumBultosPieFromLineas(activas, { incluirCanceladas: true })
  const suelto = activas.reduce(
    (s, l) =>
      s +
      totalSueltoLineaConteo({
        tipo_bulto: (l.tipo_bulto ?? 'CAJA') as TipoBulto,
        cantidad_bultos: l.cantidad_bultos,
        unidades_por_bulto: l.unidades_por_bulto,
        cantidad_suelta: l.cantidad_suelta
      }),
    0
  )
  return { label: formatBultosPieLabel(pie), suelto }
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
    const base = `${bultos} pallet${bultos === 1 ? '' : 's'} × ${porBulto}`
    const extra = Number(linea.cantidad_suelta ?? 0)
    return extra > 0
      ? `${base} + ${extra} caja${extra === 1 ? '' : 's'}`
      : base
  }
  if (linea.tipo_bulto === 'CAJA') {
    const base = `${bultos} caja${bultos === 1 ? '' : 's'}`
    const extra = Number(linea.cantidad_suelta ?? 0)
    if (extra <= 0) return base
    const unidadExtra = extra === 1 || unidad.endsWith('s') ? unidad : `${unidad}s`
    return `${base} + ${extra} ${unidadExtra}`
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
