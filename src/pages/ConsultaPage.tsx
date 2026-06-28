import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Layers, Package, Search } from 'lucide-react'
import { BarcodeScannerModal } from '@/components/BarcodeScannerModal'
import { ImagePreviewModal } from '@/components/ImagePreviewModal'
import { ProductImage } from '@/components/ProductImage'
import { ReorganizarStockForm } from '@/components/ReorganizarStockForm'
import { formatCantidad } from '@/lib/desglose'
import { api } from '@/lib/utils'
import type {
  ConsultaDetalle,
  ConsultaResumen,
  ReorganizarDesglosePayload,
  SectorStockConsulta
} from '@/types'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/context/AuthContext'
import { useEscHandler } from '@/hooks/useEscHandler'

function scrollElementFullyIntoView(el: HTMLElement, margin = 20) {
  el.scrollIntoView({ block: 'nearest' })

  let scrollParent: HTMLElement | null = el.parentElement
  while (scrollParent) {
    const { overflowY } = getComputedStyle(scrollParent)
    if (/(auto|scroll|overlay)/.test(overflowY) && scrollParent.scrollHeight > scrollParent.clientHeight) {
      break
    }
    scrollParent = scrollParent.parentElement
  }

  const container = scrollParent
  if (!container) return

  const elRect = el.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  const overflowBottom = elRect.bottom - containerRect.bottom + margin
  const overflowTop = containerRect.top + margin - elRect.top

  if (overflowBottom > 0) {
    container.scrollTop += overflowBottom
  } else if (overflowTop > 0) {
    container.scrollTop -= overflowTop
  }
}

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
      <div className="rounded-lg border border-dashed border-surface-border bg-white px-4 py-5 text-center text-sm text-slate-500">
        Sin stock en ningún sector
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
          className="rounded-lg border border-surface-border bg-white p-3"
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-slate-900">{sector.sector_nombre}</p>
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
            <span className="shrink-0 text-sm font-semibold text-brand-700">
              {formatCantidad(sector.cantidad_total)}
            </span>
          </div>

          {!canReorganizar && sector.reorganizar.puede && (
            <p className="mb-2 text-xs text-slate-400">
              Requiere permiso de ajustes de stock
            </p>
          )}

          {!sector.reorganizar.puede && sector.reorganizar.motivo && (
            <p className="mb-2 text-xs text-slate-400">{sector.reorganizar.motivo}</p>
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
            <p className="text-xs text-slate-500">Total en sector (sin desglose cargado)</p>
          ) : (
            <ul className="divide-y divide-surface-border rounded-md border border-surface-border">
              {sector.lineas.map((linea, idx) => (
                <li
                  key={linea.id}
                  className="px-3 py-2 text-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-700">
                      <span className="mr-2 text-slate-400">#{idx + 1}</span>
                      {linea.etiqueta}
                      {linea.ubicacion && (
                        <span className="ml-2 text-xs text-slate-400">({linea.ubicacion})</span>
                      )}
                    </span>
                    <span className="shrink-0 font-medium text-slate-900">
                      {formatCantidad(linea.total_unidades)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        )
      })}
    </div>
  )
}

