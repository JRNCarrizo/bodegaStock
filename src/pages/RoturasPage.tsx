import { useLocation } from 'react-router-dom'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Box,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  List,
  Loader2,
  Plus,
  Search,
  Trash2,
  User,
  Warehouse,
  X
} from 'lucide-react'
import { BarcodeScannerModal } from '@/components/BarcodeScannerModal'
import { DayTabsRow } from '@/components/DayTabsRow'
import {
  RegistroDetalleMetaChip,
  RegistroDetalleObsChip,
  RegistroDetallePanel
} from '@/components/RegistroDetallePanel'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardBody } from '@/components/ui/Card'
import { ProductImage } from '@/components/ProductImage'
import { ScrollableProductName } from '@/components/ScrollableProductName'
import { SectionHelpButton } from '@/components/SectionHelpButton'
import { formatCantidad, formatDayTabLabel, formatTotalCajas, todayIsoDate } from '@/lib/desglose'
import { downloadApiFile } from '@/lib/downloadFile'
import { isNativeApp } from '@/lib/nativeServer'
import { searchDelayMs } from '@/lib/searchDelay'
import { KB_HIGHLIGHT_ROW } from '@/lib/listKeyboardHighlight'
import { api, cn } from '@/lib/utils'
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
import { useProductoQuickSearch } from '@/hooks/useProductoQuickSearch'
import { useRegistroListKeyboard } from '@/hooks/useRegistroListKeyboard'
import {
  scrollFocusedFieldIntoSheet,
  useVisualViewportBottomInset
} from '@/hooks/useVisualViewportBottomInset'

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
  const [productHighlightIndex, setProductHighlightIndex] = useState(-1)
  const [selectedProduct, setSelectedProduct] = useState<Producto | null>(null)
  const {
    results: productResults,
    setResults: setProductResults
  } = useProductoQuickSearch(productSearch, {
    enabled: !selectedProduct,
    limit: 12
  })
  const [cantidadCajas, setCantidadCajas] = useState('')
  const [lineSectorId, setLineSectorId] = useState('')
  const [stockDisponible, setStockDisponible] = useState<number | null>(null)
  const [stockPorSector, setStockPorSector] = useState<Record<number, number>>({})
  const [lineas, setLineas] = useState<RoturaLineaDraft[]>([])
  const [expandedProductos, setExpandedProductos] = useState<Set<number>>(new Set())
  const [showScanner, setShowScanner] = useState(false)

  const [showResumenDia, setShowResumenDia] = useState(false)
  const [resumenDia, setResumenDia] = useState<RoturaResumenDia | null>(null)
  const [loadingResumen, setLoadingResumen] = useState(false)
  const [exportingDia, setExportingDia] = useState(false)

  const fechaRef = useRef<HTMLInputElement>(null)
  const observacionRef = useRef<HTMLInputElement>(null)
  const productSearchRef = useRef<HTMLInputElement>(null)
  const cantidadRef = useRef<HTMLInputElement>(null)
  const lineSectorRef = useRef<HTMLSelectElement>(null)
  const listSearchRef = useRef<HTMLInputElement>(null)
  const productResultsListRef = useRef<HTMLUListElement>(null)
  const listScrollRef = useRef<HTMLDivElement>(null)
  const productLineFormRef = useRef<HTMLDivElement>(null)
  const keyboardBridgeRef = useRef<HTMLInputElement>(null)
  const pendingFocusCantidadRef = useRef(false)
  const nativeApp = isNativeApp()
  const keyboardInset = useVisualViewportBottomInset()

  function armKeyboardForCantidadModal() {
    if (!nativeApp) return
    pendingFocusCantidadRef.current = true
    keyboardBridgeRef.current?.focus({ preventScroll: true })
  }

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
      const el = ref.current
      if (!el) return
      el.focus()
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      if (el instanceof HTMLInputElement) {
        requestAnimationFrame(() => el.select())
      }
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
    const timer = setTimeout(() => loadRoturas(), searchDelayMs(listSearch))
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
    setProductHighlightIndex(-1)
    setError('')
  }

  function volverAlListado() {
    resetCreateForm()
    setDetalle(null)
    setShowScanner(false)
    setView('list')
  }

  function volverAlListadoDesdeDetalle() {
    if (detalle) setSelectedDay(detalle.rotura.fecha)
    setDetalle(null)
    setView('list')
    setTimeout(() => listSearchRef.current?.focus({ preventScroll: true }), 80)
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
    if (productResults.length > 0 && !selectedProduct) {
      setProductResults([])
      setProductHighlightIndex(-1)
      return true
    }
    if (selectedProduct) {
      cancelarLineaForm()
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

  function cancelarLineaForm() {
    setSelectedProduct(null)
    setProductSearch('')
    setCantidadCajas('')
    setStockDisponible(null)
    setStockPorSector({})
    setError('')
    setTimeout(() => productSearchRef.current?.focus(), 50)
  }

  function selectProduct(p: Producto) {
    armKeyboardForCantidadModal()
    setSelectedProduct(p)
    setProductSearch(p.codigo_interno)
    setProductResults([])
    setProductHighlightIndex(-1)
    setCantidadCajas('')
    setError('')
    setStockDisponible(null)
    setStockPorSector({})
    if (!nativeApp) {
      setTimeout(() => focusField(cantidadRef), 50)
    }

    void (async () => {
      try {
        const data = await api<{
          sectores: {
            sector_id: number
            sector_nombre: string
            stock_disponible_cajas: number
          }[]
        }>(`/api/roturas/producto/${p.id}/stock-sectores`)

        const map: Record<number, number> = {}
        for (const s of data.sectores) {
          map[s.sector_id] = s.stock_disponible_cajas
        }
        setStockPorSector(map)

        const withStock = data.sectores.filter((s) => s.stock_disponible_cajas > 0)
        const pool = withStock.length > 0 ? withStock : data.sectores
        if (pool.length === 0) {
          if (sectores[0]) setLineSectorId(String(sectores[0].id))
          return
        }
        const best = pool.reduce((a, b) =>
          a.stock_disponible_cajas <= b.stock_disponible_cajas ? a : b
        )
        setLineSectorId(String(best.sector_id))
        setStockDisponible(best.stock_disponible_cajas)
      } catch {
        if (!lineSectorId && sectores[0]) setLineSectorId(String(sectores[0].id))
      }
    })()
  }

  useEffect(() => {
    if (!nativeApp || !selectedProduct || !pendingFocusCantidadRef.current) return
    pendingFocusCantidadRef.current = false
    const id = window.requestAnimationFrame(() => {
      focusField(cantidadRef)
      scrollFocusedFieldIntoSheet(cantidadRef.current, 0)
    })
    return () => window.cancelAnimationFrame(id)
  }, [nativeApp, selectedProduct])

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
    setSelectedProduct(null)
    setProductSearch('')
    setCantidadCajas('')
    setStockDisponible(null)
    setStockPorSector({})
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

  const registroListKb = useRegistroListKeyboard({
    enabled: view === 'list' && !showResumenDia,
    items: roturasDelDia,
    listSearchRef,
    canCreate: hasPermiso('roturas.crear'),
    onCreate: abrirNuevoRegistro,
    onOpenDetail: (r) => {
      void abrirDetalle(r.id)
    }
  })

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

  async function exportarDia(fechaDia: string = selectedDay) {
    setExportingDia(true)
    setError('')
    try {
      await downloadApiFile(
        `/api/roturas/export-dia?fecha=${encodeURIComponent(fechaDia)}`,
        `roturas-${fechaDia}.xlsx`
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al exportar')
    } finally {
      setExportingDia(false)
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
      <RegistroDetallePanel
        onVolver={volverAlListadoDesdeDetalle}
        titulo={`Rotura #${detalle.rotura.id}`}
        fecha={detalle.rotura.fecha}
        totalEtiqueta="Total"
        total={detalle.total_cajas}
        encabezadoExtra={
          <span
            className={cn(
              'inline-flex items-center rounded-full font-medium text-red-800 ring-1 ring-red-100 bg-red-50',
              nativeApp ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-xs'
            )}
          >
            Descuento
          </span>
        }
        encabezadoSubline={
          nativeApp ? (
            <span className="inline-flex max-w-[12rem] items-center gap-1 text-[11px] text-slate-500">
              <User className="h-3 w-3 shrink-0 text-slate-400" />
              <span className="truncate">{detalle.rotura.usuario_nombre}</span>
            </span>
          ) : undefined
        }
        meta={
          <>
            {!nativeApp && (
              <RegistroDetalleMetaChip icon={<User className="h-3.5 w-3.5 shrink-0 text-slate-400" />}>
                {detalle.rotura.usuario_nombre}
              </RegistroDetalleMetaChip>
            )}
            {detalle.rotura.observacion && (
              <RegistroDetalleObsChip>{detalle.rotura.observacion}</RegistroDetalleObsChip>
            )}
          </>
        }
        antesProductos={
          error ? (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          ) : undefined
        }
        lineas={detalle.lineas.map((l) => ({
          id: l.id,
          producto_id: l.producto_id,
          codigo_interno: l.codigo_interno,
          nombre: l.nombre,
          etiqueta: l.sector_nombre,
          cantidad: l.cantidad_cajas
        }))}
      />
    )
  }

  if (view === 'create' && createPhase === 'datos') {
    return (
      <div className="-m-4 h-[calc(100vh-5rem)] overflow-y-auto lg:-m-6">
        <div className="mx-auto flex max-w-lg flex-col gap-5 px-4 py-6 pb-16 lg:px-6">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 h-9 self-start rounded-xl px-3"
            onClick={volverAlListado}
          >
            <ChevronLeft className="h-4 w-4" />
            Volver al listado
          </Button>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Alta</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Rotura / pérdida</h1>
            <p className="mt-1 text-sm text-slate-500">
              Descuenta stock por cajas rotas o perdidas · Enter avanza · Esc vuelve al listado
            </p>
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-100">
              {error}
            </div>
          )}

          <Card className="overflow-hidden shadow-panel">
            <div className="border-b border-red-100 bg-gradient-to-r from-red-50/80 via-white to-white px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-600 text-white shadow-sm">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Datos del registro</p>
                  <p className="text-xs text-slate-500">Fecha y observación del motivo</p>
                </div>
              </div>
            </div>
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
              <Button type="button" className="w-full rounded-xl" onClick={avanzarACarga}>
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
        <div className="flex h-full min-h-[140px] flex-col items-center justify-center px-6 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-400">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <p className="mt-3 text-sm font-medium text-slate-600">Sin líneas cargadas</p>
          <p className="mt-1 text-xs text-slate-500">Los productos que agregues aparecen acá</p>
        </div>
      ) : (
        lineasPorProducto.map((grupo) => {
          const isExpanded = expandedProductos.has(grupo.producto.producto_id)
          return (
            <div key={grupo.producto.producto_id} className="border-b border-surface-border last:border-0">
              <div
                className={cn(
                  'flex gap-3 px-4 py-2.5 transition-colors sm:px-5',
                  nativeApp ? 'items-start' : 'items-center',
                  isExpanded ? 'bg-red-50/50' : 'hover:bg-slate-50/80'
                )}
              >
                <button
                  type="button"
                  onClick={() => toggleProductoExpand(grupo.producto.producto_id)}
                  className={cn(
                    'shrink-0 rounded-lg p-1.5 transition-colors',
                    isExpanded
                      ? 'bg-red-100 text-red-700'
                      : 'text-slate-400 hover:bg-slate-200 hover:text-slate-700'
                  )}
                  aria-expanded={isExpanded}
                  aria-label={isExpanded ? 'Ocultar líneas' : 'Ver líneas'}
                >
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                {nativeApp ? (
                  <button
                    type="button"
                    onClick={() => toggleProductoExpand(grupo.producto.producto_id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="inline-flex max-w-[70%] truncate rounded-md bg-brand-600 px-2 py-0.5 font-mono text-xs font-bold tracking-wide text-white shadow-sm">
                        {grupo.producto.codigo_interno}
                      </span>
                      <span className="inline-flex shrink-0 items-center rounded-lg bg-red-50 px-2.5 py-1.5 text-sm font-bold tabular-nums text-red-700 ring-1 ring-red-100">
                        {formatCantidad(grupo.total)}
                      </span>
                    </div>
                    <ScrollableProductName className="mt-1 block w-full text-sm font-semibold text-slate-900">
                      {grupo.producto.nombre}
                    </ScrollableProductName>
                    {!isExpanded && grupo.lineas.length > 1 && (
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {grupo.lineas.length} líneas
                      </span>
                    )}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => toggleProductoExpand(grupo.producto.producto_id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">
                        {grupo.producto.codigo_interno}
                      </span>
                      <span className="min-w-0 truncate text-sm font-semibold text-slate-900">
                        {grupo.producto.nombre}
                      </span>
                      {!isExpanded && grupo.lineas.length > 1 && (
                        <span className="shrink-0 text-xs text-slate-500">
                          · {grupo.lineas.length} líneas
                        </span>
                      )}
                    </button>
                    <span className="inline-flex shrink-0 items-center rounded-lg bg-red-50 px-2.5 py-1.5 text-sm font-bold tabular-nums text-red-700 ring-1 ring-red-100">
                      {formatCantidad(grupo.total)}
                    </span>
                  </>
                )}
              </div>
              {isExpanded && (
                <ul className="space-y-2 border-t border-red-100/80 bg-gradient-to-b from-surface-muted/40 to-white px-4 py-3 sm:px-5">
                  {grupo.lineas.map((l) => (
                    <li
                      key={l.tempId}
                      className="flex items-center justify-between gap-3 rounded-lg border border-surface-border bg-white px-3 py-2.5 text-sm"
                    >
                      <div className="min-w-0 text-slate-800">
                        {formatCantidad(l.cantidad_cajas)}
                        {!nativeApp && (
                          <>
                            {' · '}
                            {l.sector_nombre}
                          </>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {nativeApp && (
                          <span className="inline-flex max-w-[8rem] items-center gap-1 truncate text-xs font-medium text-slate-600">
                            <Warehouse className="h-3 w-3 shrink-0 text-slate-400" />
                            {l.sector_nombre}
                          </span>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="rounded-lg"
                          onClick={() => quitarLinea(l.tempId)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })
      )

    return (
      <div
        className={cn(
          'flex flex-col bg-surface-muted/30',
          nativeApp
            ? 'fixed inset-x-0 bottom-0 top-14 z-10'
            : '-m-4 h-[calc(100vh-5rem)] lg:-m-6'
        )}
      >
        <div className="relative z-20 shrink-0 overflow-visible border-b border-surface-border bg-white shadow-sm">
          <div className="border-b border-red-100 bg-gradient-to-r from-red-50/80 via-white to-white px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <Button variant="ghost" size="sm" className="-ml-2 h-8 rounded-lg px-2" onClick={volverAlListado}>
                <ChevronLeft className="h-3.5 w-3.5" />
                Salir
              </Button>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-white px-2.5 py-1 font-medium text-slate-700 ring-1 ring-surface-border">
                  {fecha}
                </span>
                {observacion.trim() && (
                  <span
                    className="max-w-xs truncate rounded-full bg-white px-2.5 py-1 font-medium text-slate-700 ring-1 ring-surface-border"
                    title={observacion.trim()}
                  >
                    {observacion.trim()}
                  </span>
                )}
              </div>
              <button
                type="button"
                className="ml-auto text-xs font-medium text-brand-600 hover:text-brand-700 hover:underline"
                onClick={() => setCreatePhase('datos')}
              >
                Editar datos
              </button>
            </div>
          </div>
          {error && (
            <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700 sm:px-5">{error}</div>
          )}
          <div className={cn('space-y-3 overflow-visible', nativeApp ? 'p-3' : 'p-4 sm:p-5')}>
            <div className="relative flex flex-col gap-2 overflow-visible sm:flex-row">
              <div className="relative z-30 min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400" />
                <input
                  ref={productSearchRef}
                  type="search"
                  role="combobox"
                  aria-expanded={productResults.length > 0 && !selectedProduct}
                  placeholder={
                    nativeApp
                      ? 'Buscar producto...'
                      : 'Buscar producto — ↑↓ navegar · Enter seleccionar'
                  }
                  value={productSearch}
                  onChange={(e) => {
                    setProductSearch(e.target.value)
                    setProductHighlightIndex(-1)
                    if (selectedProduct && e.target.value !== selectedProduct.codigo_interno) {
                      setSelectedProduct(null)
                    }
                  }}
                  onKeyDown={handleProductSearchKeyDown}
                  className="w-full rounded-xl border border-surface-border bg-white py-2.5 pl-10 pr-3 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
                {productResults.length > 0 && !selectedProduct && (
                  <ul
                    ref={productResultsListRef}
                    role="listbox"
                    className="absolute z-50 mt-1 max-h-52 w-full overflow-auto rounded-xl border border-surface-border bg-white py-1 shadow-panel"
                  >
                    {productResults.map((p, index) => (
                      <li key={p.id} role="option" aria-selected={index === productHighlightIndex}>
                        <button
                          type="button"
                          className={cn(
                            'flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm',
                            index === productHighlightIndex ? KB_HIGHLIGHT_ROW : 'hover:bg-slate-50'
                          )}
                          onMouseEnter={() => setProductHighlightIndex(index)}
                          onPointerDown={armKeyboardForCantidadModal}
                          onClick={() => selectProduct(p)}
                        >
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-semibold">
                            {p.codigo_interno}
                          </span>
                          <span className="truncate text-slate-600">{p.nombre}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="shrink-0 rounded-xl"
                onClick={() => setShowScanner(true)}
              >
                <Camera className="h-4 w-4" />
                Escanear
              </Button>
            </div>

            {nativeApp && (
              <input
                ref={keyboardBridgeRef}
                type="text"
                inputMode="numeric"
                enterKeyHint="done"
                aria-hidden
                tabIndex={-1}
                className="pointer-events-none fixed left-0 top-0 h-px w-px opacity-0"
                value=""
                onChange={() => {}}
              />
            )}

            {selectedProduct && (
              <>
                {nativeApp && (
                  <div
                    className="fixed inset-0 z-40 bg-slate-900/45"
                    aria-hidden
                    onClick={cancelarLineaForm}
                  />
                )}
                <div
                  ref={productLineFormRef}
                  className={cn(
                    nativeApp
                      ? 'fixed inset-x-0 z-50 mx-auto w-full max-w-3xl overflow-y-auto overscroll-contain rounded-t-2xl border-2 border-b-0 border-red-400 bg-white p-4 shadow-[0_-12px_40px_rgba(15,23,42,0.25)] ring-4 ring-red-500/15 transition-[bottom,max-height] duration-200 ease-out'
                      : 'overflow-hidden rounded-xl border border-red-200 bg-gradient-to-br from-red-50/80 to-white p-4 shadow-card'
                  )}
                  style={
                    nativeApp
                      ? {
                          bottom: keyboardInset,
                          maxHeight: `calc(100dvh - ${keyboardInset}px - env(safe-area-inset-top, 0px) - 0.5rem)`
                        }
                      : undefined
                  }
                >
                  <div className="mb-4 flex items-center gap-3">
                    {!nativeApp && (
                      <ProductImage
                        productoId={selectedProduct.id}
                        hasImage={!!selectedProduct.imagen_path}
                        alt={selectedProduct.nombre}
                        className="h-11 w-11 rounded-xl ring-1 ring-surface-border"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'inline-flex rounded-md px-2 py-0.5 font-mono text-xs font-bold tracking-wide',
                            nativeApp
                              ? 'bg-brand-600 text-white shadow-sm'
                              : 'bg-white font-semibold text-slate-700 ring-1 ring-surface-border'
                          )}
                        >
                          {selectedProduct.codigo_interno}
                        </span>
                        <p className="ml-auto shrink-0 text-[10px] font-semibold uppercase tracking-wide text-red-600">
                          Nueva línea
                        </p>
                      </div>
                      <ScrollableProductName className="mt-1 text-sm font-semibold text-slate-900">
                        {selectedProduct.nombre}
                      </ScrollableProductName>
                    </div>
                    <button
                      type="button"
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-600"
                      onClick={cancelarLineaForm}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-3">
                    <div className="w-full sm:w-[7.75rem] sm:shrink-0">
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
                        placeholder="1"
                        leading={<Box className="h-4 w-4 text-amber-600" aria-hidden />}
                        className="[&_label]:text-xs"
                      />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1.5 sm:max-w-[16rem]">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                        <Warehouse className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                        Sector
                        {!nativeApp && (
                          <span className="font-normal text-slate-400">
                            (default: el de menos stock)
                          </span>
                        )}
                      </label>
                      <div className="relative">
                        <div className="pointer-events-none absolute inset-y-0 left-0 z-[1] flex items-center pl-2.5 text-slate-400">
                          <Warehouse className="h-4 w-4" aria-hidden />
                        </div>
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
                          className="w-full rounded-lg border border-surface-border bg-white py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                        >
                          <option value="">Seleccionar...</option>
                          {sectores.map((s) => {
                            const stock = stockPorSector[s.id]
                            return (
                              <option key={s.id} value={s.id}>
                                {s.nombre}
                                {stock != null ? ` (${formatCantidad(stock)})` : ''}
                              </option>
                            )
                          })}
                        </select>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-end sm:ml-auto">
                      <Button
                        type="button"
                        size="sm"
                        className="h-[2.625rem] w-full rounded-xl sm:w-auto sm:min-w-[7.5rem]"
                        onClick={agregarLineaYContinuar}
                      >
                        <Plus className="h-4 w-4" />
                        Agregar ↵
                      </Button>
                    </div>
                  </div>

                  {stockDisponible != null && lineSectorId && (
                    <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
                      <span className="inline-flex items-center gap-1">
                        <Warehouse className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                        Disponible en sector:
                      </span>
                      <strong
                        className={cn(
                          'inline-flex items-center gap-1 tabular-nums',
                          stockDisponible <= 0 ? 'text-red-700' : 'text-slate-800'
                        )}
                      >
                        {stockDisponible <= 0 && (
                          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                        )}
                        {formatTotalCajas(stockDisponible)}
                      </strong>
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        <div ref={listScrollRef} className="relative z-0 min-h-0 flex-1 overflow-y-auto bg-white">
          {lineasListContent}
        </div>
        <div
          className={cn(
            'shrink-0 border-t border-surface-border bg-white shadow-[0_-4px_12px_rgba(0,0,0,0.04)]',
            nativeApp ? 'px-3 pt-3 pb-3' : 'px-4 py-4 sm:px-5'
          )}
        >
          {nativeApp ? (
            <div className="space-y-3">
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Total a descontar
                  </p>
                  <p className="text-xl font-bold tabular-nums text-red-700">
                    {formatCantidad(totalGeneral)}
                  </p>
                </div>
                <p className="shrink-0 text-xs text-slate-500">
                  {lineas.length} línea{lineas.length === 1 ? '' : 's'}
                </p>
              </div>
              {hasPermiso('roturas.crear') && (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="secondary"
                    className="h-11 rounded-xl"
                    onClick={volverAlListado}
                    disabled={saving}
                  >
                    Cancelar
                  </Button>
                  <Button
                    className="h-11 rounded-xl"
                    onClick={() => void confirmarRotura()}
                    disabled={lineas.length === 0 || saving}
                  >
                    <Check className="h-4 w-4" />
                    {saving ? '…' : 'Confirmar'}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total a descontar</p>
                <p className="text-2xl font-bold tabular-nums text-red-700">{formatCantidad(totalGeneral)}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {lineas.length} línea{lineas.length === 1 ? '' : 's'} cargada
                  {lineas.length === 1 ? '' : 's'}
                </p>
              </div>
              {hasPermiso('roturas.crear') && (
                <Button
                  className="rounded-xl"
                  onClick={() => void confirmarRotura()}
                  disabled={lineas.length === 0 || saving}
                >
                  <Check className="h-4 w-4" />
                  {saving ? 'Registrando...' : 'Confirmar y descontar'}
                </Button>
              )}
            </div>
          )}
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
      </div>
    )
  }

  return (
    <div className={cn('mx-auto max-w-6xl', nativeApp ? '-mt-1 space-y-3' : 'space-y-6')}>
      {nativeApp ? (
        <div className="flex items-center gap-3">
          <h1 className="min-w-0 flex-1 truncate text-xl font-bold tracking-tight text-slate-900">
            Roturas
          </h1>
          {hasPermiso('roturas.crear') && (
            <Button className="h-10 shrink-0 rounded-xl px-3" onClick={abrirNuevoRegistro}>
              <Plus className="h-4 w-4" />
              Nuevo
            </Button>
          )}
        </div>
      ) : (
        <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Movimientos</p>
            <div className="mt-1 flex items-center gap-1.5">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Roturas y pérdidas
              </h1>
              <SectionHelpButton guideId="roturas" />
            </div>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-500">
              Descuenta stock por cajas rotas o perdidas, con registro por día.
            </p>
          </div>
          {hasPermiso('roturas.crear') && (
            <div className="flex flex-wrap items-center gap-2">
              <Button className="rounded-xl px-4" onClick={abrirNuevoRegistro}>
                <Plus className="h-4 w-4" />
                Nuevo registro
              </Button>
            </div>
          )}
        </section>
      )}

      <Card className="overflow-hidden shadow-panel">
        <div
          className={cn(
            'border-b border-red-100 bg-gradient-to-r from-red-50/60 via-white to-white sm:px-6',
            nativeApp ? 'px-3 py-2.5' : 'px-5 py-4'
          )}
        >
          <div className={cn('flex flex-col', nativeApp ? 'gap-2' : 'gap-3')}>
            <div className={cn('flex gap-2', nativeApp ? 'flex-col' : 'flex-wrap items-center')}>
              <div className={cn('relative flex-1', nativeApp ? 'min-w-0' : 'min-w-[10rem]')}>
                <Search
                  className={cn(
                    'pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400',
                    nativeApp ? 'left-3' : 'left-3.5'
                  )}
                />
                <input
                  ref={listSearchRef}
                  type="search"
                  placeholder="Buscar por producto u observación..."
                  value={listSearch}
                  onChange={(e) => setListSearch(e.target.value)}
                  onKeyDown={registroListKb.handleListSearchKeyDown}
                  className={cn(
                    'w-full rounded-xl border border-surface-border bg-white text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20',
                    nativeApp ? 'py-2 pl-9 pr-3' : 'py-2.5 pl-10 pr-4'
                  )}
                />
              </div>
              <div
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-xl border border-surface-border bg-white shadow-sm',
                  nativeApp ? 'w-full justify-between px-2 py-1' : 'px-2 py-1.5'
                )}
              >
                <span
                  className={cn(
                    'font-medium text-slate-500',
                    nativeApp ? 'pl-0.5 text-[11px]' : 'pl-1 text-xs'
                  )}
                >
                  Desde
                </span>
                <input
                  type="date"
                  value={listFechaDesde}
                  onChange={(e) => setListFechaDesde(e.target.value)}
                  className={cn(
                    'rounded border-0 bg-transparent px-1 py-1 text-sm focus:outline-none focus:ring-0',
                    nativeApp && 'min-w-0 flex-1'
                  )}
                />
                <span className="text-slate-300">|</span>
                <span
                  className={cn(
                    'font-medium text-slate-500',
                    nativeApp ? 'text-[11px]' : 'text-xs'
                  )}
                >
                  Hasta
                </span>
                <input
                  type="date"
                  value={listFechaHasta}
                  onChange={(e) => setListFechaHasta(e.target.value)}
                  className={cn(
                    'rounded border-0 bg-transparent px-1 py-1 text-sm focus:outline-none focus:ring-0',
                    nativeApp && 'min-w-0 flex-1'
                  )}
                />
                {nativeApp && (listFechaDesde || listFechaHasta) && (
                  <button
                    type="button"
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    onClick={() => {
                      setListFechaDesde('')
                      setListFechaHasta('')
                    }}
                    aria-label="Limpiar fechas"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {!nativeApp && (listFechaDesde || listFechaHasta) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 rounded-lg"
                  onClick={() => {
                    setListFechaDesde('')
                    setListFechaHasta('')
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            {!nativeApp && (
              <p className="text-xs text-slate-500">
                Una sola fecha filtra ese día · las dos juntas = rango
              </p>
            )}
            <DayTabsRow
              days={diasConRoturas}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
              getCount={(dia) => conteoPorDia.get(dia) ?? 0}
            />
          </div>
        </div>

        <div
          className={cn(
            'flex items-center justify-between gap-3 border-b border-surface-border bg-slate-50/80 sm:px-6',
            nativeApp ? 'px-3 py-2.5' : 'px-5 py-3.5'
          )}
        >
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900">
              {diasConRoturas.length > 0 ? formatDayTabLabel(selectedDay) : 'Registros'}
            </h2>
            <p className="text-xs text-slate-500">
              {diasConRoturas.length > 0
                ? `${roturasDelDia.length} registro(s) · ${formatCantidad(totalCajasDelDia)} descontadas en el día`
                : `${roturas.length} registro(s)`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {loadingList && <Loader2 className="h-5 w-5 shrink-0 animate-spin text-brand-600" />}
            {diasConRoturas.length > 0 && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  className={cn('rounded-lg', nativeApp && 'h-8 px-2.5 text-xs')}
                  disabled={exportingDia}
                  onClick={() => void exportarDia()}
                  title="Exportar Excel de productos del día"
                >
                  {exportingDia ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Exportar
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className={cn('rounded-lg', nativeApp && 'h-8 px-2.5 text-xs')}
                  disabled={loadingResumen}
                  onClick={() => void abrirResumenDia()}
                >
                  <List className="h-4 w-4" />
                  {nativeApp ? 'Productos' : 'Productos del día'}
                </Button>
              </>
            )}
          </div>
        </div>

        <CardBody className={cn(nativeApp ? 'bg-surface-muted/35 p-2' : 'p-0')}>
          {error && (
            <div
              className={cn(
                'text-sm text-red-700',
                nativeApp
                  ? 'mb-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3'
                  : 'border-b border-red-100 bg-red-50 px-6 py-3'
              )}
            >
              {error}
            </div>
          )}
          {loadingList ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
              Cargando registros...
            </div>
          ) : roturas.length === 0 ? (
            <div
              className={cn(
                'flex flex-col items-center px-6 py-14 text-center',
                nativeApp && 'rounded-xl border border-dashed border-surface-border bg-white shadow-card'
              )}
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-400">
                <AlertTriangle className="h-7 w-7" />
              </div>
              <p className="mt-4 text-sm font-medium text-slate-700">
                {listSearch || listFechaDesde || listFechaHasta
                  ? 'No hay registros con esos filtros'
                  : 'No hay registros de roturas'}
              </p>
              {!nativeApp && (
                <p className="mt-1 max-w-sm text-xs text-slate-500">
                  {listSearch || listFechaDesde || listFechaHasta
                    ? 'Probá ampliar el rango de fechas o cambiar la búsqueda'
                    : 'Registrá la primera rotura o pérdida para descontar stock'}
                </p>
              )}
              {!(listSearch || listFechaDesde || listFechaHasta) &&
                hasPermiso('roturas.crear') &&
                !nativeApp && (
                  <Button className="mt-4 rounded-xl" size="sm" onClick={abrirNuevoRegistro}>
                    <Plus className="h-4 w-4" />
                    Nuevo registro
                  </Button>
                )}
            </div>
          ) : roturasDelDia.length === 0 ? (
            <div
              className={cn(
                'flex flex-col items-center px-6 py-14 text-center',
                nativeApp && 'rounded-xl border border-dashed border-surface-border bg-white shadow-card'
              )}
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <AlertTriangle className="h-7 w-7" />
              </div>
              <p className="mt-4 text-sm font-medium text-slate-700">Sin resultados para este día</p>
              {!nativeApp && (
                <p className="mt-1 text-xs text-slate-500">Probá otra fecha o ajustá la búsqueda</p>
              )}
            </div>
          ) : nativeApp ? (
            <ul className="space-y-2">
              {roturasDelDia.map((r, index) => (
                <li
                  key={r.id}
                  {...registroListKb.listItemProps(
                    index,
                    'overflow-hidden rounded-xl border border-surface-border bg-white shadow-card border-l-4 border-l-red-400'
                  )}
                >
                  <button
                    type="button"
                    className="flex w-full items-start gap-3 px-3 py-3 text-left active:bg-slate-50"
                    onClick={() => void abrirDetalle(r.id)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">Rotura #{r.id}</p>
                      {r.observacion?.trim() ? (
                        <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500">{r.observacion}</p>
                      ) : null}
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                        <span>
                          {r.lineas_count} línea{r.lineas_count === 1 ? '' : 's'}
                        </span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {r.usuario_nombre}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end justify-center">
                      <span className="inline-flex items-center rounded-lg bg-red-50 px-2.5 py-1 text-sm font-bold tabular-nums text-red-700 ring-1 ring-red-100">
                        {formatCantidad(r.total_cajas)}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="divide-y divide-surface-border">
              {roturasDelDia.map((r, index) => (
                <li
                  key={r.id}
                  {...registroListKb.listItemProps(
                    index,
                    'flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-slate-50/80 sm:flex-row sm:items-center sm:gap-4 sm:px-6'
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold text-slate-900">Rotura #{r.id}</p>
                      <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-800 ring-1 ring-red-100">
                        Descuento aplicado
                      </span>
                    </div>
                    {r.observacion?.trim() ? (
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">{r.observacion}</p>
                    ) : (
                      <p className="mt-1 text-xs text-slate-400">Sin observación</p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span>{r.lineas_count} línea{r.lineas_count === 1 ? '' : 's'}</span>
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {r.usuario_nombre}
                      </span>
                    </div>
                  </div>
                  <div className="flex w-full shrink-0 items-center gap-1.5 sm:w-auto sm:gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="rounded-lg !px-2 !py-2"
                      onClick={() => void abrirDetalle(r.id)}
                      title="Ver detalle"
                      aria-label="Ver detalle"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <span className="ml-auto inline-flex min-w-[3rem] items-center justify-center rounded-lg bg-red-50 px-2.5 py-1.5 text-sm font-bold tabular-nums text-red-700 ring-1 ring-red-100 sm:ml-2">
                      {formatCantidad(r.total_cajas)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {showResumenDia && resumenDia && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setShowResumenDia(false)} />
          <div className="relative z-10 max-h-[85vh] w-full max-w-2xl overflow-auto rounded-xl border border-surface-border bg-white shadow-xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-surface-border bg-white px-5 py-4">
              <div>
                <h3 className="font-semibold text-slate-900">
                  Productos perdidos — {formatDayTabLabel(resumenDia.fecha)}
                </h3>
                <p className="text-sm text-slate-500">
                  {resumenDia.registros} registro(s) · {formatCantidad(resumenDia.total_cajas)} total
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="rounded-lg"
                  disabled={exportingDia}
                  onClick={() => void exportarDia(resumenDia.fecha)}
                >
                  {exportingDia ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Exportar
                </Button>
                <button
                  type="button"
                  onClick={() => setShowResumenDia(false)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="p-5">
              {resumenDia.productos.length === 0 ? (
                <p className="text-sm text-slate-500">Sin productos en este día</p>
              ) : (
                <ul className="divide-y divide-surface-border rounded-xl border border-surface-border">
                  {resumenDia.productos.map((p) => (
                    <li key={p.producto_id} className="flex items-center justify-between gap-3 px-4 py-3.5">
                      <div>
                        <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">
                          {p.codigo_interno}
                        </span>
                        <p className="mt-1 text-sm font-medium text-slate-900">{p.nombre}</p>
                        {p.sectores_count > 1 && (
                          <p className="text-xs text-slate-500">{p.sectores_count} sectores</p>
                        )}
                      </div>
                      <span className="inline-flex rounded-lg bg-red-50 px-2.5 py-1.5 text-sm font-bold tabular-nums text-red-700 ring-1 ring-red-100">
                        {formatCantidad(p.total_cajas)}
                      </span>
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
