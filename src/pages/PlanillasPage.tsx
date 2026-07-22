import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  Eye,
  Loader2,
  Plus,
  Search,
  Trash2,
  Truck,
  User,
  X
} from 'lucide-react'
import { DayTabsRow } from '@/components/DayTabsRow'
import {
  RegistroDetalleMetaChip,
  RegistroDetalleObsChip,
  RegistroDetallePanel
} from '@/components/RegistroDetallePanel'
import { ProductImage } from '@/components/ProductImage'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardBody } from '@/components/ui/Card'
import {
  formatCantidad,
  formatDayTabLabel,
  formatPlanillaEtiqueta,
  normalizarUnidadProducto,
  todayIsoDate,
  type ModoSalidaPlanilla
} from '@/lib/desglose'
import { downloadApiFile } from '@/lib/downloadFile'
import { api, cn } from '@/lib/utils'
import type {
  Camionero,
  CamioneroVehiculo,
  PlanillaDetalle,
  PlanillaLineaDraft,
  PlanillaListItem,
  PlanillaPreviewLinea,
  Producto
} from '@/types'
import { useAuth } from '@/context/AuthContext'
import { useEscHandler } from '@/hooks/useEscHandler'
import { useRegistroListKeyboard } from '@/hooks/useRegistroListKeyboard'

