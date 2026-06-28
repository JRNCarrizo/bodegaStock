import { useMemo, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Package } from 'lucide-react'
import { formatCantidad } from '@/lib/desglose'
import { Badge, Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

export type RegistroDetalleLinea = {
  id: number
  producto_id: number
  codigo_interno: string
  nombre: string
  etiqueta: string
  cantidad: number
  /** Badge u otro contenido visible en la fila del producto (sin desplegar) */
  extra?: ReactNode
  /** Agrupa extras iguales cuando hay varias líneas del mismo producto */
  extraKey?: string
}

export function RegistroDetallePanel({
  onVolver,
  titulo,
  fecha,
  totalEtiqueta,
  total,
  meta,
  lineas,
  encabezadoExtra,
  antesProductos,
  despuesProductos,
  productosContent,
  productosCount
}: {
  onVolver: () => void
  titulo: string
  fecha: string
  totalEtiqueta: string
  total: number
  meta?: ReactNode
  lineas?: RegistroDetalleLinea[]
  encabezadoExtra?: ReactNode
  antesProductos?: ReactNode
  despuesProductos?: ReactNode
  productosContent?: ReactNode
  productosCount?: number
}) {
  const lineasLista = lineas ?? []
  const [expandedProductos, setExpandedProductos] = useState<Set<number>>(() => new Set())

  const lineasPorProducto = useMemo(() => {
    const map = new Map<number, { producto: RegistroDetalleLinea; lineas: RegistroDetalleLinea[] }>()
    for (const l of lineasLista) {
      const existing = map.get(l.producto_id)
      if (existing) existing.lineas.push(l)
      else map.set(l.producto_id, { producto: l, lineas: [l] })
    }
    return [...map.values()].map((g) => ({
      ...g,
      total: g.lineas.reduce((s, l) => s + l.cantidad, 0)
    }))
  }, [lineasLista])

  const cantidadProductos = productosCount ?? lineasPorProducto.length

  function toggleProductoExpand(productoId: number) {
    setExpandedProductos((prev) => {
      const next = new Set(prev)
      if (next.has(productoId)) next.delete(productoId)
      else next.add(productoId)
      return next
    })
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Button variant="ghost" size="sm" className="-ml-2 h-8 shrink-0 px-2" onClick={onVolver}>
          <ChevronLeft className="h-4 w-4" />
          Volver
        </Button>
        <span className="hidden h-4 w-px bg-surface-border sm:block" aria-hidden />
        <h1 className="text-base font-semibold text-slate-900 sm:text-lg">{titulo}</h1>
        <Badge variant="muted">{fecha}</Badge>
        {encabezadoExtra}
        <span className="text-xs text-slate-400">
          {cantidadProductos} producto{cantidadProductos === 1 ? '' : 's'}
        </span>
        <div className="ml-auto shrink-0 text-right">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
            {totalEtiqueta}
          </p>
          <p className="text-lg font-bold tabular-nums leading-tight text-brand-700">
            {formatCantidad(total)}
          </p>
        </div>
      </div>

      {meta && <div className="flex flex-wrap items-center gap-1.5 text-xs">{meta}</div>}

      {antesProductos}

      {productosContent ?? (
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-surface-border bg-slate-50/80 px-4 py-2">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-700">Productos</h2>
          </div>
          <span className="text-xs text-slate-400">{lineasLista.length} líneas</span>
        </div>
        <div className="divide-y divide-surface-border">
          {lineasPorProducto.map((grupo) => {
            const isExpanded = expandedProductos.has(grupo.producto.producto_id)
            const extrasFila = [
              ...new Map(
                grupo.lineas
                  .filter((l) => l.extra)
                  .map((l) => [l.extraKey ?? String(l.id), l.extra] as const)
              ).values()
            ]

            return (
              <div key={grupo.producto.producto_id}>
                <div className="flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50/80">
                  <button
                    type="button"
                    onClick={() => toggleProductoExpand(grupo.producto.producto_id)}
                    className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                    aria-expanded={isExpanded}
                    aria-label={isExpanded ? 'Ocultar desglose' : 'Ver desglose'}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleProductoExpand(grupo.producto.producto_id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex min-w-0 items-baseline gap-2">
                      <span className="shrink-0 font-mono text-sm font-semibold text-slate-900">
                        {grupo.producto.codigo_interno}
                      </span>
                      <span className="min-w-0 truncate text-sm text-slate-600">
                        {grupo.producto.nombre}
                      </span>
                    </div>
                    {!isExpanded && grupo.lineas.length > 1 && (
                      <p className="text-xs text-slate-400">{grupo.lineas.length} líneas</p>
                    )}
                  </button>
                  <div className="flex shrink-0 items-center gap-2">
                    {extrasFila}
                    <Badge variant="default">{formatCantidad(grupo.total)}</Badge>
                  </div>
                </div>
                {isExpanded && (
                  <ul className="divide-y divide-surface-border border-t border-surface-border bg-surface-muted/20">
                    {grupo.lineas.map((l) => (
                      <li
                        key={l.id}
                        className="flex items-center justify-between gap-2 py-2.5 pl-11 pr-4 text-sm"
                      >
                        <span className="text-slate-700">{l.etiqueta}</span>
                        <span className="shrink-0 font-semibold tabular-nums text-slate-900">
                          {formatCantidad(l.cantidad)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      </Card>
      )}

      {despuesProductos}
    </div>
  )
}

export function RegistroDetalleMetaChip({
  children,
  icon
}: {
  children: ReactNode
  icon?: ReactNode
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-surface-border bg-white px-2 py-1 text-slate-600">
      {icon}
      <span className="truncate">{children}</span>
    </span>
  )
}

export function RegistroDetalleObsChip({ children }: { children: ReactNode }) {
  return (
    <span className="w-full rounded-md bg-slate-50 px-2.5 py-1.5 text-slate-600 sm:w-auto">
      <span className="font-medium text-slate-500">Obs. </span>
      {children}
    </span>
  )
}