export function ConsultaPage() {
  const { hasPermiso } = useAuth()
  const canReorganizar = hasPermiso('ajustes.crear')
  const [search, setSearch] = useState('')
  const [resultados, setResultados] = useState<ConsultaResumen[]>([])
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [detalleCache, setDetalleCache] = useState<Record<number, ConsultaDetalle>>({})
  const [loadingDetalleId, setLoadingDetalleId] = useState<number | null>(null)
  const [confirmSectorId, setConfirmSectorId] = useState<number | null>(null)
  const [reorganizingSectorId, setReorganizingSectorId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
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

  const expandedDetalle = expandedId != null ? detalleCache[expandedId] : undefined

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
    if (!expandedId) return

    setReorganizingSectorId(stockSectorId)
    setError('')
    try {
      const res = await api<{
        ok: boolean
        detalle?: ConsultaDetalle
      }>(`/api/consulta/stock-sector/${stockSectorId}/reorganizar`, {
        method: 'POST',
        body: JSON.stringify(desglose)
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
    const timer = setTimeout(() => buscar(search), 350)
    return () => clearTimeout(timer)
  }, [search, buscar])

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

  useEscHandler(true, () => {
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
    if (resultados.length > 0 && search.trim()) {
      if (document.activeElement !== searchInputRef.current || highlightIndex >= 0) {
        searchInputRef.current?.focus()
        setHighlightIndex(-1)
        return true
      }
    }
    return false
  })

  function handleScan(code: string) {
    setSearch(code)
    setShowScanner(false)
  }

  useLayoutEffect(() => {
    searchInputRef.current?.focus({ preventScroll: true })
  }, [])

  function focusSearchInput() {
    searchInputRef.current?.focus({ preventScroll: true })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Consulta</h1>
        <p className="mt-1 text-slate-500">
          Buscar productos y desplegar el stock por sector · ↑↓ navegar · Enter desplegar · Esc plegar
        </p>
      </div>

      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div
              className="relative flex-1"
              onMouseDown={(e) => {
                if (e.target === searchInputRef.current) return
                e.preventDefault()
                focusSearchInput()
              }}
            >
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchInputRef}
                type="search"
                placeholder="Código interno, barras o nombre..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                className="w-full rounded-lg border border-surface-border py-2.5 pl-10 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>
            <Button variant="secondary" onClick={() => setShowScanner(true)}>
              Escanear
            </Button>
          </div>
          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
        </CardBody>
      </Card>

      {search.trim() && (
        <Card>
          <CardHeader
            title="Resultados"
            description={
              loading
                ? 'Buscando...'
                : `${resultados.length} producto(s) encontrado(s)`
            }
          />
          <CardBody className="p-0">
            {!loading && resultados.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-center">
                <Package className="h-10 w-10 text-slate-300" />
                <p className="mt-2 text-sm text-slate-500">No se encontraron productos</p>
              </div>
            ) : (
              <ul ref={resultadosListRef} className="divide-y divide-surface-border">
                {resultados.map((p, index) => {
                  const isExpanded = expandedId === p.id
                  const isHighlighted = index === highlightIndex
                  const detalle = detalleCache[p.id]
                  const loadingDetalle = loadingDetalleId === p.id

                  return (
                    <li key={p.id} ref={isExpanded ? expandedItemRef : undefined}>
                      <div
                        className={`flex items-center gap-2 px-4 py-3 transition-colors sm:px-6 ${
                          isExpanded
                            ? 'bg-brand-50/60'
                            : isHighlighted
                              ? 'bg-brand-50 ring-1 ring-inset ring-brand-200'
                              : 'hover:bg-slate-50'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setHighlightIndex(index)
                            void toggleExpand(p)
                          }}
                          className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
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
                          className="h-10 w-10 shrink-0"
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
                          <p className="font-mono text-sm font-semibold text-slate-900">
                            {p.codigo_interno}
                          </p>
                          <p className={`text-sm ${isExpanded ? '' : 'truncate'}`}>
                            <span className="font-medium text-slate-800">{p.nombre}</span>
                            {p.descripcion && (
                              <>
                                <span className="text-slate-300"> · </span>
                                <span className="text-xs text-slate-500">{p.descripcion}</span>
                              </>
                            )}
                          </p>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setHighlightIndex(index)
                            void toggleExpand(p)
                          }}
                          className="shrink-0 text-right"
                        >
                          <p className="text-sm font-semibold text-brand-700">{formatCantidad(p.stock_total)}</p>
                          {p.sectores_con_stock > 0 && (
                            <p className="text-xs text-slate-500">
                              {p.sectores_con_stock} sector(es)
                            </p>
                          )}
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-brand-100 bg-surface-muted/40 px-4 py-4 sm:px-6">
                          <div className="ml-7 border-l-2 border-brand-200 pl-4">
                            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Stock por sector
                            </p>
                            {loadingDetalle ? (
                              <p className="text-sm text-slate-500">Cargando detalle...</p>
                            ) : detalle ? (
                              <StockDetallePanel
                                detalle={detalle}
                                canReorganizar={canReorganizar}
                                confirmSectorId={confirmSectorId}
                                reorganizingSectorId={reorganizingSectorId}
                                onRequestReorganizar={(sector) =>
                                  setConfirmSectorId(sector.stock_sector_id)
                                }
                                onConfirmReorganizar={confirmReorganizar}
                                onCancelReorganizar={() => setConfirmSectorId(null)}
                              />
                            ) : (
                              <p className="text-sm text-slate-500">
                                No se pudo cargar el detalle
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      )}

      <BarcodeScannerModal
        open={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={handleScan}
        title="Escanear para consultar"
      />

      <ImagePreviewModal
        src={imagePreview?.src ?? null}
        alt={imagePreview?.alt ?? ''}
        title={imagePreview?.title}
        onClose={() => setImagePreview(null)}
      />
    </div>
  )
}
