import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Download,
  Layers,
  Loader2,
  MapPin,
  Package,
  ScanLine,
  Search,
  Warehouse
} from 'lucide-react'
import { BarcodeScannerModal } from '@/components/BarcodeScannerModal'
import { ConsultaPorSectorPanel } from '@/components/ConsultaPorSectorPanel'
import { ImagePreviewModal } from '@/components/ImagePreviewModal'
import { ProductImage } from '@/components/ProductImage'
import { ReorganizarStockForm } from '@/components/ReorganizarStockForm'
import { formatCantidad } from '@/lib/desglose'
import { downloadApiFile } from '@/lib/downloadFile'
import { scrollElementFullyIntoView, focusAndScrollIntoView } from '@/lib/scroll'
import { api, cn } from '@/lib/utils'
import type {
  ConsultaDetalle,
  ConsultaResumen,
  ReorganizarDesglosePayload,
  SectorStockConsulta
} from '@/types'
import { ScrollableProductName } from '@/components/ScrollableProductName'
import { Card, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/context/AuthContext'
import { useSidebarNav } from '@/context/SidebarNavContext'
import { useEscHandler } from '@/hooks/useEscHandler'

function StockDetallePanel({
  detalle,
  canReorganizar,
  confirmSectorId,
  reorganizingSectorId,
  onRequestReorganizar,
  onConfirmReorganizar,
  onCancelReorganizar
}: {
  detalle: ConsultaDetalle
  canReorganizar: boolean
  confirmSectorId: number | null
  reorganizingSectorId: number | null
  onRequestReorganizar: (sector: SectorStockConsulta) => void
  onConfirmReorganizar: (stockSectorId: number, desglose: ReorganizarDesglosePayload) => void
  onCancelReorganizar: () => void
}) {
  if (detalle.sectores.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-xl border border-dashed border-surface-border bg-white px-6 py-8 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
          <Warehouse className="h-5 w-5" />
        </div>
        <p className="mt-3 text-sm font-medium text-slate-700">Sin stock en ningún sector</p>
        <p className="mt-1 text-xs text-slate-500">Este producto no tiene unidades registradas</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {detalle.sectores.map((sector) => {
        const showConfirm = confirmSectorId === sector.stock_sector_id
        const isReorganizing = reorganizingSectorId === sector.stock_sector_id
        const puedeReorganizar = canReorganizar && sector.reorganizar.puede

        return (
          <div
            key={sector.stock_sector_id}
            className="overflow-hidden rounded-xl border border-surface-border bg-white shadow-card"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border bg-gradient-to-r from-slate-50 to-white px-4 py-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <Warehouse className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{sector.sector_nombre}</p>
                  {sector.sector_codigo && (
                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      {sector.sector_codigo}
                    </p>
                  )}
                </div>
                {puedeReorganizar && !showConfirm && (
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-8 gap-1.5 px-2.5 text-xs"
                    disabled={reorganizingSectorId !== null}
                    onClick={() => onRequestReorganizar(sector)}
                  >
                    <Layers className="h-3.5 w-3.5" />
                    Armar / reorganizar
                  </Button>
                )}
              </div>
              <span className="inline-flex shrink-0 items-center rounded-full bg-brand-50 px-3 py-1 text-sm font-bold tabular-nums text-brand-700 ring-1 ring-brand-100">
                {formatCantidad(sector.cantidad_total)}
              </span>
            </div>

            <div className="p-4">
              {!canReorganizar && sector.reorganizar.puede && (
                <p className="mb-3 text-xs text-slate-400">
                  Requiere permiso de ajustes de stock
                </p>
              )}

              {!sector.reorganizar.puede && sector.reorganizar.motivo && (
                <p className="mb-3 text-xs text-slate-400">{sector.reorganizar.motivo}</p>
              )}

              {showConfirm && (
                <ReorganizarStockForm
                  titulo={`sector ${sector.sector_nombre}`}
                  info={sector.reorganizar}
                  unidadProducto={detalle.producto.unidad}
                  loading={isReorganizing}
                  onConfirm={(desglose) => onConfirmReorganizar(sector.stock_sector_id, desglose)}
                  onCancel={onCancelReorganizar}
                />
              )}

              {sector.lineas.length === 0 ? (
                <p className="text-sm text-slate-500">Total en sector (sin desglose cargado)</p>
              ) : (
                <ul className="space-y-2">
                  {sector.lineas.map((linea, idx) => (
                    <li
                      key={linea.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-surface-border bg-surface-muted/30 px-3 py-2.5 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded bg-white px-1 text-[10px] font-semibold text-slate-400 ring-1 ring-surface-border">
                            {idx + 1}
                          </span>
                          <span className="font-medium text-slate-800">{linea.etiqueta}</span>
                        </div>
                        {linea.ubicacion && (
                          <p className="mt-1 flex items-center gap-1 pl-7 text-xs text-slate-500">
                            <MapPin className="h-3 w-3 shrink-0" />
                            {linea.ubicacion}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 rounded-md bg-white px-2 py-1 text-sm font-semibold tabular-nums text-slate-900 ring-1 ring-surface-border">
                        {formatCantidad(linea.total_unidades)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

type ConsultaModo = 'producto' | 'sector' | 'todos'

export function ConsultaPage() {
  const { hasPermiso } = useAuth()
  const canReorganizar = hasPermiso('ajustes.crear')
  const [modo, setModo] = useState<ConsultaModo>('producto')
  const [sectorDetailOpen, setSectorDetailOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [resultados, setResultados] = useState<ConsultaResumen[]>([])
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [detalleCache, setDetalleCache] = useState<Record<number, ConsultaDetalle>>({})
  const [loadingDetalleId, setLoadingDetalleId] = useState<number | null>(null)
  const [confirmSectorId, setConfirmSectorId] = useState<number | null>(null)
  const [reorganizingSectorId, setReorganizingSectorId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [showScanner, setShowScanner] = useState(false)
  const [imagePreview, setImagePreview] = useState<{
    src: string
    alt: string
    title?: string
  } | null>(null)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const resultadosListRef = useRef<HTMLUListElement>(null)
  const expandedItemRef = useRef<HTMLLIElement | null>(null)
  const { registerEscHandler, registerMainContentFocus } = useSidebarNav()

  const expandedDetalle = expandedId != null ? detalleCache[expandedId] : undefined

  const cargarTodos = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api<ConsultaResumen[]>('/api/consulta/todos')
      setResultados(data)
      setExpandedId(null)
      setConfirmSectorId(null)
      setHighlightIndex(-1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar productos')
      setResultados([])
      setExpandedId(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (modo !== 'todos') return
    void cargarTodos()
  }, [modo, cargarTodos])

  async function exportarStockProductos() {
    setExporting(true)
    setError('')
    try {
      await downloadApiFile(
        '/api/consulta/export/stock-productos',
        `stock-productos.xlsx`
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al exportar')
    } finally {
      setExporting(false)
    }
  }

  function scrollExpandedIntoView() {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = expandedItemRef.current
        if (el) scrollElementFullyIntoView(el)
      })
    })
  }

  async function cargarDetalle(productoId: number, force = false) {
    if (!force && detalleCache[productoId]) return

    setLoadingDetalleId(productoId)
    setError('')
    try {
      const data = await api<ConsultaDetalle>(`/api/consulta/producto/${productoId}`)
      setDetalleCache((prev) => ({ ...prev, [productoId]: data }))
      return data
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar detalle')
      return null
    } finally {
      setLoadingDetalleId(null)
    }
  }

  async function confirmReorganizar(stockSectorId: number, desglose: ReorganizarDesglosePayload) {
    if (!expandedId || !detalleCache[expandedId]) return

    const sector = detalleCache[expandedId].sectores.find(
      (s) => s.stock_sector_id === stockSectorId
    )
    const ubicIds = [...new Set((sector?.lineas ?? []).map((l) => l.ubicacion_id))]
    const scopeBody =
      ubicIds.length === 1
        ? ubicIds[0] == null
          ? { sin_ubicacion: true }
          : { ubicacion_id: ubicIds[0] }
        : {}

    setReorganizingSectorId(stockSectorId)
    setError('')
    try {
      const res = await api<{
        ok: boolean
        detalle?: ConsultaDetalle
      }>(`/api/consulta/stock-sector/${stockSectorId}/reorganizar`, {
        method: 'POST',
        body: JSON.stringify({ ...desglose, ...scopeBody })
      })

      if (res.detalle) {
        setDetalleCache((prev) => ({ ...prev, [expandedId]: res.detalle! }))
      } else {
        await cargarDetalle(expandedId, true)
      }
      setConfirmSectorId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al reorganizar stock')
    } finally {
      setReorganizingSectorId(null)
    }
  }

  const buscar = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResultados([])
      setExpandedId(null)
      return
    }
    setLoading(true)
    setError('')
    try {
      const data = await api<ConsultaResumen[]>(
        `/api/consulta?q=${encodeURIComponent(q.trim())}`
      )
      setResultados(data)
      setExpandedId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error en la búsqueda')
      setResultados([])
      setExpandedId(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (modo !== 'producto') return
    const timer = setTimeout(() => buscar(search), 350)
    return () => clearTimeout(timer)
  }, [search, buscar, modo])

  useEffect(() => {
    setHighlightIndex(-1)
  }, [resultados])

  useLayoutEffect(() => {
    if (highlightIndex < 0) return
    const list = resultadosListRef.current
    if (!list) return
    const item = list.children[highlightIndex] as HTMLElement | undefined
    if (item) scrollElementFullyIntoView(item)
  }, [highlightIndex])

  useLayoutEffect(() => {
    if (expandedId === null) return
    scrollExpandedIntoView()
  }, [expandedId])

  useLayoutEffect(() => {
    if (expandedId === null) return
    if (loadingDetalleId === expandedId) return
    scrollExpandedIntoView()
  }, [expandedId, loadingDetalleId, expandedDetalle])

  useLayoutEffect(() => {
    if (expandedId === null || confirmSectorId === null) return
    scrollExpandedIntoView()
  }, [expandedId, confirmSectorId])

  async function expandProducto(producto: ConsultaResumen) {
    setExpandedId(producto.id)
    const idx = resultados.findIndex((r) => r.id === producto.id)
    if (idx >= 0) setHighlightIndex(idx)
    if (!detalleCache[producto.id]) {
      await cargarDetalle(producto.id)
    }
  }

  async function toggleExpand(producto: ConsultaResumen) {
    if (expandedId === producto.id) {
      setExpandedId(null)
      setConfirmSectorId(null)
      return
    }
    await expandProducto(producto)
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (showScanner || imagePreview) return

    const hasResults = resultados.length > 0 && !loading

    if (e.key === 'ArrowDown') {
      if (!hasResults) return
      e.preventDefault()
      if (expandedId !== null) {
        setExpandedId(null)
        setConfirmSectorId(null)
      }
      setHighlightIndex((i) => (i < resultados.length - 1 ? i + 1 : 0))
      return
    }

    if (e.key === 'ArrowUp') {
      if (!hasResults) return
      e.preventDefault()
      if (expandedId !== null) {
        setExpandedId(null)
        setConfirmSectorId(null)
      }
      setHighlightIndex((i) => (i > 0 ? i - 1 : resultados.length - 1))
      return
    }

    if (e.key === 'Escape') {
      return
    }

    if (e.key === 'Enter') {
      if (!hasResults) return
      e.preventDefault()
      const idx = highlightIndex >= 0 ? highlightIndex : 0
      const producto = resultados[idx]
      if (producto && expandedId !== producto.id) {
        void expandProducto(producto)
      }
    }
  }

  useEffect(() => {
    if (highlightIndex < 0) return
    return registerEscHandler(() => {
      focusSearchInput({ scrollIntoView: true })
      setHighlightIndex(-1)
      return true
    })
  }, [highlightIndex, registerEscHandler])

  useEscHandler(true, () => {
    if (modo === 'sector' && sectorDetailOpen) {
      return false
    }
    if (showScanner) {
      setShowScanner(false)
      return true
    }
    if (imagePreview) {
      setImagePreview(null)
      return true
    }
    if (confirmSectorId !== null) {
      setConfirmSectorId(null)
      return true
    }
    if (expandedId !== null) {
      setExpandedId(null)
      return true
    }
    return false
  })

  function handleScan(code: string) {
    setSearch(code)
    setShowScanner(false)
  }

  useLayoutEffect(() => {
    ;(document.activeElement as HTMLElement | null)?.blur()
    focusSearchInput()
    const t1 = window.setTimeout(() => focusSearchInput(), 80)
    const t2 = window.setTimeout(() => focusSearchInput(), 250)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [])

  function focusSearchInput(options?: { scrollIntoView?: boolean }) {
    if (options?.scrollIntoView) {
      focusAndScrollIntoView(searchInputRef.current)
      return
    }
    searchInputRef.current?.focus({ preventScroll: true })
  }

  useEffect(() => {
    if (modo !== 'producto') return
    return registerMainContentFocus(() => {
      focusSearchInput({ scrollIntoView: true })
      return !!searchInputRef.current
    })
  }, [registerMainContentFocus, modo])

  const modoTabs = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: 'producto' as const, label: 'Por producto' },
            { id: 'sector' as const, label: 'Por sector' },
            { id: 'todos' as const, label: 'Ver todos' }
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setModo(tab.id)
              setExpandedId(null)
              setConfirmSectorId(null)
              setHighlightIndex(-1)
              if (tab.id === 'producto') setSectorDetailOpen(false)
              if (tab.id === 'todos') {
                setSearch('')
                setSectorDetailOpen(false)
              }
              if (tab.id === 'sector') {
                setResultados([])
                setSearch('')
              }
            }}
            className={cn(
              'rounded-full border px-4 py-2 text-sm font-medium transition-colors',
              modo === tab.id
                ? 'border-brand-500 bg-brand-600 text-white shadow-sm'
                : 'border-surface-border bg-white text-slate-600 hover:border-brand-300'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <Button
        variant="secondary"
        size="sm"
        className="rounded-xl"
        disabled={exporting}
        onClick={() => void exportarStockProductos()}
        title="Excel con código interno, nombre, descripción y cantidad total"
      >
        {exporting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        {exporting ? 'Exportando…' : 'Exportar Excel'}
      </Button>
    </div>
  )

  const titulo =
    modo === 'producto'
      ? 'Buscar productos'
      : modo === 'sector'
        ? 'Consultar por sector'
        : 'Todos los productos'

  const subtitulo =
    modo === 'producto'
      ? 'Código interno, código de barras o nombre. Desplegá cada resultado para ver el stock por sector y ubicación.'
      : modo === 'sector'
        ? 'Elegí un sector para ver todos los productos con stock, filtrando por ubicación interna si aplica.'
        : 'Listado de productos con stock. El desglose por sector queda cerrado; desplegá cada producto para verlo.'

  function renderProductoListItem(p: ConsultaResumen, index: number) {
    const isExpanded = expandedId === p.id
    const isHighlighted = index === highlightIndex
    const detalle = detalleCache[p.id]
    const loadingDetalle = loadingDetalleId === p.id

    return (
      <li key={p.id} ref={isExpanded ? expandedItemRef : undefined}>
        <div
          className={cn(
            'flex items-center gap-3 px-4 py-3.5 transition-colors sm:gap-4 sm:px-6',
            isExpanded
              ? 'bg-brand-50/70'
              : isHighlighted
                ? 'bg-brand-50 ring-1 ring-inset ring-brand-200'
                : 'hover:bg-slate-50/80'
          )}
        >
          <button
            type="button"
            onClick={() => {
              setHighlightIndex(index)
              void toggleExpand(p)
            }}
            className={cn(
              'shrink-0 rounded-lg p-1.5 transition-colors',
              isExpanded
                ? 'bg-brand-100 text-brand-700'
                : 'text-slate-400 hover:bg-slate-200 hover:text-slate-700'
            )}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? 'Ocultar stock' : 'Ver stock'}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>

          <ProductImage
            productoId={p.id}
            hasImage={!!p.imagen_path}
            alt={p.nombre}
            className="h-12 w-12 shrink-0 rounded-xl ring-1 ring-surface-border"
            clickable={!!p.imagen_path}
            onPreview={(src) =>
              setImagePreview({
                src,
                alt: p.nombre,
                title: `${p.codigo_interno} — ${p.nombre}`
              })
            }
          />

          <button
            type="button"
            onClick={() => {
              setHighlightIndex(index)
              void toggleExpand(p)
            }}
            className="min-w-0 flex-1 text-left"
          >
            <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">
              {p.codigo_interno}
            </span>
            <ScrollableProductName className="mt-1.5 text-sm font-semibold text-slate-900">
              {p.nombre}
            </ScrollableProductName>
            {p.descripcion && (
              <ScrollableProductName className="mt-0.5 text-xs text-slate-500">
                {p.descripcion}
              </ScrollableProductName>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setHighlightIndex(index)
              void toggleExpand(p)
            }}
            className="shrink-0 text-right"
          >
            <span className="inline-flex min-w-[3rem] items-center justify-center rounded-lg bg-brand-50 px-2.5 py-1.5 text-sm font-bold tabular-nums text-brand-700 ring-1 ring-brand-100">
              {formatCantidad(p.stock_total)}
            </span>
            {p.sectores_con_stock > 0 && (
              <p className="mt-1 text-[11px] font-medium text-slate-500">
                {p.sectores_con_stock} sector{p.sectores_con_stock === 1 ? '' : 'es'}
              </p>
            )}
          </button>
        </div>

        {isExpanded && (
          <div className="border-t border-brand-100/80 bg-gradient-to-b from-surface-muted/50 to-white px-4 py-5 sm:px-6">
            <div className="ml-1 sm:ml-2">
              <div className="mb-4 flex items-center gap-2">
                <div className="h-px flex-1 bg-brand-200/60" />
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Stock por sector
                </p>
                <div className="h-px flex-1 bg-brand-200/60" />
              </div>
              {loadingDetalle ? (
                <div className="flex items-center gap-2 py-4 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
                  Cargando detalle...
                </div>
              ) : detalle ? (
                <StockDetallePanel
                  detalle={detalle}
                  canReorganizar={canReorganizar}
                  confirmSectorId={confirmSectorId}
                  reorganizingSectorId={reorganizingSectorId}
                  onRequestReorganizar={(sector) => setConfirmSectorId(sector.stock_sector_id)}
                  onConfirmReorganizar={confirmReorganizar}
                  onCancelReorganizar={() => setConfirmSectorId(null)}
                />
              ) : (
                <p className="py-4 text-sm text-slate-500">No se pudo cargar el detalle</p>
              )}
            </div>
          </div>
        )}
      </li>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Consulta de stock
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {titulo}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-500">{subtitulo}</p>
        </div>
        {modo === 'producto' && (
          <div className="flex flex-wrap gap-1.5">
            {['↑↓ navegar', 'Enter abrir', 'Esc cerrar'].map((hint) => (
              <span
                key={hint}
                className="rounded-full border border-surface-border bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 shadow-card"
              >
                {hint}
              </span>
            ))}
          </div>
        )}
      </section>

      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-100">
          {error}
        </div>
      )}

      {modoTabs}

      {modo === 'sector' ? (
        <ConsultaPorSectorPanel onSectorSelectedChange={setSectorDetailOpen} />
      ) : modo === 'todos' ? (
        <Card className="overflow-hidden shadow-panel">
          <div className="flex items-center justify-between gap-3 border-b border-surface-border bg-slate-50/80 px-5 py-3.5 sm:px-6">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Listado completo</h2>
              <p className="text-xs text-slate-500">
                {loading
                  ? 'Cargando productos...'
                  : `${resultados.length} producto${resultados.length === 1 ? '' : 's'} con stock`}
              </p>
            </div>
            {loading && <Loader2 className="h-5 w-5 shrink-0 animate-spin text-brand-600" />}
            {!loading && resultados.length > 0 && (
              <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-100">
                {resultados.length}
              </span>
            )}
          </div>
          <CardBody className="p-0">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
                Cargando listado...
              </div>
            ) : resultados.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-14 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                  <Package className="h-7 w-7" />
                </div>
                <p className="mt-4 text-sm font-medium text-slate-700">No hay productos con stock</p>
              </div>
            ) : (
              <ul ref={resultadosListRef} className="divide-y divide-surface-border">
                {resultados.map((p, index) => renderProductoListItem(p, index))}
              </ul>
            )}
          </CardBody>
        </Card>
      ) : (
        <>
      <Card className="overflow-hidden shadow-panel">
        <div className="border-b border-brand-100 bg-gradient-to-r from-brand-50/80 via-white to-white px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="relative block min-w-0 flex-1 cursor-text">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-brand-400" />
              <input
                ref={searchInputRef}
                type="search"
                data-list-search
                placeholder="Código interno, barras o nombre del producto..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                className="w-full rounded-xl border border-surface-border bg-white py-3 pl-12 pr-4 text-sm shadow-sm transition-shadow placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </label>
            <Button
              variant="secondary"
              className="shrink-0 gap-2 rounded-xl px-4"
              onClick={() => setShowScanner(true)}
            >
              <ScanLine className="h-4 w-4" />
              Escanear
            </Button>
          </div>
        </div>

        {!search.trim() && (
          <CardBody>
            <div className="flex flex-col items-center py-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                <Search className="h-7 w-7" />
              </div>
              <p className="mt-4 text-sm font-medium text-slate-700">
                Empezá escribiendo o escaneá un código
              </p>
              <p className="mt-1 max-w-sm text-xs text-slate-500">
                Los resultados aparecen acá mientras escribís
              </p>
            </div>
          </CardBody>
        )}
      </Card>

      {search.trim() && (
        <Card className="overflow-hidden shadow-panel">
          <div className="flex items-center justify-between gap-3 border-b border-surface-border bg-slate-50/80 px-5 py-3.5 sm:px-6">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Resultados</h2>
              <p className="text-xs text-slate-500">
                {loading ? 'Buscando productos...' : `${resultados.length} producto(s) encontrado(s)`}
              </p>
            </div>
            {loading && <Loader2 className="h-5 w-5 shrink-0 animate-spin text-brand-600" />}
            {!loading && resultados.length > 0 && (
              <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-100">
                {resultados.length}
              </span>
            )}
          </div>

          <CardBody className="p-0">
            {!loading && resultados.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-14 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                  <Package className="h-7 w-7" />
                </div>
                <p className="mt-4 text-sm font-medium text-slate-700">No se encontraron productos</p>
                <p className="mt-1 text-xs text-slate-500">
                  Probá con otro código, nombre o escaneá de nuevo
                </p>
              </div>
            ) : (
              <ul ref={resultadosListRef} className="divide-y divide-surface-border">
                {resultados.map((p, index) => renderProductoListItem(p, index))}
              </ul>
            )}
          </CardBody>
        </Card>
      )}

        </>
      )}

      {modo === 'producto' && (
        <BarcodeScannerModal
          open={showScanner}
          onClose={() => setShowScanner(false)}
          onScan={handleScan}
          title="Escanear para consultar"
        />
      )}

      <ImagePreviewModal
        src={imagePreview?.src ?? null}
        alt={imagePreview?.alt ?? ''}
        title={imagePreview?.title}
        onClose={() => setImagePreview(null)}
      />
    </div>
  )
}
