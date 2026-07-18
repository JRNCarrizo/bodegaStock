import type { OfflineLinea, OfflineProducto, TipoBultoOffline } from './types'

export interface TotalesInv {
  cajas: number
  suelto: number
}

function calcTotalUnidades(linea: {
  tipo_bulto: TipoBultoOffline
  cantidad_bultos?: number | null
  unidades_por_bulto?: number | null
  cantidad_suelta?: number | null
}): number {
  if (linea.tipo_bulto === 'SUELTO') return Number(linea.cantidad_suelta ?? 0)
  return (
    Number(linea.cantidad_bultos ?? 0) * Number(linea.unidades_por_bulto ?? 0) +
    Number(linea.cantidad_suelta ?? 0)
  )
}

function calcTotalEnCajas(
  linea: {
    tipo_bulto: TipoBultoOffline
    cantidad_bultos?: number | null
    unidades_por_bulto?: number | null
    cantidad_suelta?: number | null
  },
  _botellasPorCaja = 6
): number {
  if (linea.tipo_bulto === 'PALLET') {
    return (
      Number(linea.cantidad_bultos ?? 0) * Number(linea.unidades_por_bulto ?? 0) +
      Number(linea.cantidad_suelta ?? 0)
    )
  }
  if (linea.tipo_bulto === 'CAJA') return Number(linea.cantidad_bultos ?? 0)
  return 0
}

function totalSueltoLinea(linea: {
  tipo_bulto: TipoBultoOffline
  cantidad_bultos?: number | null
  unidades_por_bulto?: number | null
  cantidad_suelta?: number | null
}): number {
  if (linea.tipo_bulto === 'SUELTO') return calcTotalUnidades(linea)
  if (linea.tipo_bulto === 'CAJA') return Number(linea.cantidad_suelta ?? 0)
  return 0
}

export function etiquetaLinea(
  linea: {
    tipo_bulto: TipoBultoOffline
    cantidad_bultos?: number | null
    unidades_por_bulto?: number | null
    cantidad_suelta?: number | null
  },
  unidadProducto = 'unidad'
): string {
  const bultos = Number(linea.cantidad_bultos ?? 0)
  const porBulto = Number(linea.unidades_por_bulto ?? 0)
  if (linea.tipo_bulto === 'PALLET') {
    const base = `${bultos} pallet por ${porBulto}`
    const extra = Number(linea.cantidad_suelta ?? 0)
    return extra > 0 ? `${base} + ${extra} cajas` : base
  }
  if (linea.tipo_bulto === 'CAJA') {
    const base = `${bultos} caja × ${porBulto} ${unidadProducto}`
    const extra = Number(linea.cantidad_suelta ?? 0)
    return extra > 0 ? `${base} + ${extra} ${unidadProducto}` : base
  }
  return `${Number(linea.cantidad_suelta ?? 0)} ${unidadProducto}`
}