function newTempId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function PlanillasPage() {
  const { hasPermiso } = useAuth()
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list')
  const [planillas, setPlanillas] = useState<PlanillaListItem[]>([])
  const [detalle, setDetalle] = useState<PlanillaDetalle | null>(null)
  const [listSearch, setListSearch] = useState('')
  const [listFechaDesde, setListFechaDesde] = useState('')
  const [listFechaHasta, setListFechaHasta] = useState('')
  const [selectedDay, setSelectedDay] = useState(() => todayIsoDate())
  const [loadingList, setLoadingList] = useState(true)
  const [error, setError] = useState('')
  const [exportingId, setExportingId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  const [fecha, setFecha] = useState(todayIsoDate())
  const [numero, setNumero] = useState('')
  const [observacion, setObservacion] = useState('')
  const [camioneroId, setCamioneroId] = useState('')
  const [vehiculoId, setVehiculoId] = useState('')
  const [camioneros, setCamioneros] = useState<Camionero[]>([])
  const [vehiculos, setVehiculos] = useState<CamioneroVehiculo[]>([])

  const [productSearch, setProductSearch] = useState('')
  const [productResults, setProductResults] = useState<Producto[]>([])
  const [productHighlightIndex, setProductHighlightIndex] = useState(-1)
  const [selectedProduct, setSelectedProduct] = useState<Producto | null>(null)
  const [lineas, setLineas] = useState<PlanillaLineaDraft[]>([])

  const [modoSalida, setModoSalida] = useState<ModoSalidaPlanilla>('CAJA')
  const [cantidad, setCantidad] = useState('')
  const [productoRefs, setProductoRefs] = useState<{
    stock_disponible: number
    stock_disponible_cajas: number
    stock_disponible_botellas: number
    referencias_bulto: Array<{ tipo_bulto: 'PALLET' | 'CAJA'; unidades_por_bulto: number }>
    unidades_por_pallet_default: number | null
    unidades_por_caja_default: number | null
  } | null>(null)

  const [showPreview, setShowPreview] = useState(false)
  const [previewData, setPreviewData] = useState<PlanillaPreviewLinea[] | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [createPhase, setCreatePhase] = useState<'datos' | 'carga'>('datos')
  const [expandedProductos, setExpandedProductos] = useState<Set<number>>(new Set())

  const fechaRef = useRef<HTMLInputElement>(null)
  const numeroRef = useRef<HTMLInputElement>(null)
  const camioneroRef = useRef<HTMLSelectElement>(null)
  const vehiculoRef = useRef<HTMLSelectElement>(null)
  const observacionRef = useRef<HTMLInputElement>(null)
  const productSearchRef = useRef<HTMLInputElement>(null)
  const productResultsListRef = useRef<HTMLUListElement>(null)
  const tipoRef = useRef<HTMLSelectElement>(null)
  const cantidadRef = useRef<HTMLInputElement>(null)
  const listScrollRef = useRef<HTMLDivElement>(null)
  const listSearchRef = useRef<HTMLInputElement>(null)
  const createScrollRef = useRef<HTMLDivElement>(null)
  const cargaPanelRef = useRef<HTMLDivElement>(null)
  const productLineFormRef = useRef<HTMLDivElement>(null)

  const camioneroSeleccionado = camioneros.find((c) => c.id === Number(camioneroId))
  const vehiculoSeleccionado = vehiculos.find((v) => v.id === Number(vehiculoId))

  function focusField(ref: React.RefObject<HTMLElement | null>) {
    requestAnimationFrame(() => {
      const el = ref.current
      if (!el) return
      el.focus()
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
  }

  function scrollFieldIntoView(ref: React.RefObject<HTMLElement | null>) {
    requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
  }

  function abrirNuevaPlanilla() {
    resetCreateForm()
    setView('create')
  }

  useEffect(() => {
    if (view !== 'list') return
    const timer = setTimeout(() => listSearchRef.current?.focus(), 80)
    return () => clearTimeout(timer)
  }, [view])

  function scrollListToBottom() {
    requestAnimationFrame(() => {
      const el = listScrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
  }

  useLayoutEffect(() => {
    if (createPhase === 'carga' && lineas.length > 0) scrollListToBottom()
  }, [lineas.length, createPhase])

  useEffect(() => {
    setProductHighlightIndex(-1)
  }, [productResults])

  useLayoutEffect(() => {
    if (productHighlightIndex < 0) return
    const list = productResultsListRef.current
    if (!list) return
    const item = list.children[productHighlightIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [productHighlightIndex])

  const loadPlanillas = useCallback(async () => {
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
      const data = await api<PlanillaListItem[]>(`/api/planillas?${params}`)
      setPlanillas(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar planillas')
    } finally {
      setLoadingList(false)
    }
  }, [listSearch, listFechaDesde, listFechaHasta])

  useEffect(() => {
    if (view !== 'list') return
    const timer = setTimeout(() => loadPlanillas(), 300)
    return () => clearTimeout(timer)
  }, [view, listSearch, listFechaDesde, listFechaHasta, loadPlanillas])

  useEffect(() => {
    if (listFechaDesde && !listFechaHasta) setSelectedDay(listFechaDesde)
    else if (listFechaHasta && !listFechaDesde) setSelectedDay(listFechaHasta)
    else if (listFechaDesde && listFechaHasta && listFechaDesde === listFechaHasta) {
      setSelectedDay(listFechaDesde)
    }
  }, [listFechaDesde, listFechaHasta])

  useEffect(() => {
    api<Camionero[]>('/api/camioneros?activo=1').then(setCamioneros).catch(() => {})
  }, [])

  useEffect(() => {
    if (!camioneroId) {
      setVehiculos([])
      setVehiculoId('')
      return
    }
    api<CamioneroVehiculo[]>(`/api/camioneros/${camioneroId}/vehiculos`)
      .then((data) => setVehiculos(data.filter((v) => v.activo)))
      .catch(() => setVehiculos([]))
  }, [camioneroId])

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
        setProductResults(data.slice(0, 12))
      } catch {
        setProductResults([])
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [productSearch])

  useEffect(() => {
    if (view === 'create' && createPhase === 'datos') {
      setTimeout(() => focusField(fechaRef), 50)
    }
  }, [view, createPhase])

  useEffect(() => {
    if (view === 'create' && createPhase === 'carga') {
      setTimeout(() => focusField(productSearchRef), 50)
    }
  }, [view, createPhase])

  useLayoutEffect(() => {
    if (view !== 'create' || createPhase !== 'carga' || !selectedProduct) return
    scrollFieldIntoView(productLineFormRef)
  }, [view, createPhase, selectedProduct])

  const diasConPlanillas = useMemo(() => {
    const dias = new Set<string>()
    for (const p of planillas) dias.add(p.fecha)
    return [...dias].sort((a, b) => b.localeCompare(a))
  }, [planillas])

  const planillasDelDia = useMemo(
    () => planillas.filter((p) => p.fecha === selectedDay),
    [planillas, selectedDay]
  )

  const conteoPorDia = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of planillas) map.set(p.fecha, (map.get(p.fecha) ?? 0) + 1)
    return map
  }, [planillas])

  const totalUnidadesDelDia = useMemo(
    () => planillasDelDia.reduce((s, p) => s + p.total_unidades, 0),
    [planillasDelDia]
  )

  useEffect(() => {
    if (loadingList || diasConPlanillas.length === 0) return
    if (!diasConPlanillas.includes(selectedDay)) {
      const today = todayIsoDate()
      setSelectedDay(diasConPlanillas.includes(today) ? today : diasConPlanillas[0])
    }
  }, [loadingList, diasConPlanillas, selectedDay])

  const lineasPorProducto = useMemo(() => {
    const map = new Map<number, { producto: PlanillaLineaDraft; lineas: PlanillaLineaDraft[] }>()
    for (const l of lineas) {
      const existing = map.get(l.producto_id)
      if (existing) existing.lineas.push(l)
      else map.set(l.producto_id, { producto: l, lineas: [l] })
    }
    return [...map.values()].map((g) => ({
      ...g,
      total: g.lineas.reduce((s, l) => s + l.total_unidades, 0)
    }))
  }, [lineas])

  const totalGeneral = useMemo(
    () => lineas.reduce((s, l) => s + l.total_unidades, 0),
    [lineas]
  )

  function resetCreateForm() {
    setFecha(todayIsoDate())
    setNumero('')
    setObservacion('')
    setCamioneroId('')
    setVehiculoId('')
    setProductSearch('')
    setProductResults([])
    setSelectedProduct(null)
    setLineas([])
    setProductoRefs(null)
    resetLineaForm()
    setError('')
    setCreatePhase('datos')
    setPreviewData(null)
    setExpandedProductos(new Set())
  }

  function volverAlListadoPlanilla() {
    resetCreateForm()
    setShowPreview(false)
    setView('list')
  }

  function volverAlListadoDesdeDetalle() {
    if (detalle) setSelectedDay(detalle.planilla.fecha)
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

    if (showPreview) {
      setShowPreview(false)
      return true
    }

    if (createPhase === 'carga') {
      if (productResults.length > 0 && !selectedProduct) {
        setProductResults([])
        setProductHighlightIndex(-1)
        return true
      }
      if (selectedProduct) {
        setSelectedProduct(null)
        setProductSearch('')
        setProductoRefs(null)
        resetLineaForm()
        focusField(productSearchRef)
        return true
      }
    }

    volverAlListadoPlanilla()
    return true
  })

  function toggleProductoExpand(productoId: number) {
    setExpandedProductos((prev) => {
      const next = new Set(prev)
      if (next.has(productoId)) next.delete(productoId)
      else next.add(productoId)
      return next
    })
  }

  function resetLineaForm(forProduct?: Producto | null) {
    setModoSalida('CAJA')
    setCantidad('')
  }

  function handleModoSalidaChange(modo: ModoSalidaPlanilla) {
    setModoSalida(modo)
  }

  const stockDisponibleModo = useMemo(() => {
    if (!productoRefs) return null
    return modoSalida === 'CAJA'
      ? productoRefs.stock_disponible_cajas
      : productoRefs.stock_disponible_botellas
  }, [productoRefs, modoSalida])

  const lineaPreview = useMemo(() => {
    if (!selectedProduct) return null
    const n = Number(cantidad)
    if (!Number.isFinite(n) || n <= 0) return null
    return {
      etiqueta: formatPlanillaEtiqueta(modoSalida, n, selectedProduct.unidad),
      total: n
    }
  }, [selectedProduct, modoSalida, cantidad])

  async function selectProduct(p: Producto) {
    setSelectedProduct(p)
    setProductSearch(p.codigo_interno)
    setProductResults([])
    setProductHighlightIndex(-1)
    setError('')
    try {
      const refs = await api<{
        stock_disponible: number
        stock_disponible_cajas: number
        stock_disponible_botellas: number
        referencias_bulto: Array<{ tipo_bulto: 'PALLET' | 'CAJA'; unidades_por_bulto: number }>
        unidades_por_pallet_default: number | null
        unidades_por_caja_default: number | null
      }>(`/api/planillas/producto/${p.id}/referencias`)
      setProductoRefs(refs)
      resetLineaForm(p)
    } catch {
      setProductoRefs(null)
      resetLineaForm(p)
    }
    setTimeout(() => focusField(cantidadRef), 50)
  }

  function validarDatos(): boolean {
    if (!fecha || !numero.trim()) {
      setError('Completá fecha y número de planilla')
      return false
    }
    if (!camioneroId) {
      setError('Seleccioná el camionero')
      return false
    }
    setError('')
    return true
  }

  function irACarga() {
    if (!validarDatos()) return
    setCreatePhase('carga')
  }

  function handleDatosKeyDown(
    e: React.KeyboardEvent,
    next?: React.RefObject<HTMLInputElement | HTMLSelectElement | null>
  ) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (next?.current) {
      focusField(next)
    } else {
      irACarga()
    }
  }

  function handleCamioneroKeyDown(e: React.KeyboardEvent<HTMLSelectElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (camioneroId && vehiculos.length > 0) {
      focusField(vehiculoRef)
    } else {
      focusField(observacionRef)
    }
  }

  function pickProductFromSearch() {
    if (!productSearch.trim()) return
    const term = productSearch.trim().toLowerCase()
    const exact = productResults.find(
      (p) =>
        p.codigo_interno.toLowerCase() === term ||
        p.codigo_barras?.toLowerCase() === term
    )
    if (exact) {
      selectProduct(exact)
      return
    }
    if (productResults.length === 1) selectProduct(productResults[0])
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
        return
      }
      pickProductFromSearch()
    }
  }

  async function agregarLinea(): Promise<boolean> {
    if (!selectedProduct) {
      setError('Seleccioná un producto primero')
      return false
    }

    const n = Number(cantidad)
    if (!Number.isFinite(n) || n <= 0) {
      setError(`Indicá la cantidad de ${modoSalida === 'CAJA' ? 'cajas' : normalizarUnidadProducto(selectedProduct.unidad) + 's'}`)
      return false
    }

    if (stockDisponibleModo != null && n > stockDisponibleModo) {
      const unidadLabel =
        modoSalida === 'CAJA' ? 'cajas' : normalizarUnidadProducto(selectedProduct.unidad) + 's'
      setError(
        `Stock insuficiente (disponible: ${stockDisponibleModo} ${unidadLabel}, solicitado: ${n} ${unidadLabel})`
      )
      return false
    }

    setLineas((prev) => [
      ...prev,
      {
        tempId: newTempId(),
        producto_id: selectedProduct.id,
        codigo_interno: selectedProduct.codigo_interno,
        nombre: selectedProduct.nombre,
        modo_salida: modoSalida,
        cantidad: n,
        total_unidades: n,
        etiqueta: formatPlanillaEtiqueta(modoSalida, n, selectedProduct.unidad)
      }
    ])
    resetLineaForm(selectedProduct)
    setError('')
    return true
  }

  async function agregarLineaYContinuar() {
    if (!(await agregarLinea())) return
    setSelectedProduct(null)
    setProductSearch('')
    setProductResults([])
    setTimeout(() => focusField(productSearchRef), 50)
  }

  function handleLineaEnter(e: React.KeyboardEvent) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    void agregarLineaYContinuar()
  }

  function quitarLinea(tempId: string) {
    setLineas((prev) => prev.filter((l) => l.tempId !== tempId))
  }

  async function abrirPreview() {
    if (!validarDatos()) return
    if (lineas.length === 0) {
      setError('Agregá al menos una línea de producto')
      return
    }
    setLoadingPreview(true)
    setError('')
    try {
      const result = await api<{ lineas: PlanillaPreviewLinea[]; ok: boolean }>(
        '/api/planillas/preview',
        {
          method: 'POST',
          body: JSON.stringify({
            lineas: lineas.map((l) => ({
              producto_id: l.producto_id,
              modo_salida: l.modo_salida,
              cantidad: l.cantidad
            }))
          })
        }
      )
      setPreviewData(result.lineas)
      setShowPreview(true)
      if (!result.ok) {
        setError('Hay productos con stock insuficiente. Revisá la vista previa.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al calcular descuento')
    } finally {
      setLoadingPreview(false)
    }
  }

  async function confirmarPlanilla() {
    if (!validarDatos()) return
    if (lineas.length === 0) {
      setError('Agregá al menos una línea de producto')
      return
    }
    if (previewData?.some((p) => p.error)) {
      setError('Corregí las líneas con stock insuficiente antes de confirmar')
      return
    }
    setSaving(true)
    setError('')
    try {
      const result = await api<{ id: number }>('/api/planillas', {
        method: 'POST',
        body: JSON.stringify({
          fecha,
          numero,
          observacion: observacion || null,
          camionero_id: Number(camioneroId),
          vehiculo_id: vehiculoId ? Number(vehiculoId) : null,
          lineas: lineas.map((l) => ({
            producto_id: l.producto_id,
            modo_salida: l.modo_salida,
            cantidad: l.cantidad
          }))
        })
      })
      setShowPreview(false)
      const data = await api<PlanillaDetalle>(`/api/planillas/${result.id}`)
      setDetalle(data)
      setSelectedDay(fecha)
      setView('detail')
      resetCreateForm()
      await loadPlanillas()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al confirmar planilla')
    } finally {
      setSaving(false)
    }
  }

  async function verDetalle(id: number) {
    setError('')
    try {
      const data = await api<PlanillaDetalle>(`/api/planillas/${id}`)
      setDetalle(data)
      setView('detail')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar detalle')
    }
  }

  async function exportarPlanilla(id: number) {
    setExportingId(id)
    setError('')
    try {
      await downloadApiFile(`/api/planillas/${id}/export`, `planilla-${id}.xlsx`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al exportar')
    } finally {
      setExportingId(null)
    }
  }

  const registroListKb = useRegistroListKeyboard({
    enabled: view === 'list',
    items: planillasDelDia,
    listSearchRef,
    canCreate: hasPermiso('planillas.crear'),
    onCreate: abrirNuevaPlanilla,
    onOpenDetail: (p) => {
      void verDetalle(p.id)
    }
  })

  if (view === 'detail' && detalle) {
    return <PlanillaDetallePanel detalle={detalle} onVolver={volverAlListadoDesdeDetalle} />
  }

  if (view === 'create' && createPhase === 'datos') {
    return (
      <div ref={createScrollRef} className="-m-4 h-[calc(100vh-5rem)] overflow-y-auto lg:-m-6">
        <div className="mx-auto flex max-w-lg flex-col gap-5 px-4 py-6 pb-16 lg:px-6">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 h-9 self-start rounded-xl px-3"
            onClick={volverAlListadoPlanilla}
          >
            <ChevronLeft className="h-4 w-4" />
            Volver al listado
          </Button>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Alta</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Nueva planilla</h1>
            <p className="mt-1 text-sm text-slate-500">
              Salida de mercadería con camionero asignado · Enter avanza · Esc vuelve
            </p>
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-100">
              {error}
            </div>
          )}

          <Card className="overflow-hidden shadow-panel">
            <div className="border-b border-brand-100 bg-gradient-to-r from-brand-50/80 via-white to-white px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
                  <ClipboardList className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Datos de la planilla</p>
                  <p className="text-xs text-slate-500">Fecha, número, camionero y vehículo</p>
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
                onKeyDown={(e) => handleDatosKeyDown(e, numeroRef)}
              />
              <Input
                ref={numeroRef}
                label="Número de planilla *"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                onKeyDown={(e) => handleDatosKeyDown(e, camioneroRef)}
                placeholder="ej. PLA-2024-001"
              />
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Camionero *</label>
                <select
                  ref={camioneroRef}
                  value={camioneroId}
                  onChange={(e) => {
                    setCamioneroId(e.target.value)
                    setVehiculoId('')
                  }}
                  onKeyDown={handleCamioneroKeyDown}
                  className="w-full rounded-xl border border-surface-border px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                >
                  <option value="">Seleccionar camionero...</option>
                  {camioneros.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.numero_interno} — {c.nombre} ({c.empresa})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Vehículo</label>
                <select
                  ref={vehiculoRef}
                  value={vehiculoId}
                  onChange={(e) => setVehiculoId(e.target.value)}
                  onKeyDown={(e) => handleDatosKeyDown(e, observacionRef)}
                  disabled={!camioneroId || vehiculos.length === 0}
                  className="w-full rounded-xl border border-surface-border px-3 py-2.5 text-sm shadow-sm disabled:bg-slate-50 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                >
                  <option value="">
                    {!camioneroId
                      ? 'Elegí un camionero primero'
                      : vehiculos.length === 0
                        ? 'Sin vehículos activos'
                        : 'Sin vehículo específico'}
                  </option>
                  {vehiculos.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.patente} — {v.marca} {v.modelo}
                    </option>
                  ))}
                </select>
              </div>
              <Input
                ref={observacionRef}
                label="Observaciones"
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                onFocus={() => scrollFieldIntoView(observacionRef)}
                onKeyDown={(e) => handleDatosKeyDown(e)}
              />
              <p className="text-xs text-slate-400">Enter en observaciones → carga de productos</p>
              <Button type="button" className="w-full rounded-xl" onClick={irACarga}>
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
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <ClipboardList className="h-6 w-6" />
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
                  'flex items-center gap-3 px-4 py-2.5 transition-colors sm:px-5',
                  isExpanded ? 'bg-brand-50/50' : 'hover:bg-slate-50/80'
                )}
              >
                <button
                  type="button"
                  onClick={() => toggleProductoExpand(grupo.producto.producto_id)}
                  className={cn(
                    'shrink-0 rounded-lg p-1.5 transition-colors',
                    isExpanded
                      ? 'bg-brand-100 text-brand-700'
                      : 'text-slate-400 hover:bg-slate-200 hover:text-slate-700'
                  )}
                  aria-expanded={isExpanded}
                  aria-label={isExpanded ? 'Ocultar líneas' : 'Ver líneas'}
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
                <span className="inline-flex shrink-0 items-center rounded-lg bg-brand-50 px-2.5 py-1.5 text-sm font-bold tabular-nums text-brand-700 ring-1 ring-brand-100">
                  {formatCantidad(grupo.total)}
                </span>
              </div>
              {isExpanded && (
                <ul className="space-y-2 border-t border-brand-100/80 bg-gradient-to-b from-surface-muted/40 to-white px-4 py-3 sm:px-5">
                  {grupo.lineas.map((l) => (
                    <li
                      key={l.tempId}
                      className="flex items-center justify-between gap-3 rounded-lg border border-surface-border bg-white px-3 py-2.5 text-sm"
                    >
                      <div className="min-w-0 text-slate-800">
                        {l.modo_salida === 'CAJA'
                          ? formatCantidad(l.cantidad)
                          : l.etiqueta}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="rounded-md bg-slate-50 px-2 py-1 text-sm font-semibold tabular-nums text-slate-900 ring-1 ring-surface-border">
                          {formatCantidad(l.total_unidades)}
                        </span>
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
      <div className="-m-4 flex h-[calc(100vh-5rem)] flex-col bg-surface-muted/30 lg:-m-6">
        <div
          ref={cargaPanelRef}
          className="relative z-20 shrink-0 overflow-visible border-b border-surface-border bg-white shadow-sm"
        >
          <div className="border-b border-brand-100 bg-gradient-to-r from-brand-50/80 via-white to-white px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <Button
                variant="ghost"
                size="sm"
                className="-ml-2 h-8 rounded-lg px-2"
                onClick={volverAlListadoPlanilla}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Salir
              </Button>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-white px-2.5 py-1 font-medium text-slate-700 ring-1 ring-surface-border">
                  {fecha}
                </span>
                <span className="rounded-full bg-white px-2.5 py-1 font-medium text-slate-700 ring-1 ring-surface-border">
                  Planilla {numero}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 font-medium text-brand-800 ring-1 ring-brand-100">
                  <Truck className="h-3 w-3" />
                  {camioneroSeleccionado?.nombre}
                </span>
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

          {error && !showPreview && (
            <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700 sm:px-5">
              {error}
            </div>
          )}

          <div className="space-y-3 overflow-visible p-4 sm:p-5">
            <div className="relative z-30 overflow-visible">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400" />
                <input
                  ref={productSearchRef}
                  type="search"
                  role="combobox"
                  aria-expanded={productResults.length > 0 && !selectedProduct}
                  aria-autocomplete="list"
                  placeholder="Buscar producto — ↑↓ navegar · Enter seleccionar"
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
                            index === productHighlightIndex
                              ? 'bg-brand-50 text-brand-900'
                              : 'hover:bg-slate-50'
                          )}
                          onMouseEnter={() => setProductHighlightIndex(index)}
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

            {selectedProduct && (
              <div
                ref={productLineFormRef}
                className="overflow-hidden rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50/80 to-white p-4 shadow-card"
              >
                <div className="mb-4 flex items-center gap-3">
                  <ProductImage
                    productoId={selectedProduct.id}
                    hasImage={!!selectedProduct.imagen_path}
                    alt={selectedProduct.nombre}
                    className="h-11 w-11 rounded-xl ring-1 ring-surface-border"
                  />
                  <div className="min-w-0 flex-1">
                    <span className="inline-flex rounded-md bg-white px-2 py-0.5 font-mono text-xs font-semibold text-slate-700 ring-1 ring-surface-border">
                      {selectedProduct.codigo_interno}
                    </span>
                    <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                      {selectedProduct.nombre}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-600"
                    onClick={() => {
                      setSelectedProduct(null)
                      setProductoRefs(null)
                      setProductSearch('')
                      productSearchRef.current?.focus()
                    }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                  <div>
                    <label className="mb-0.5 block text-xs font-medium text-slate-600">Unidad</label>
                    <select
                      ref={tipoRef}
                      value={modoSalida}
                      onChange={(e) => handleModoSalidaChange(e.target.value as ModoSalidaPlanilla)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          focusField(cantidadRef)
                        }
                      }}
                      className="w-full rounded-lg border border-surface-border px-2 py-1.5 text-sm"
                    >
                      <option value="CAJA">Cajas</option>
                      <option value="BOTELLA">
                        {normalizarUnidadProducto(selectedProduct.unidad)}s
                      </option>
                    </select>
                  </div>

                  <Input
                    ref={cantidadRef}
                    label={modoSalida === 'CAJA' ? 'Cant. cajas' : `Cant. ${normalizarUnidadProducto(selectedProduct.unidad)}s`}
                    type="number"
                    min="1"
                    value={cantidad}
                    onChange={(e) => setCantidad(e.target.value)}
                    onKeyDown={handleLineaEnter}
                    placeholder={modoSalida === 'CAJA' ? '2' : '1'}
                    className="[&_label]:text-xs"
                  />

                  <div className="col-span-2 flex items-end sm:col-span-1">
                    <Button
                      type="button"
                      size="sm"
                      className="w-full rounded-xl"
                      onClick={() => void agregarLineaYContinuar()}
                    >
                      <Plus className="h-4 w-4" />
                      Enter ↵
                    </Button>
                  </div>
                </div>

                {lineaPreview && (
                  <div className="mt-3 rounded-lg border border-brand-100 bg-white/90 px-3 py-2.5 text-sm shadow-sm">
                    <p className="font-medium text-brand-800">
                      {modoSalida === 'CAJA'
                        ? formatCantidad(lineaPreview.total)
                        : lineaPreview.etiqueta}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Total: {formatCantidad(lineaPreview.total)}
                      {stockDisponibleModo != null && (
                        <> · Stock: {formatCantidad(stockDisponibleModo)}</>
                      )}
                    </p>
                  </div>
                )}

                <p className="mt-3 text-xs leading-relaxed text-slate-500">
                  <span className="font-medium text-slate-600">Cajas:</span> descuenta cajas enteras del stock
                  (pallets se abren si hace falta).
                  {' '}
                  <span className="font-medium text-slate-600">
                    {normalizarUnidadProducto(selectedProduct.unidad)}s:
                  </span>{' '}
                  descuenta de cajas parciales (ej. 2 {normalizarUnidadProducto(selectedProduct.unidad)}s de una caja de 6).
                </p>
              </div>
            )}
          </div>
        </div>

        <div ref={listScrollRef} className="relative z-0 min-h-0 flex-1 overflow-y-auto bg-white">
          {lineasListContent}
        </div>

        <div className="shrink-0 border-t border-surface-border bg-white px-4 py-4 shadow-[0_-4px_12px_rgba(0,0,0,0.04)] sm:px-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Total general
              </p>
              <p className="text-2xl font-bold tabular-nums text-brand-700">
                {formatCantidad(totalGeneral)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {lineas.length} línea{lineas.length === 1 ? '' : 's'} cargada
                {lineas.length === 1 ? '' : 's'}
              </p>
            </div>
            {hasPermiso('planillas.crear') && (
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button
                  variant="secondary"
                  className="rounded-xl"
                  onClick={abrirPreview}
                  disabled={lineas.length === 0 || loadingPreview || saving}
                >
                  <Eye className="h-4 w-4" />
                  {loadingPreview ? 'Calculando...' : 'Vista previa'}
                </Button>
                <Button
                  className="rounded-xl"
                  onClick={confirmarPlanilla}
                  disabled={
                    lineas.length === 0 ||
                    saving ||
                    loadingPreview ||
                    (previewData?.some((p) => p.error) ?? false)
                  }
                >
                  {saving ? 'Registrando...' : 'Confirmar planilla'}
                </Button>
              </div>
            )}
          </div>
        </div>

        {showPreview && previewData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/50" onClick={() => setShowPreview(false)} />
            <div className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-auto rounded-xl border border-surface-border bg-white shadow-xl">
              <div className="sticky top-0 flex items-center justify-between border-b border-surface-border bg-white px-5 py-4">
                <h3 className="font-semibold text-slate-900">Vista previa — descuento de stock</h3>
                <button
                  type="button"
                  onClick={() => setShowPreview(false)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-4 p-5">
                {error && (
                  <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
                )}
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <span className="text-slate-500">Fecha:</span> <strong>{fecha}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Planilla:</span> <strong>{numero}</strong>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-slate-500">Camionero:</span>{' '}
                    <strong>
                      {camioneroSeleccionado?.numero_interno} — {camioneroSeleccionado?.nombre}
                    </strong>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-slate-500">Vehículo:</span>{' '}
                    <strong>
                      {vehiculoSeleccionado
                        ? `${vehiculoSeleccionado.marca} ${vehiculoSeleccionado.modelo}`
                        : 'Sin vehículo asignado'}
                    </strong>
                    {vehiculoSeleccionado && (
                      <span className="text-slate-500"> ({vehiculoSeleccionado.patente})</span>
                    )}
                  </div>
                </div>

                {previewData.map((pl, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      'rounded-xl border p-4',
                      pl.error ? 'border-red-200 bg-red-50/50' : 'border-surface-border bg-white'
                    )}
                  >
                    <p className="font-mono font-semibold text-slate-900">
                      {pl.codigo_interno} — {pl.nombre}
                    </p>
                    <p className="text-sm text-slate-600">
                      Solicitado: {formatCantidad(pl.total_solicitado)}
                    </p>
                    {pl.error ? (
                      <p className="mt-2 text-sm font-medium text-red-700">{pl.error}</p>
                    ) : (
                      <ul className="mt-3 space-y-1.5 text-sm">
                        {pl.descuentos.map((d, i) => (
                          <li
                            key={i}
                            className="flex justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-slate-700"
                          >
                            <span>
                              {d.sector_nombre}
                              {d.etiqueta && (
                                <span className="ml-1 text-slate-400">({d.etiqueta})</span>
                              )}
                            </span>
                            <span className="font-medium tabular-nums">{formatCantidad(d.unidades)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}

                <div className="flex gap-2 pt-2">
                  <Button
                    className="rounded-xl"
                    onClick={confirmarPlanilla}
                    disabled={saving || previewData.some((p) => p.error)}
                  >
                    {saving ? 'Registrando...' : 'Confirmar planilla'}
                  </Button>
                  <Button variant="secondary" className="rounded-xl" onClick={() => setShowPreview(false)}>
                    Volver a editar
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Movimientos
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Carga de planillas
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-500">
            Salidas de mercadería con descuento automático de stock por camionero y vehículo.
          </p>
        </div>
        {hasPermiso('planillas.crear') && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="hidden rounded-full border border-surface-border bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 shadow-card sm:inline-flex">
              Enter = nueva planilla
            </span>
            <Button className="rounded-xl px-4" onClick={abrirNuevaPlanilla}>
              <Plus className="h-4 w-4" />
              Nueva planilla
            </Button>
          </div>
        )}
      </section>

      <Card className="overflow-hidden shadow-panel">
        <div className="border-b border-brand-100 bg-gradient-to-r from-brand-50/80 via-white to-white px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[10rem] flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400" />
                <input
                  ref={listSearchRef}
                  type="search"
                  placeholder="Buscar por planilla o camionero..."
                  value={listSearch}
                  onChange={(e) => setListSearch(e.target.value)}
                  onKeyDown={registroListKb.handleListSearchKeyDown}
                  className="w-full rounded-xl border border-surface-border bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
              </div>

              <div className="flex shrink-0 items-center gap-1.5 rounded-xl border border-surface-border bg-white px-2 py-1.5 shadow-sm">
                <span className="pl-1 text-xs font-medium text-slate-500">Desde</span>
                <input
                  type="date"
                  value={listFechaDesde}
                  onChange={(e) => setListFechaDesde(e.target.value)}
                  title="Fecha desde — solo este campo = ese día"
                  className="rounded border-0 bg-transparent px-1 py-1 text-sm focus:outline-none focus:ring-0"
                />
                <span className="text-slate-300">|</span>
                <span className="text-xs font-medium text-slate-500">Hasta</span>
                <input
                  type="date"
                  value={listFechaHasta}
                  onChange={(e) => setListFechaHasta(e.target.value)}
                  title="Fecha hasta — solo este campo = ese día"
                  className="rounded border-0 bg-transparent px-1 py-1 text-sm focus:outline-none focus:ring-0"
                />
              </div>

              {(listFechaDesde || listFechaHasta) && (
                <Button
                  type="button"
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
            <p className="text-xs text-slate-500">
              Una sola fecha filtra ese día · las dos juntas = rango
              {hasPermiso('planillas.crear') && ' · Enter = nueva planilla'}
            </p>

            <DayTabsRow
              days={diasConPlanillas}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
              getCount={(dia) => conteoPorDia.get(dia) ?? 0}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-surface-border bg-slate-50/80 px-5 py-3.5 sm:px-6">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              {diasConPlanillas.length > 0 ? formatDayTabLabel(selectedDay) : 'Registros'}
            </h2>
            <p className="text-xs text-slate-500">
              {diasConPlanillas.length > 0
                ? `${planillasDelDia.length} planilla(s) · ${formatCantidad(totalUnidadesDelDia)} en el día`
                : `${planillas.length} planilla(s)`}
            </p>
          </div>
          {loadingList && <Loader2 className="h-5 w-5 shrink-0 animate-spin text-brand-600" />}
        </div>

        <CardBody className="p-0">
          {error && (
            <div className="border-b border-red-100 bg-red-50 px-6 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {loadingList ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
              Cargando planillas...
            </div>
          ) : planillas.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <ClipboardList className="h-7 w-7" />
              </div>
              <p className="mt-4 text-sm font-medium text-slate-700">
                {listSearch || listFechaDesde || listFechaHasta
                  ? 'No hay planillas con esos filtros'
                  : 'No hay planillas registradas'}
              </p>
              <p className="mt-1 max-w-sm text-xs text-slate-500">
                {listSearch || listFechaDesde || listFechaHasta
                  ? 'Probá ampliar el rango de fechas o cambiar la búsqueda'
                  : 'Registrá la primera salida para descontar stock'}
              </p>
              {!(listSearch || listFechaDesde || listFechaHasta) &&
                hasPermiso('planillas.crear') && (
                  <Button className="mt-4 rounded-xl" size="sm" onClick={abrirNuevaPlanilla}>
                    <Plus className="h-4 w-4" />
                    Nueva planilla
                  </Button>
                )}
            </div>
          ) : planillasDelDia.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <ClipboardList className="h-7 w-7" />
              </div>
              <p className="mt-4 text-sm font-medium text-slate-700">Sin resultados para este día</p>
              <p className="mt-1 text-xs text-slate-500">Probá otra fecha o ajustá la búsqueda</p>
            </div>
          ) : (
            <ul className="divide-y divide-surface-border">
              {planillasDelDia.map((p, index) => (
                <li
                  key={p.id}
                  {...registroListKb.listItemProps(
                    index,
                    'flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-slate-50/80 sm:flex-row sm:items-center sm:gap-4 sm:px-6'
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold text-slate-900">{p.numero}</p>
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-800 ring-1 ring-brand-100">
                        <Truck className="h-3 w-3" />
                        {p.camionero_nombre}
                      </span>
                      {p.vehiculo_modelo && (
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                          {p.vehiculo_modelo}
                        </span>
                      )}
                    </div>
                    {p.observacion?.trim() ? (
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">{p.observacion}</p>
                    ) : (
                      <p className="mt-1 text-xs text-slate-400">
                        {p.camionero_numero}
                        {!p.vehiculo_modelo && ' · Sin vehículo asignado'}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span>{p.lineas_count} línea{p.lineas_count === 1 ? '' : 's'}</span>
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {p.usuario_nombre}
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2 sm:justify-end">
                    <span className="inline-flex min-w-[3rem] items-center justify-center rounded-lg bg-brand-50 px-2.5 py-1.5 text-sm font-bold tabular-nums text-brand-700 ring-1 ring-brand-100">
                      {formatCantidad(p.total_unidades)}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="rounded-lg"
                      disabled={exportingId === p.id}
                      onClick={() => void exportarPlanilla(p.id)}
                      title="Exportar Excel del registro"
                    >
                      {exportingId === p.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                      Exportar
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="rounded-lg"
                      onClick={() => verDetalle(p.id)}
                    >
                      <Eye className="h-4 w-4" />
                      Ver
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  )
}

function PlanillaDetallePanel({
  detalle,
  onVolver
}: {
  detalle: PlanillaDetalle
  onVolver: () => void
}) {
  const planilla = detalle.planilla
  const vehiculoTexto =
    planilla.vehiculo_marca || planilla.vehiculo_modelo
      ? [planilla.vehiculo_marca, planilla.vehiculo_modelo].filter(Boolean).join(' ')
      : null

  return (
    <RegistroDetallePanel
      onVolver={onVolver}
      titulo={`Planilla ${planilla.numero}`}
      fecha={planilla.fecha}
      totalEtiqueta="Total"
      total={detalle.total_unidades}
      meta={
        <>
          <RegistroDetalleMetaChip icon={<Truck className="h-3.5 w-3.5 shrink-0 text-slate-400" />}>
            {planilla.camionero_numero} · {planilla.camionero_nombre}
            {planilla.camionero_empresa && (
              <span className="text-slate-400"> · {planilla.camionero_empresa}</span>
            )}
          </RegistroDetalleMetaChip>
          {vehiculoTexto && (
            <RegistroDetalleMetaChip>
              <span className="font-medium text-slate-500">Vehículo </span>
              {vehiculoTexto}
              {planilla.vehiculo_patente && (
                <span className="text-slate-400"> ({planilla.vehiculo_patente})</span>
              )}
            </RegistroDetalleMetaChip>
          )}
          <RegistroDetalleMetaChip icon={<User className="h-3.5 w-3.5 shrink-0 text-slate-400" />}>
            {planilla.usuario_nombre}
          </RegistroDetalleMetaChip>
          {planilla.observacion && (
            <RegistroDetalleObsChip>{planilla.observacion}</RegistroDetalleObsChip>
          )}
        </>
      }
      lineas={detalle.lineas.map((l) => ({
        id: l.id,
        producto_id: l.producto_id,
        codigo_interno: l.codigo_interno,
        nombre: l.nombre,
        etiqueta: l.etiqueta,
        cantidad: l.total_unidades
      }))}
    />
  )
}
