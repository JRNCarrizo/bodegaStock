import { useLocation } from 'react-router-dom'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  List,
  Package,
  Plus,
  Search,
  Trash2,
  X
} from 'lucide-react'
import { BarcodeScannerModal } from '@/components/BarcodeScannerModal'
import { ProductQuickCreateModal } from '@/components/ProductQuickCreateModal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge, Card, CardBody, CardHeader } from '@/components/ui/Card'
import { ProductImage } from '@/components/ProductImage'
import { formatCantidad, formatDayTabLabel, formatTotalCajas, todayIsoDate } from '@/lib/desglose'
import { api } from '@/lib/utils'
import type {
  Producto,
  RoturaDetalle,
  RoturaLineaDraft,
  RoturaListItem,
  RoturaResumenDia,
  Sector
} from '@/types'
import { useAuth } from '@/context/AuthContext'
import { useEscHandler } from '@/hooks/useEscHandler'

function newTempId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function RoturasPage() {
  const { hasPermiso } = useAuth()
  const location = useLocation()
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list')
  const [roturas, setRoturas] = useState<RoturaListItem[]>([])
  const [detalle, setDetalle] = useState<RoturaDetalle | null>(null)
  const [loadingList, setLoadingList] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const [listSearch, setListSearch] = useState('')
  const [listFechaDesde, setListFechaDesde] = useState('')
  const [listFechaHasta, setListFechaHasta] = useState('')
  const [selectedDay, setSelectedDay] = useState(() => todayIsoDate())

  const [createPhase, setCreatePhase] = useState<'datos' | 'carga'>('datos')
  const [fecha, setFecha] = useState(todayIsoDate())
  const [observacion, setObservacion] = useState('')
  const [sectores, setSectores] = useState<Sector[]>([])

  const [productSearch, setProductSearch] = useState('')
  const [productResults, setProductResults] = useState<Producto[]>([])
  const [productHighlightIndex, setProductHighlightIndex] = useState(-1)
  const [selectedProduct, setSelectedProduct] = useState<Producto | null>(null)
  const [cantidadCajas, setCantidadCajas] = useState('')
  const [lineSectorId, setLineSectorId] = useState('')
  const [stockDisponible, setStockDisponible] = useState<number | null>(null)
  const [lineas, setLineas] = useState<RoturaLineaDraft[]>([])
  const [expandedProductos, setExpandedProductos] = useState<Set<number>>(new Set())
  const [showScanner, setShowScanner] = useState(false)
  const [showNewProduct, setShowNewProduct] = useState(false)

  const [showResumenDia, setShowResumenDia] = useState(false)
  const [resumenDia, setResumenDia] = useState<RoturaResumenDia | null>(null)
  const [loadingResumen, setLoadingResumen] = useState(false)

  const fechaRef = useRef<HTMLInputElement>(null)
  const observacionRef = useRef<HTMLInputElement>(null)
  const productSearchRef = useRef<HTMLInputElement>(null)
  const cantidadRef = useRef<HTMLInputElement>(null)
  const lineSectorRef = useRef<HTMLSelectElement>(null)
  const listSearchRef = useRef<HTMLInputElement>(null)
  const productResultsListRef = useRef<HTMLUListElement>(null)
  const listScrollRef = useRef<HTMLDivElement>(null)
  const productLineFormRef = useRef<HTMLDivElement>(null)

  const lineasPorProducto = useMemo(() => {
    const map = new Map<number, { producto: RoturaLineaDraft; lineas: RoturaLineaDraft[] }>()
    for (const l of lineas) {
      const existing = map.get(l.producto_id)
      if (existing) existing.lineas.push(l)
      else map.set(l.producto_id, { producto: l, lineas: [l] })
    }
    return [...map.values()].map((g) => ({
      ...g,
      total: g.lineas.reduce((s, l) => s + l.cantidad_cajas, 0)
    }))
  }, [lineas])

  const totalGeneral = useMemo(
    () => lineas.reduce((s, l) => s + l.cantidad_cajas, 0),
    [lineas]
  )

  const diasConRoturas = useMemo(() => {
    const dias = new Set<string>()
    for (const r of roturas) dias.add(r.fecha)
    return [...dias].sort((a, b) => b.localeCompare(a))
  }, [roturas])

  const roturasDelDia = useMemo(
    () => roturas.filter((r) => r.fecha === selectedDay),
    [roturas, selectedDay]
  )

  const totalCajasDelDia = useMemo(
    () => roturasDelDia.reduce((s, r) => s + r.total_cajas, 0),
    [roturasDelDia]
  )

  const conteoPorDia = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of roturas) map.set(r.fecha, (map.get(r.fecha) ?? 0) + 1)
    return map
  }, [roturas])

  function focusField(ref: React.RefObject<HTMLElement | null>) {
    requestAnimationFrame(() => {
      ref.current?.focus()
      ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
  }

  function scrollListToBottom() {
    requestAnimationFrame(() => {
      const el = listScrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
  }

  const loadRoturas = useCallback(async () => {
    setLoadingList(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (listSearch.trim()) params.set('q', listSearch.trim())
      let desde = listFechaDesde
      let hasta = listFechaHasta
      if (desde && hasta && desde > hasta) [desde, hasta] = [hasta, desde]
      if (desde) params.set('fecha_desde', desde)
      if (hasta) params.set('fecha_hasta', hasta)
      const data = await api<RoturaListItem[]>(`/api/roturas?${params}`)
      setRoturas(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar registros')
    } finally {
      setLoadingList(false)
    }
  }, [listSearch, listFechaDesde, listFechaHasta])

  useEffect(() => {
    if (view !== 'list') return
    const timer = setTimeout(() => listSearchRef.current?.focus(), 80)
    return () => clearTimeout(timer)
  }, [view, location.pathname])

  useEffect(() => {
    if (view !== 'list') return
    const timer = setTimeout(() => loadRoturas(), 300)
    return () => clearTimeout(timer)
  }, [view, loadRoturas])

  useEffect(() => {
    if (listFechaDesde && !listFechaHasta) setSelectedDay(listFechaDesde)
    else if (listFechaHasta && !listFechaDesde) setSelectedDay(listFechaHasta)
    else if (listFechaDesde && listFechaHasta && listFechaDesde === listFechaHasta) {
      setSelectedDay(listFechaDesde)
    }
  }, [listFechaDesde, listFechaHasta])

  useEffect(() => {
    if (loadingList || diasConRoturas.length === 0) return
    if (!diasConRoturas.includes(selectedDay)) {
      const today = todayIsoDate()
      setSelectedDay(diasConRoturas.includes(today) ? today : diasConRoturas[0])
    }
  }, [loadingList, diasConRoturas, selectedDay])

  useEffect(() => {
    api<Sector[]>('/api/sectores?activo=1').then(setSectores).catch(() => {})
  }, [])

  useEffect(() => {
    if (!productSearch.trim()) {
      setProductResults([])
      return
    }
    const timer = setTimeout(async () => {
      try {
        const data = await api<Producto[]>(
          `/api/productos?q=${encodeURIComponent(productSearch.trim())}&activo=1`
        )
        setProductResults(data)
      } catch {
        setProductResults([])
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [productSearch])

  useEffect(() => {
    if (!selectedProduct || !lineSectorId) {
      setStockDisponible(null)
      return
    }
    api<{ stock_disponible_cajas: number }>(
      `/api/roturas/producto/${selectedProduct.id}/stock-sector/${lineSectorId}`
    )
      .then((data) => setStockDisponible(data.stock_disponible_cajas))
      .catch(() => setStockDisponible(null))
  }, [selectedProduct, lineSectorId])

  useLayoutEffect(() => {
    if (productHighlightIndex < 0) return
    const item = productResultsListRef.current?.children[productHighlightIndex] as
      | HTMLElement
      | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [productHighlightIndex])

  useEffect(() => {
    setProductHighlightIndex(-1)
  }, [productResults])

  useLayoutEffect(() => {
    if (createPhase === 'carga' && lineas.length > 0) scrollListToBottom()
  }, [lineas.length, createPhase])

  function resetCreateForm() {
    setCreatePhase('datos')
    setFecha(todayIsoDate())
    setObservacion('')
    setProductSearch('')
    setProductResults([])
    setSelectedProduct(null)
    setCantidadCajas('')
    setLineSectorId('')
    setStockDisponible(null)
    setLineas([])
    setExpandedProductos(new Set())
    setShowScanner(false)
    setShowNewProduct(false)
    setProductHighlightIndex(-1)
    setError('')
  }

  function volverAlListado() {
    resetCreateForm()
    setDetalle(null)
    setShowScanner(false)
    setShowNewProduct(false)
    setView('list')
  }

  function volverAlListadoDesdeDetalle() {
    if (detalle) setSelectedDay(detalle.rotura.fecha)
    setDetalle(null)
    setView('list')
  }

  useEscHandler(view === 'detail' && !!detalle, () => {
    volverAlListadoDesdeDetalle()
    return true
  })

  useEscHandler(view === 'create', () => {
    if (saving) return false
    if (showScanner) {
      setShowScanner(false)
      return true
    }
    if (showNewProduct) {
      setShowNewProduct(false)
      return true
    }
    if (productResults.length > 0 && !selectedProduct) {
      setProductResults([])
      setProductHighlightIndex(-1)
      return true
    }
    if (selectedProduct) {
      setSelectedProduct(null)
      setProductSearch('')
      setCantidadCajas('')
      setStockDisponible(null)
      focusField(productSearchRef)
      return true
    }
    volverAlListado()
    return true
  })

  useEscHandler(showResumenDia, () => {
    setShowResumenDia(false)
    return true
  })

  function abrirNuevoRegistro() {
    resetCreateForm()
    setView('create')
    setTimeout(() => focusField(fechaRef), 50)
  }

  function handleListSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' || !hasPermiso('roturas.crear')) return
    e.preventDefault()
    abrirNuevoRegistro()
  }

  useEffect(() => {
    if (view !== 'list' || !hasPermiso('roturas.crear')) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat) return
      if (!(e.target instanceof HTMLElement)) return
      if (e.target.closest('button, a, textarea, [contenteditable="true"]')) return
      if (e.target instanceof HTMLInputElement && e.target.type === 'date') return
      if (e.target instanceof HTMLSelectElement) return
      e.preventDefault()
      abrirNuevoRegistro()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [view, hasPermiso])

  function validarDatos(): boolean {
    if (!fecha) {
      setError('Completá la fecha')
      return false
    }
    setError('')
    return true
  }

  function avanzarACarga() {
    if (!validarDatos()) return
    if (!lineSectorId && sectores[0]) setLineSectorId(String(sectores[0].id))
    setCreatePhase('carga')
    setTimeout(() => focusField(productSearchRef), 50)
  }

  function handleDatosKeyDown(
    e: React.KeyboardEvent,
    next?: React.RefObject<HTMLInputElement | null>
  ) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (next?.current) focusField(next)
    else avanzarACarga()
  }

  function selectProduct(p: Producto) {
    setSelectedProduct(p)
    setProductSearch(p.codigo_interno)
    setProductResults([])
    setProductHighlightIndex(-1)
    setCantidadCajas('')
    setError('')
    if (!lineSectorId && sectores[0]) setLineSectorId(String(sectores[0].id))
    setTimeout(() => focusField(cantidadRef), 50)
  }

  function handleProductSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (selectedProduct) return
    const hasDropdown = productResults.length > 0

    if (e.key === 'ArrowDown' && hasDropdown) {
      e.preventDefault()
      setProductHighlightIndex((i) => (i < productResults.length - 1 ? i + 1 : 0))
      return
    }
    if (e.key === 'ArrowUp' && hasDropdown) {
      e.preventDefault()
      setProductHighlightIndex((i) => (i > 0 ? i - 1 : productResults.length - 1))
      return
    }
    if (e.key === 'Escape' && hasDropdown) {
      e.preventDefault()
      setProductResults([])
      setProductHighlightIndex(-1)
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (productHighlightIndex >= 0 && productResults[productHighlightIndex]) {
        selectProduct(productResults[productHighlightIndex])
      } else if (productResults.length === 1) {
        selectProduct(productResults[0])
      }
    }
  }

  function agregarLineaYContinuar() {
    if (!selectedProduct) {
      setError('Seleccioná un producto')
      return
    }
    const qty = Number(cantidadCajas)
    if (!qty || qty <= 0) {
      setError('Ingresá una cantidad válida en cajas')
      return
    }
    if (!lineSectorId) {
      setError('Seleccioná el sector')
      return
    }
    const sector = sectores.find((s) => s.id === Number(lineSectorId))
    if (!sector) {
      setError('Sector no válido')
      return
    }
    if (stockDisponible != null && qty > stockDisponible) {
      setError(`Stock insuficiente en el sector (disponible: ${formatTotalCajas(stockDisponible)})`)
      return
    }
    setLineas((prev) => [
      ...prev,
      {
        tempId: newTempId(),
        producto_id: selectedProduct.id,
        codigo_interno: selectedProduct.codigo_interno,
        nombre: selectedProduct.nombre,
        sector_id: sector.id,
        sector_nombre: sector.nombre,
        cantidad_cajas: qty
      }
    ])
    setExpandedProductos((prev) => new Set(prev).add(selectedProduct.id))
    setSelectedProduct(null)
    setProductSearch('')
    setCantidadCajas('')
    setStockDisponible(null)
    setError('')
    setTimeout(() => focusField(productSearchRef), 50)
  }

  async function confirmarRotura() {
    if (!validarDatos()) return
    if (lineas.length === 0) {
      setError('Agregá al menos una línea de producto')
      return
    }
    setSaving(true)
    setError('')
    try {
      const result = await api<{ id: number }>('/api/roturas', {
        method: 'POST',
        body: JSON.stringify({
          fecha,
          observacion: observacion.trim() || null,
          lineas: lineas.map((l) => ({
            producto_id: l.producto_id,
            sector_id: l.sector_id,
            cantidad_cajas: l.cantidad_cajas
          }))
        })
      })
      await loadRoturas()
      await abrirDetalle(result.id)
      resetCreateForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar')
    } finally {
      setSaving(false)
    }
  }

  async function abrirDetalle(id: number) {
    setError('')
    try {
      const data = await api<RoturaDetalle>(`/api/roturas/${id}`)
      setDetalle(data)
      setView('detail')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar detalle')
    }
  }

  async function abrirResumenDia() {
    setLoadingResumen(true)
    setError('')
    try {
      const data = await api<RoturaResumenDia>(
        `/api/roturas/resumen-dia?fecha=${encodeURIComponent(selectedDay)}`
      )
      setResumenDia(data)
      setShowResumenDia(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar resumen')
    } finally {
      setLoadingResumen(false)
    }
  }

  function toggleProductoExpand(productoId: number) {
    setExpandedProductos((prev) => {
      const next = new Set(prev)
      if (next.has(productoId)) next.delete(productoId)
      else next.add(productoId)
      return next
    })
  }

  function quitarLinea(tempId: string) {
    setLineas((prev) => prev.filter((l) => l.tempId !== tempId))
  }

  if (view === 'detail' && detalle) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <Button variant="ghost" size="sm" onClick={volverAlListadoDesdeDetalle}>
          <ChevronLeft className="h-4 w-4" />
          Volver al listado
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">Rotura / pérdida #{detalle.rotura.id}</h1>
          <Badge variant="muted">Descuento aplicado</Badge>
        </div>
        {error && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}
        <Card>
          <CardBody className="grid gap-4 sm:grid-cols-2 text-sm">
            <div>
              <p className="text-slate-500">Fecha</p>
              <p className="font-medium">{detalle.rotura.fecha}</p>
            </div>
            <div>
              <p className="text-slate-500">Registrado por</p>
              <p className="font-medium">{detalle.rotura.usuario_nombre}</p>
            </div>
            {detalle.rotura.observacion && (
              <div className="sm:col-span-2">
                <p className="text-slate-500">Observación</p>
                <p className="font-medium">{detalle.rotura.observacion}</p>
              </div>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title="Productos descontados"
            description={formatTotalCajas(detalle.total_cajas)}
          />
          <CardBody className="space-y-2">
            {detalle.lineas.map((l) => (
              <div
                key={l.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-surface-border px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-mono font-semibold">{l.codigo_interno}</p>
                  <p className="text-slate-700">{l.nombre}</p>
                  <p className="text-xs text-slate-500">{l.sector_nombre}</p>
                </div>
                <p className="font-semibold text-brand-700">{formatTotalCajas(l.cantidad_cajas)}</p>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    )
  }

  if (view === 'create' && createPhase === 'datos') {
    return (
      <div className="-m-4 h-[calc(100vh-5rem)] overflow-y-auto lg:-m-6">
        <div className="mx-auto flex max-w-lg flex-col px-4 py-8 pb-16">
          <Button variant="ghost" size="sm" className="mb-4 -ml-2 self-start" onClick={volverAlListado}>
            <ChevronLeft className="h-4 w-4" />
            Volver al listado
          </Button>
          <h1 className="text-2xl font-bold text-slate-900">Rotura / pérdida</h1>
          <p className="mt-1 mb-6 text-slate-500">
            Descuenta stock por cajas rotas o perdidas · Enter avanza · Esc vuelve al listado
          </p>
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}
          <Card>
            <CardBody className="space-y-4">
              <Input
                ref={fechaRef}
                label="Fecha *"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                onKeyDown={(e) => handleDatosKeyDown(e, observacionRef)}
              />
              <Input
                ref={observacionRef}
                label="Observación"
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                onKeyDown={(e) => handleDatosKeyDown(e)}
                placeholder="Opcional — motivo, referencia, etc."
              />
              <p className="text-xs text-slate-400">Enter en observaciones → carga de productos</p>
              <Button type="button" className="w-full" onClick={avanzarACarga}>
                Continuar a productos
              </Button>
            </CardBody>
          </Card>
        </div>
      </div>
    )
  }

  if (view === 'create') {
    const lineasListContent =
      lineas.length === 0 ? (
        <div className="flex h-full min-h-[120px] flex-col items-center justify-center py-8 text-center text-slate-400">
          <Package className="mb-2 h-10 w-10 opacity-40" />
          <p className="text-sm">Las líneas cargadas aparecen acá</p>
        </div>
      ) : (
        lineasPorProducto.map((grupo) => {
          const isExpanded = expandedProductos.has(grupo.producto.producto_id)
          return (
            <div key={grupo.producto.producto_id} className="border-b border-surface-border last:border-0">
              <div className="flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50/80">
                <button
                  type="button"
                  onClick={() => toggleProductoExpand(grupo.producto.producto_id)}
                  className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-200"
                >
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => toggleProductoExpand(grupo.producto.producto_id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="font-mono text-sm font-semibold">{grupo.producto.codigo_interno}</p>
                  <p className="truncate text-xs text-slate-600">{grupo.producto.nombre}</p>
                </button>
                <Badge variant="default">{formatTotalCajas(grupo.total)}</Badge>
              </div>
              {isExpanded && (
                <ul className="divide-y divide-surface-border border-t bg-surface-muted/20">
                  {grupo.lineas.map((l) => (
                    <li
                      key={l.tempId}
                      className="flex items-center justify-between gap-2 py-2.5 pl-11 pr-4 text-sm"
                    >
                      <span className="text-slate-700">
                        {formatTotalCajas(l.cantidad_cajas)} · {l.sector_nombre}
                      </span>
                      <Button type="button" variant="ghost" size="sm" onClick={() => quitarLinea(l.tempId)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })
      )

    return (
      <div className="-m-4 flex h-[calc(100vh-5rem)] flex-col bg-surface-muted/30 lg:-m-6">
        <div className="shrink-0 border-b border-surface-border bg-white shadow-sm">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-2 text-xs text-slate-600">
            <Button variant="ghost" size="sm" className="-ml-2 h-7" onClick={volverAlListado}>
              <ChevronLeft className="h-3.5 w-3.5" />
              Salir
            </Button>
            <span>
              <strong className="text-slate-800">{fecha}</strong>
            </span>
            {observacion.trim() && (
              <span className="truncate max-w-xs" title={observacion.trim()}>
                {observacion.trim()}
              </span>
            )}
            <button type="button" className="text-brand-600 hover:underline" onClick={() => setCreatePhase('datos')}>
              Editar datos
            </button>
          </div>
          {error && (
            <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
          )}
          <div className="space-y-3 p-4">
            <div className="relative flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  ref={productSearchRef}
                  type="search"
                  placeholder="Buscar producto — ↑↓ · Enter"
                  value={productSearch}
                  onChange={(e) => {
                    setProductSearch(e.target.value)
                    setProductHighlightIndex(-1)
                    if (selectedProduct && e.target.value !== selectedProduct.codigo_interno) {
                      setSelectedProduct(null)
                    }
                  }}
                  onKeyDown={handleProductSearchKeyDown}
                  className="w-full rounded-lg border border-surface-border py-2.5 pl-10 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
                {productResults.length > 0 && !selectedProduct && (
                  <ul
                    ref={productResultsListRef}
                    className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-lg border bg-white shadow-lg"
                  >
                    {productResults.map((p, index) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                            index === productHighlightIndex ? 'bg-brand-50' : 'hover:bg-slate-50'
                          }`}
                          onMouseEnter={() => setProductHighlightIndex(index)}
                          onClick={() => selectProduct(p)}
                        >
                          <span className="font-mono font-semibold">{p.codigo_interno}</span>
                          <span className="truncate text-slate-600">{p.nombre}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => setShowScanner(true)}>
                  <Camera className="h-4 w-4" />
                  Escanear
                </Button>
                {hasPermiso('productos.crear') && (
                  <Button type="button" variant="secondary" size="sm" onClick={() => setShowNewProduct(true)}>
                    <Plus className="h-4 w-4" />
                    Nuevo
                  </Button>
                )}
              </div>
            </div>
            {selectedProduct && (
              <div ref={productLineFormRef} className="rounded-lg border border-red-200 bg-red-50/40 p-3">
                <div className="mb-3 flex items-center gap-2">
                  <ProductImage
                    productoId={selectedProduct.id}
                    hasImage={!!selectedProduct.imagen_path}
                    alt={selectedProduct.nombre}
                    className="h-9 w-9 rounded object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-sm font-semibold">{selectedProduct.codigo_interno}</p>
                    <p className="truncate text-xs text-slate-600">{selectedProduct.nombre}</p>
                  </div>
                  <button
                    type="button"
                    className="rounded p-1 text-slate-400 hover:text-slate-600"
                    onClick={() => {
                      setSelectedProduct(null)
                      setProductSearch('')
                      setCantidadCajas('')
                      setStockDisponible(null)
                    }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Input
                    ref={cantidadRef}
                    label="Cant. cajas"
                    type="number"
                    min="1"
                    value={cantidadCajas}
                    onChange={(e) => setCantidadCajas(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        focusField(lineSectorRef)
                      }
                    }}
                    className="[&_label]:text-xs"
                  />
                  <div>
                    <label className="mb-0.5 block text-xs font-medium text-slate-600">Sector</label>
                    <select
                      ref={lineSectorRef}
                      value={lineSectorId}
                      onChange={(e) => setLineSectorId(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          agregarLineaYContinuar()
                        }
                      }}
                      className="w-full rounded-lg border border-surface-border px-2 py-1.5 text-sm"
                    >
                      <option value="">Seleccionar...</option>
                      {sectores.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2 flex items-end sm:col-span-1">
                    <Button type="button" size="sm" className="w-full" onClick={agregarLineaYContinuar}>
                      <Plus className="h-4 w-4" />
                      Agregar
                    </Button>
                  </div>
                </div>
                {stockDisponible != null && lineSectorId && (
                  <p className="mt-2 text-xs text-slate-600">
                    Disponible en sector:{' '}
                    <strong className={stockDisponible <= 0 ? 'text-red-700' : 'text-slate-800'}>
                      {formatTotalCajas(stockDisponible)}
                    </strong>
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
        <div ref={listScrollRef} className="min-h-0 flex-1 overflow-y-auto bg-white">
          <div className="sticky top-0 border-b bg-white/95 px-4 py-2 backdrop-blur-sm">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-700">Líneas ({lineas.length})</span>
              {lineas.length > 0 && (
                <span className="font-semibold text-brand-700">{formatTotalCajas(totalGeneral)}</span>
              )}
            </div>
          </div>
          {lineasListContent}
        </div>
        <div className="shrink-0 border-t bg-white px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs text-slate-500">Total a descontar</p>
              <p className="text-xl font-bold text-brand-700">{formatTotalCajas(totalGeneral)}</p>
            </div>
            {hasPermiso('roturas.crear') && (
              <Button onClick={() => void confirmarRotura()} disabled={lineas.length === 0 || saving}>
                <Check className="h-4 w-4" />
                {saving ? 'Registrando...' : 'Confirmar y descontar'}
              </Button>
            )}
          </div>
        </div>
        <BarcodeScannerModal
          open={showScanner}
          onClose={() => setShowScanner(false)}
          onScan={(code) => {
            setProductSearch(code)
            setShowScanner(false)
          }}
          title="Escanear producto"
        />
        <ProductQuickCreateModal
          open={showNewProduct}
          onClose={() => setShowNewProduct(false)}
          onCreated={(p) => {
            setShowNewProduct(false)
            selectProduct(p)
          }}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Roturas y pérdidas</h1>
          <p className="mt-1 text-slate-500">
            Descuenta stock por cajas rotas o perdidas
            {hasPermiso('roturas.crear') && ' · Enter = nuevo registro'}
          </p>
        </div>
        {hasPermiso('roturas.crear') && (
          <Button onClick={abrirNuevoRegistro}>
            <Plus className="h-4 w-4" />
            Nuevo registro
          </Button>
        )}
      </div>

      <Card>
        <CardBody className="space-y-3 border-b py-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[10rem] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={listSearchRef}
                type="search"
                placeholder="Buscar por producto u observación... · Enter = nuevo"
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
                onKeyDown={handleListSearchKeyDown}
                className="w-full rounded-lg border border-surface-border py-2 pl-10 pr-3 text-sm"
              />
            </div>
            <div className="flex shrink-0 items-center gap-1.5 rounded-lg border bg-slate-50/60 px-2 py-1">
              <span className="pl-1 text-xs font-medium text-slate-500">Desde</span>
              <input
                type="date"
                value={listFechaDesde}
                onChange={(e) => setListFechaDesde(e.target.value)}
                className="rounded border-0 bg-transparent px-1 py-1 text-sm"
              />
              <span className="text-slate-300">|</span>
              <span className="text-xs font-medium text-slate-500">Hasta</span>
              <input
                type="date"
                value={listFechaHasta}
                onChange={(e) => setListFechaHasta(e.target.value)}
                className="rounded border-0 bg-transparent px-1 py-1 text-sm"
              />
            </div>
            {(listFechaDesde || listFechaHasta) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setListFechaDesde('')
                  setListFechaHasta('')
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          <p className="text-xs text-slate-400">
            Una sola fecha = ese día · las dos = rango
            {hasPermiso('roturas.crear') && ' · Enter = nuevo registro'}
          </p>
          {diasConRoturas.length > 0 && (
            <div className="flex gap-1 overflow-x-auto pb-1">
              {diasConRoturas.map((dia) => {
                const active = dia === selectedDay
                const count = conteoPorDia.get(dia) ?? 0
                return (
                  <button
                    key={dia}
                    type="button"
                    onClick={() => setSelectedDay(dia)}
                    className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                      active
                        ? 'border-brand-500 bg-brand-50 font-semibold text-brand-800'
                        : 'border-surface-border bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span>{formatDayTabLabel(dia)}</span>
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-xs">{count}</span>
                  </button>
                )
              })}
            </div>
          )}
        </CardBody>

        <CardHeader
          title={diasConRoturas.length > 0 ? formatDayTabLabel(selectedDay) : 'Registros'}
          description={
            diasConRoturas.length > 0
              ? `${roturasDelDia.length} registro(s) · ${formatCantidad(totalCajasDelDia)} descontadas en el día`
              : `${roturas.length} registro(s)`
          }
          action={
            diasConRoturas.length > 0 ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={loadingResumen}
                onClick={() => void abrirResumenDia()}
              >
                <List className="h-4 w-4" />
                Productos del día
              </Button>
            ) : undefined
          }
        />

        <CardBody className="p-0">
          {error && (
            <div className="border-b bg-red-50 px-6 py-3 text-sm text-red-700">{error}</div>
          )}
          {loadingList ? (
            <p className="p-6 text-sm text-slate-500">Cargando...</p>
          ) : roturas.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <AlertTriangle className="h-12 w-12 text-slate-300" />
              <p className="mt-3 font-medium text-slate-700">No hay registros</p>
            </div>
          ) : roturasDelDia.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">Sin resultados para este día</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50/80 text-left text-xs font-semibold uppercase text-slate-500">
                    <th className="px-6 py-3">#</th>
                    <th className="px-6 py-3">Observación</th>
                    <th className="px-6 py-3">Total</th>
                    <th className="px-6 py-3">Usuario</th>
                    <th className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {roturasDelDia.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/50">
                      <td className="px-6 py-3 font-medium">{r.id}</td>
                      <td className="px-6 py-3 text-slate-600">{r.observacion ?? '—'}</td>
                      <td className="px-6 py-3 font-semibold text-brand-700">
                        {formatCantidad(r.total_cajas)}
                      </td>
                      <td className="px-6 py-3 text-slate-500">{r.usuario_nombre}</td>
                      <td className="px-6 py-3 text-right">
                        <Button variant="ghost" size="sm" onClick={() => void abrirDetalle(r.id)}>
                          <Eye className="h-4 w-4" />
                          Ver
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {showResumenDia && resumenDia && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setShowResumenDia(false)} />
          <div className="relative z-10 max-h-[85vh] w-full max-w-2xl overflow-auto rounded-xl border bg-white shadow-xl">
            <div className="sticky top-0 flex items-center justify-between border-b bg-white px-5 py-4">
              <div>
                <h3 className="font-semibold text-slate-900">
                  Productos perdidos — {formatDayTabLabel(resumenDia.fecha)}
                </h3>
                <p className="text-sm text-slate-500">
                  {resumenDia.registros} registro(s) · {formatCantidad(resumenDia.total_cajas)} total
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowResumenDia(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5">
              {resumenDia.productos.length === 0 ? (
                <p className="text-sm text-slate-500">Sin productos en este día</p>
              ) : (
                <ul className="divide-y divide-surface-border rounded-lg border">
                  {resumenDia.productos.map((p) => (
                    <li key={p.producto_id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div>
                        <p className="font-mono text-sm font-semibold">{p.codigo_interno}</p>
                        <p className="text-sm text-slate-700">{p.nombre}</p>
                        {p.sectores_count > 1 && (
                          <p className="text-xs text-slate-400">{p.sectores_count} sectores</p>
                        )}
                      </div>
                      <span className="font-semibold text-brand-700">{formatCantidad(p.total_cajas)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