export function buildOfflineLinea(
  input: {
    producto_id: number
    contador_id: number
    ronda: number
    tipo_bulto: TipoBultoOffline
    cantidad_bultos?: number | null
    unidades_por_bulto?: number | null
    cantidad_suelta?: number | null
    ubicacion?: string | null
    ubicacion_id?: number | null
    orden?: number
  },
  producto: OfflineProducto
): OfflineLinea {
  const linea = {
    tipo_bulto: input.tipo_bulto,
    cantidad_bultos: input.cantidad_bultos ?? null,
    unidades_por_bulto: input.unidades_por_bulto ?? null,
    cantidad_suelta: input.cantidad_suelta ?? null
  }
  const total_cajas = calcTotalEnCajas(linea, producto.botellas_por_caja)
  const total_suelto = totalSueltoLinea(linea)
  const total_unidades =
    input.tipo_bulto === 'SUELTO'
      ? calcTotalUnidades(linea)
      : calcTotalEnCajas(linea, producto.botellas_por_caja)

  return {
    local_id: `L-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    producto_id: input.producto_id,
    contador_id: input.contador_id,
    ronda: input.ronda,
    tipo_bulto: input.tipo_bulto,
    cantidad_bultos: input.tipo_bulto === 'SUELTO' ? null : input.cantidad_bultos ?? null,
    unidades_por_bulto: input.tipo_bulto === 'SUELTO' ? null : input.unidades_por_bulto ?? null,
    cantidad_suelta: input.cantidad_suelta ?? null,
    ubicacion: input.ubicacion ?? null,
    ubicacion_id: input.ubicacion_id ?? null,
    total_unidades,
    total_cajas,
    total_suelto,
    orden: input.orden ?? 0,
    etiqueta: etiquetaLinea(linea, producto.unidad),
    codigo_interno: producto.codigo_interno,
    nombre: producto.nombre
  }
}

function totalesPorProducto(
  lineas: OfflineLinea[],
  productos: Map<number, OfflineProducto>
): Map<number, TotalesInv> {
  const map = new Map<number, TotalesInv>()
  for (const l of lineas) {
    const prev = map.get(l.producto_id) ?? { cajas: 0, suelto: 0 }
    map.set(l.producto_id, {
      cajas: prev.cajas + l.total_cajas,
      suelto: prev.suelto + l.total_suelto
    })
    void productos
  }
  return map
}

function resumen(t: TotalesInv, unidad: string): string {
  const parts: string[] = []
  if (t.cajas > 0) parts.push(`${t.cajas}`)
  if (t.suelto > 0) parts.push(`${t.suelto} ${unidad}${t.suelto === 1 ? '' : 's'}`)
  return parts.length > 0 ? parts.join(' · ') : '0'
}

function coinciden(a: TotalesInv, b: TotalesInv): boolean {
  return Math.abs(a.cajas - b.cajas) < 0.0001 && Math.abs(a.suelto - b.suelto) < 0.0001
}

export function compararContadoresLocal(
  lineas1: OfflineLinea[],
  lineas2: OfflineLinea[],
  ronda: number,
  productos: OfflineProducto[]
) {
  const prodMap = new Map(productos.map((p) => [p.id, p]))
  const l1 = lineas1.filter((l) => l.ronda === ronda)
  const l2 = lineas2.filter((l) => l.ronda === ronda)
  const tot1 = totalesPorProducto(l1, prodMap)
  const tot2 = totalesPorProducto(l2, prodMap)
  const ids = new Set([...tot1.keys(), ...tot2.keys()])

  const ok: Array<{
    producto_id: number
    codigo_interno: string
    nombre: string
    resumen: string
  }> = []
  const diferencias: Array<{
    producto_id: number
    codigo_interno: string
    nombre: string
    resumen_contador_1: string
    resumen_contador_2: string
    lineas_contador_1: OfflineLinea[]
    lineas_contador_2: OfflineLinea[]
  }> = []

  for (const productoId of ids) {
    const p = prodMap.get(productoId)
    const codigo = p?.codigo_interno ?? String(productoId)
    const nombre = p?.nombre ?? `Producto ${productoId}`
    const unidad = p?.unidad ?? 'unidad'
    const t1 = tot1.get(productoId) ?? { cajas: 0, suelto: 0 }
    const t2 = tot2.get(productoId) ?? { cajas: 0, suelto: 0 }
    const lineasA = l1.filter((x) => x.producto_id === productoId)
    const lineasB = l2.filter((x) => x.producto_id === productoId)

    if (coinciden(t1, t2)) {
      ok.push({
        producto_id: productoId,
        codigo_interno: codigo,
        nombre,
        resumen: resumen(t1, unidad)
      })
    } else {
      diferencias.push({
        producto_id: productoId,
        codigo_interno: codigo,
        nombre,
        resumen_contador_1: resumen(t1, unidad),
        resumen_contador_2: resumen(t2, unidad),
        lineas_contador_1: lineasA,
        lineas_contador_2: lineasB
      })
    }
  }

  return {
    ronda,
    ok,
    diferencias,
    coincide: diferencias.length === 0
  }
}
