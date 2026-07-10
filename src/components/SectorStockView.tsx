import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Layers,
  Loader2,
  MapPin,
  Package,
  Search,
  Warehouse
} from 'lucide-react'
import { formatCantidad } from '@/lib/desglose'
import { api, cn } from '@/lib/utils'
import type { Sector, SectorStockDetalle, SectorUbicacion } from '@/types'
import { ProductImage } from '@/components/ProductImage'
import { Button } from '@/components/ui/Button'
import { Badge, Card, CardBody } from '@/components/ui/Card'

type UbicacionFilter = 'all' | 'sin' | number

export function SectorStockView({
  sector,
  onBack,
  autoFocusSearch = true
}: {
  sector: Sector
  onBack?: () => void
  autoFocusSearch?: boolean
}) {
  const [ubicaciones, setUbicaciones] = useState<SectorUbicacion[]>([])
  const [loadingUbicaciones, setLoadingUbicaciones] = useState(false)
  const [ubicacionFilter, setUbicacionFilter] = useState<UbicacionFilter>('all')
  const [stockDetalle, setStockDetalle] = useState<SectorStockDetalle | null>(null)
  const [loadingStock, setLoadingStock] = useState(false)
  const [stockError, setStockError] = useState('')
  const [expandedStockProductos, setExpandedStockProductos] = useState<Set<number>>(() => new Set())
  const [stockSearch, setStockSearch] = useState('')
  const stockSearchRef = useRef<HTMLInputElement>(null)

  const loadUbicaciones = useCallback(async (sectorId: number) => {
    setLoadingUbicaciones(true)
    try {
      const data = await api<SectorUbicacion[]>(`/api/sectores/${sectorId}/ubicaciones`)
      setUbicaciones(data)
    } catch {
      setUbicaciones([])
    } finally {
      setLoadingUbicaciones(false)
    }
  }, [])

  const loadSectorStock = useCallback(async (sectorId: number, filter: UbicacionFilter) => {
    setLoadingStock(true)
    setStockError('')
    try {
      const params = new URLSearchParams()
      if (filter === 'sin') params.set('sin_ubicacion', '1')
      else if (filter !== 'all') params.set('ubicacion_id', String(filter))
      const data = await api<SectorStockDetalle>(
        `/api/sectores/${sectorId}/stock?${params}`
      )
      setStockDetalle(data)
      setExpandedStockProductos(new Set())
    } catch (err) {
      setStockDetalle(null)
      setStockError(err instanceof Error ? err.message : 'Error al cargar stock')
    } finally {
      setLoadingStock(false)
    }
  }, [])

  useEffect(() => {
    setUbicacionFilter('all')
    setStockDetalle(null)
    setStockError('')
    setStockSearch('')
    setExpandedStockProductos(new Set())
    if (sector.usa_ubicaciones) {
      void loadUbicaciones(sector.id)
    } else {
      setUbicaciones([])
    }
    void loadSectorStock(sector.id, 'all')
  }, [sector.id, sector.usa_ubicaciones, loadUbicaciones, loadSectorStock])

  useEffect(() => {
    if (!autoFocusSearch) return
    const timer = setTimeout(() => stockSearchRef.current?.focus({ preventScroll: true }), 80)
    return () => clearTimeout(timer)
  }, [sector.id, autoFocusSearch])

  function changeUbicacionFilter(filter: UbicacionFilter) {
    setUbicacionFilter(filter)
    void loadSectorStock(sector.id, filter)
  }

  function toggleStockProducto(productoId: number) {
    setExpandedStockProductos((prev) => {
      const next = new Set(prev)
      if (next.has(productoId)) next.delete(productoId)
      else next.add(productoId)
      return next
    })
  }

  const productosStockFiltrados = useMemo(() => {
    if (!stockDetalle) return []
    const q = stockSearch.trim().toLowerCase()
    if (!q) return stockDetalle.productos
    return stockDetalle.productos.filter(
      (p) =>
        p.codigo_interno.toLowerCase().includes(q) ||
        p.nombre.toLowerCase().includes(q)
    )
  }, [stockDetalle, stockSearch])

  const totalStockFiltrado = useMemo(
    () => productosStockFiltrados.reduce((s, p) => s + p.cantidad_total, 0),
    [productosStockFiltrados]
  )

  const filtroLabel =
    ubicacionFilter === 'all'
      ? 'Todo el sector'
      : ubicacionFilter === 'sin'
        ? 'Sin ubicación'
        : ubicaciones.find((u) => u.id === ubicacionFilter)?.nombre ?? 'Ubicación'

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-surface-border bg-surface-muted/30 shadow-panel">
      <div className="shrink-0 border-b border-surface-border bg-white">
        <div className="border-b border-brand-100 bg-gradient-to-r from-brand-50/80 via-white to-white px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {onBack && (
              <Button
                variant="ghost"
                size="sm"
                className="-ml-1 h-9 shrink-0 rounded-xl px-3"
                onClick={onBack}
              >
                <ChevronLeft className="h-4 w-4" />
                Volver
              </Button>
            )}
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
              <Warehouse className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
                {sector.nombre}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge variant={sector.activo ? 'success' : 'muted'}>
                  {sector.activo ? 'Activo' : 'Inactivo'}
                </Badge>
                {!!sector.es_sector_descuento && (
                  <Badge variant="default">
                    Descuento P{sector.prioridad_descuento ?? '—'}
                  </Badge>
                )}
                {stockDetalle && (
                  <span className="text-xs text-slate-500">
                    {stockDetalle.total_productos} productos
                  </span>
                )}
              </div>
            </div>
            {stockDetalle && (
              <span className="inline-flex shrink-0 items-center rounded-full bg-brand-50 px-3 py-1 text-sm font-bold tabular-nums text-brand-700 ring-1 ring-brand-100">
                {formatCantidad(stockDetalle.total_stock)}
              </span>
            )}
          </div>
        </div>

        {!!sector.usa_ubicaciones && (
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-6">
            <Layers className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Filtrar
            </span>
            {loadingUbicaciones ? (
              <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => changeUbicacionFilter('all')}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    ubicacionFilter === 'all'
                      ? 'border-brand-500 bg-brand-600 text-white'
                      : 'border-surface-border bg-white text-slate-600 hover:border-brand-300'
                  )}
                >
                  Todo el sector
                </button>
                {ubicaciones.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => changeUbicacionFilter(u.id)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      ubicacionFilter === u.id
                        ? 'border-brand-500 bg-brand-600 text-white'
                        : 'border-surface-border bg-white text-slate-600 hover:border-brand-300'
                    )}
                  >
                    {u.nombre}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => changeUbicacionFilter('sin')}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    ubicacionFilter === 'sin'
                      ? 'border-brand-500 bg-brand-600 text-white'
                      : 'border-dashed border-surface-border bg-white text-slate-500 hover:border-brand-300'
                  )}
                >
                  Sin ubicación
                </button>
              </>
            )}
            {ubicacionFilter !== 'all' && (
              <span className="text-xs text-slate-400">· {filtroLabel}</span>
            )}
          </div>
        )}
      </div>

      {stockError && (
        <div className="shrink-0 border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700 sm:px-6">
          {stockError}
        </div>
      )}

      <div className="shrink-0 border-b border-surface-border bg-white px-4 py-3 sm:px-6">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400" />
          <input
            ref={stockSearchRef}
            type="search"
            placeholder="Buscar producto por código o nombre..."
            value={stockSearch}
            onChange={(e) => setStockSearch(e.target.value)}
            className="w-full rounded-xl border border-surface-border bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
        </div>
      </div>

      <div className="min-h-0 max-h-[min(70vh,42rem)] overflow-y-auto">
        <div className="px-4 py-4 sm:px-6">
          {loadingStock ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-surface-border bg-white py-16 shadow-card">
              <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
              <p className="mt-3 text-sm text-slate-500">Cargando stock del sector...</p>
            </div>
          ) : !stockDetalle || stockDetalle.productos.length === 0 ? (
            <div className="flex flex-col items-center rounded-2xl border border-dashed border-surface-border bg-white py-16 text-center shadow-card">
              <Package className="h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-700">Sin productos</p>
              <p className="mt-1 text-xs text-slate-500">
                No hay stock{filtroLabel !== 'Todo el sector' ? ` en "${filtroLabel}"` : ''}
              </p>
            </div>
          ) : productosStockFiltrados.length === 0 ? (
            <div className="flex flex-col items-center rounded-2xl border border-dashed border-surface-border bg-white py-14 text-center shadow-card">
              <Search className="h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-700">Sin coincidencias</p>
              <p className="mt-1 text-xs text-slate-500">
                Ningún producto coincide con &quot;{stockSearch.trim()}&quot;
              </p>
            </div>
          ) : (
            <Card className="overflow-hidden shadow-panel">
              <CardBody className="p-0">
                <ul className="divide-y divide-surface-border">
                  {productosStockFiltrados.map((producto) => {
                    const isExpanded = expandedStockProductos.has(producto.producto_id)
                    return (
                      <li key={producto.producto_id}>
                        <button
                          type="button"
                          onClick={() => toggleStockProducto(producto.producto_id)}
                          className={cn(
                            'flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors sm:px-5',
                            isExpanded ? 'bg-brand-50/60' : 'hover:bg-slate-50/80'
                          )}
                        >
                          <span
                            className={cn(
                              'shrink-0 rounded-lg p-1',
                              isExpanded ? 'bg-brand-100 text-brand-700' : 'text-slate-400'
                            )}
                            aria-hidden
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </span>
                          <ProductImage
                            productoId={producto.producto_id}
                            hasImage={!!producto.imagen_path}
                            alt={producto.nombre}
                            className="h-11 w-11 shrink-0 rounded-xl ring-1 ring-surface-border"
                          />
                          <div className="min-w-0 flex-1 text-left">
                            <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">
                              {producto.codigo_interno}
                            </span>
                            <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                              {producto.nombre}
                            </p>
                          </div>
                          <span className="inline-flex shrink-0 items-center rounded-lg bg-brand-50 px-2.5 py-1.5 text-sm font-bold tabular-nums text-brand-700 ring-1 ring-brand-100">
                            {formatCantidad(producto.cantidad_total)}
                          </span>
                        </button>
                        {isExpanded && (
                          <ul className="space-y-2 border-t border-brand-100/80 bg-gradient-to-b from-surface-muted/40 to-white px-4 py-3 sm:px-5">
                            {producto.lineas.map((linea, idx) => (
                              <li
                                key={linea.id}
                                className="flex items-center justify-between gap-3 rounded-lg border border-surface-border bg-white px-3 py-2 text-sm"
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded bg-slate-100 px-1 text-[10px] font-semibold text-slate-400">
                                      {idx + 1}
                                    </span>
                                    <span className="font-medium text-slate-800">
                                      {linea.etiqueta}
                                    </span>
                                  </div>
                                  {ubicacionFilter === 'all' && linea.ubicacion && (
                                    <p className="mt-1 flex items-center gap-1 pl-7 text-xs text-slate-500">
                                      <MapPin className="h-3 w-3 shrink-0" />
                                      {linea.ubicacion}
                                    </p>
                                  )}
                                </div>
                                <span className="shrink-0 rounded-md bg-slate-50 px-2 py-1 text-sm font-semibold tabular-nums text-slate-900 ring-1 ring-surface-border">
                                  {formatCantidad(linea.total_unidades)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </CardBody>
            </Card>
          )}
        </div>
      </div>

      {stockDetalle && productosStockFiltrados.length > 0 && (
        <div className="shrink-0 border-t border-surface-border bg-white px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.04)] sm:px-6">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">
              {stockSearch.trim()
                ? `${productosStockFiltrados.length} de ${stockDetalle.productos.length} productos`
                : 'Total del sector'}
            </span>
            <span className="text-xl font-bold tabular-nums text-brand-700">
              {formatCantidad(totalStockFiltrado)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
