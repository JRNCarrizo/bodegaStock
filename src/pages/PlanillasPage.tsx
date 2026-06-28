import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Eye,
  Plus,
  Search,
  Trash2,
  Truck,
  X
} from 'lucide-react'
import { BarcodeScannerModal } from '@/components/BarcodeScannerModal'
import { ProductQuickCreateModal } from '@/components/ProductQuickCreateModal'
import { ProductImage } from '@/components/ProductImage'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge, Card, CardBody, CardHeader } from '@/components/ui/Card'
import {
  formatCantidad,
  formatDayTabLabel,
  formatPlanillaEtiqueta,
  formatTotalCajas,
  normalizarUnidadProducto,
  todayIsoDate,
  type ModoSalidaPlanilla
} from '@/lib/desglose'
import { api } from '@/lib/utils'
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

  const [showScanner, setShowScanner] = useState(false)
  const [showNewProduct, setShowNewProduct] = useState(false)
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

  function handleListSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' || !hasPermiso('planillas.crear')) return
    e.preventDefault()
    abrirNuevaPlanilla()
  }

  function shouldAbrirFormularioConEnter(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return true
    if (target.closest('button, a, textarea, [contenteditable="true"]')) return false
    if (target instanceof HTMLInputElement && target.type === 'date') return false
    if (target instanceof HTMLSelectElement) return false
    return true
  }

  useEffect(() => {
    if (view !== 'list' || !hasPermiso('planillas.crear')) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat) return
      if (!shouldAbrirFormularioConEnter(e.target)) return
      e.preventDefault()
      abrirNuevaPlanilla()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [view, hasPermiso])

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
    setShowScanner(false)
    setShowNewProduct(false)
    setView('list')
  }

  function volverAlListadoDesdeDetalle() {
    if (detalle) setSelectedDay(detalle.planilla.fecha)
    setDetalle(null)
    setView('list')
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
    if (showScanner) {
      setShowScanner(false)
      return true
    }
    if (showNewProduct) {
      setShowNewProduct(false)
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

  if (view === 'detail' && detalle) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={volverAlListadoDesdeDetalle}>
            <ChevronLeft className="h-4 w-4" />
            Volver
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Planilla registrada</h1>
            <p className="text-sm text-slate-500">Nº {detalle.planilla.numero}</p>
          </div>
        </div>

        <Card>
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 text-sm">
              <div>
                <p className="text-slate-500">Fecha</p>
                <p className="font-medium">{detalle.planilla.fecha}</p>
              </div>
              <div>
                <p className="text-slate-500">Camionero</p>
                <p className="font-medium">
                  {detalle.planilla.camionero_numero} — {detalle.planilla.camionero_nombre}
                </p>
                <p className="text-xs text-slate-500">{detalle.planilla.camionero_empresa}</p>
              </div>
              {detalle.planilla.vehiculo_modelo && (
                <div>
                  <p className="text-slate-500">Modelo</p>
                  <p className="font-medium">
                    {detalle.planilla.vehiculo_marca} {detalle.planilla.vehiculo_modelo}
                  </p>
                </div>
              )}
              <div>
                <p className="text-slate-500">Cargado por</p>
                <p className="font-medium">{detalle.planilla.usuario_nombre}</p>
              </div>
              <div>
                <p className="text-slate-500">Total descontado</p>
                <p className="text-lg font-bold text-brand-700">{formatTotalCajas(detalle.total_unidades)}</p>
              </div>
            </div>
            {detalle.planilla.observacion && (
              <p className="text-sm text-slate-600">
                <span className="text-slate-500">Observaciones:</span> {detalle.planilla.observacion}
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Productos y descuentos por sector" />
          <CardBody className="space-y-4 p-0">
            {detalle.lineas.map((l) => (
              <div key={l.id} className="border-b border-surface-border last:border-0">
                <div className="bg-slate-50 px-6 py-3">
                  <p className="font-mono font-semibold">{l.codigo_interno}</p>
                  <p className="text-sm text-slate-700">{l.nombre}</p>
                  <p className="text-sm text-slate-600">
                    {l.etiqueta} · <strong className="text-brand-700">{formatTotalCajas(l.total_unidades)}</strong>
                  </p>
                </div>
                <ul className="divide-y divide-surface-border px-6 py-2">
                  {l.descuentos.map((d) => (
                    <li key={d.id} className="flex justify-between py-2 text-sm">
                      <span className="text-slate-700">
                        <Truck className="mr-1 inline h-3.5 w-3.5 text-slate-400" />
                        {d.sector_nombre}
                        {d.etiqueta && (
                          <span className="ml-2 text-slate-400">({d.etiqueta})</span>
                        )}
                      </span>
                      <span className="font-medium">{formatTotalCajas(d.unidades)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    )
  }

  if (view === 'create' && createPhase === 'datos') {
    return (
      <div
        ref={createScrollRef}
        className="-m-4 h-[calc(100vh-5rem)] overflow-y-auto lg:-m-6"
      >
        <div className="mx-auto flex max-w-lg flex-col px-4 py-8 pb-16">
        <Button variant="ghost" size="sm" className="mb-4 -ml-2" onClick={volverAlListadoPlanilla}>
          <ChevronLeft className="h-4 w-4" />
          Volver al listado
        </Button>
        <h1 className="text-2xl font-bold text-slate-900">Nueva planilla</h1>
        <p className="mt-1 mb-6 text-slate-500">Salida de mercadería con camionero asignado</p>

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
                className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
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
                className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm disabled:bg-slate-50"
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
            <Button type="button" className="w-full" onClick={irACarga}>
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
          <ClipboardList className="mb-2 h-10 w-10 opacity-40" />
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
                  className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
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
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="font-mono text-sm font-semibold text-slate-900">
                    {grupo.producto.codigo_interno}
                  </p>
                  <p className="truncate text-xs text-slate-600">{grupo.producto.nombre}</p>
                  {!isExpanded && grupo.lineas.length > 1 && (
                    <p className="text-xs text-slate-400">{grupo.lineas.length} líneas</p>
                  )}
                </button>
                <Badge variant="default">{formatTotalCajas(grupo.total)}</Badge>
              </div>
              {isExpanded && (
                <ul className="divide-y divide-surface-border border-t border-surface-border bg-surface-muted/20">
                  {grupo.lineas.map((l) => (
                    <li
                      key={l.tempId}
                      className="flex items-center justify-between gap-2 py-2.5 pl-11 pr-4 text-sm"
                    >
                      <span className="text-slate-700">{l.etiqueta}</span>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="font-semibold text-slate-900">{formatTotalCajas(l.total_unidades)}</span>
                        <Button variant="ghost" size="sm" onClick={() => quitarLinea(l.tempId)}>
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
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-surface-border px-4 py-2 text-xs text-slate-600">
            <Button variant="ghost" size="sm" className="-ml-2 h-7" onClick={volverAlListadoPlanilla}>
              <ChevronLeft className="h-3.5 w-3.5" />
              Salir
            </Button>
            <span>{fecha}</span>
            <span>
              Planilla <strong>{numero}</strong>
            </span>
            <span>
              <Truck className="mr-0.5 inline h-3 w-3" />
              {camioneroSeleccionado?.nombre}
            </span>
            <button
              type="button"
              className="text-brand-600 hover:underline"
              onClick={() => setCreatePhase('datos')}
            >
              Editar datos
            </button>
          </div>

          {error && !showPreview && (
            <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
          )}

          <div className="space-y-3 overflow-visible p-4">
            <div className="relative flex flex-col gap-2 overflow-visible sm:flex-row">
              <div className="relative z-30 min-w-0 flex-1">
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
                  <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-surface-border bg-white shadow-lg">
                    {productResults.map((p, index) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className={`flex w-full gap-2 px-3 py-2 text-left text-sm ${
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
                <Button variant="secondary" size="sm" onClick={() => setShowScanner(true)}>
                  <Camera className="h-4 w-4" />
                  Escanear
                </Button>
                {hasPermiso('productos.crear') && (
                  <Button variant="secondary" size="sm" onClick={() => setShowNewProduct(true)}>
                    <Plus className="h-4 w-4" />
                    Nuevo
                  </Button>
                )}
              </div>
            </div>

            {selectedProduct && (
              <div
                ref={productLineFormRef}
                className="rounded-lg border border-brand-200 bg-brand-50/50 p-3"
              >
                <div className="mb-3 flex items-center gap-2">
                  <ProductImage
                    productoId={selectedProduct.id}
                    hasImage={!!selectedProduct.imagen_path}
                    alt={selectedProduct.nombre}
                    className="h-9 w-9"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-sm font-semibold">
                      {selectedProduct.codigo_interno}
                    </p>
                    <p className="truncate text-xs text-slate-600">{selectedProduct.nombre}</p>
                  </div>
                  <button
                    type="button"
                    className="rounded p-1 text-slate-400 hover:text-slate-600"
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
                      className="w-full"
                      onClick={() => void agregarLineaYContinuar()}
                    >
                      <Plus className="h-4 w-4" />
                      Enter ↵
                    </Button>
                  </div>
                </div>

                {lineaPreview && (
                  <div className="mt-2 rounded-md border border-brand-100 bg-white/80 px-3 py-2 text-sm">
                    <p className="font-medium text-brand-800">{lineaPreview.etiqueta}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Total: {lineaPreview.total}{' '}
                      {modoSalida === 'CAJA' ? 'cajas' : normalizarUnidadProducto(selectedProduct.unidad) + 's'}
                      {stockDisponibleModo != null && (
                        <>
                          {' '}
                          · Stock: {stockDisponibleModo}{' '}
                          {modoSalida === 'CAJA' ? 'cajas' : normalizarUnidadProducto(selectedProduct.unidad) + 's'}
                        </>
                      )}
                    </p>
                  </div>
                )}

                <p className="mt-2 text-xs text-slate-500">
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
          <div className="sticky top-0 z-[2] border-b bg-white/95 px-4 py-2 text-sm backdrop-blur-sm">
            <span className="font-medium">Líneas ({lineas.length})</span>
            {lineas.length > 0 && (
              <span className="float-right font-semibold text-brand-700">{formatTotalCajas(totalGeneral)}</span>
            )}
          </div>
          {lineasListContent}
        </div>

        <div className="shrink-0 border-t bg-white px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xl font-bold text-brand-700">{formatTotalCajas(totalGeneral)}</p>
            {hasPermiso('planillas.crear') && (
              <div className="flex shrink-0 gap-2">
                <Button
                  variant="secondary"
                  onClick={abrirPreview}
                  disabled={lineas.length === 0 || loadingPreview || saving}
                >
                  <Eye className="h-4 w-4" />
                  {loadingPreview ? 'Calculando...' : 'Vista previa'}
                </Button>
                <Button
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
            <div className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-auto rounded-xl border bg-white shadow-xl">
              <div className="sticky top-0 flex items-center justify-between border-b px-5 py-4">
                <h3 className="font-semibold">Vista previa — descuento de stock</h3>
                <button type="button" onClick={() => setShowPreview(false)} className="rounded p-1">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-4 p-5">
                {error && (
                  <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
                )}
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    Fecha: <strong>{fecha}</strong>
                  </div>
                  <div>
                    Planilla: <strong>{numero}</strong>
                  </div>
                  <div className="sm:col-span-2">
                    Camionero:{' '}
                    <strong>
                      {camioneroSeleccionado?.numero_interno} — {camioneroSeleccionado?.nombre}
                    </strong>
                  </div>
                  <div className="sm:col-span-2">
                    Vehículo:{' '}
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
                    className={`rounded-lg border p-3 ${pl.error ? 'border-red-200 bg-red-50/50' : 'border-surface-border'}`}
                  >
                    <p className="font-mono font-semibold">
                      {pl.codigo_interno} — {pl.nombre}
                    </p>
                    <p className="text-sm text-slate-600">
                      Solicitado: {pl.etiqueta} ({formatTotalCajas(pl.total_solicitado)})
                    </p>
                    {pl.error ? (
                      <p className="mt-2 text-sm font-medium text-red-700">{pl.error}</p>
                    ) : (
                      <ul className="mt-2 space-y-1 text-sm">
                        {pl.descuentos.map((d, i) => (
                          <li key={i} className="flex justify-between text-slate-700">
                            <span>
                              {d.sector_nombre}
                              {d.etiqueta && (
                                <span className="ml-1 text-slate-400">({d.etiqueta})</span>
                              )}
                            </span>
                            <span className="font-medium">{formatTotalCajas(d.unidades)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}

                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={confirmarPlanilla}
                    disabled={saving || previewData.some((p) => p.error)}
                  >
                    {saving ? 'Registrando...' : 'Confirmar planilla'}
                  </Button>
                  <Button variant="secondary" onClick={() => setShowPreview(false)}>
                    Volver a editar
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

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
          onCreated={(p) => selectProduct(p)}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Carga de planillas</h1>
          <p className="mt-1 text-slate-500">Salidas de mercadería con descuento automático de stock</p>
        </div>
        {hasPermiso('planillas.crear') && (
          <Button onClick={abrirNuevaPlanilla}>
            <Plus className="h-4 w-4" />
            Nueva planilla
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
                placeholder="Buscar por planilla o camionero... · Enter = nueva planilla"
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
                onKeyDown={handleListSearchKeyDown}
                className="w-full rounded-lg border py-2 pl-10 pr-3 text-sm"
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
            {hasPermiso('planillas.crear') && ' · Enter = nueva planilla'}
          </p>
          {diasConPlanillas.length > 0 && (
            <div className="flex gap-1 overflow-x-auto pb-1">
              {diasConPlanillas.map((dia) => (
                <button
                  key={dia}
                  type="button"
                  onClick={() => setSelectedDay(dia)}
                  className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                    dia === selectedDay
                      ? 'border-brand-500 bg-brand-50 font-semibold text-brand-800'
                      : 'border-surface-border bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {formatDayTabLabel(dia)}
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-xs">
                    {conteoPorDia.get(dia) ?? 0}
                  </span>
                </button>
              ))}
            </div>
          )}
        </CardBody>

        <CardHeader
          title={diasConPlanillas.length > 0 ? formatDayTabLabel(selectedDay) : 'Registros'}
          description={
            diasConPlanillas.length > 0
              ? `${planillasDelDia.length} planilla(s) · ${formatCantidad(totalUnidadesDelDia)} en el día`
              : `${planillas.length} planilla(s)`
          }
        />

        <CardBody className="p-0">
          {error && (
            <div className="border-b bg-red-50 px-6 py-3 text-sm text-red-700">{error}</div>
          )}
          {loadingList ? (
            <p className="p-6 text-sm text-slate-500">Cargando...</p>
          ) : planillas.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <ClipboardList className="h-12 w-12 text-slate-300" />
              <p className="mt-3 font-medium text-slate-700">No hay planillas registradas</p>
            </div>
          ) : planillasDelDia.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">Sin resultados para este día</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50/80 text-left text-xs font-semibold uppercase text-slate-500">
                    <th className="px-6 py-3">Planilla</th>
                    <th className="px-6 py-3">Camionero</th>
                    <th className="px-6 py-3">Modelo</th>
                    <th className="px-6 py-3">Total</th>
                    <th className="px-6 py-3">Usuario</th>
                    <th className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {planillasDelDia.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/50">
                      <td className="px-6 py-3 font-medium">{p.numero}</td>
                      <td className="px-6 py-3">
                        <p>{p.camionero_nombre}</p>
                        <p className="text-xs text-slate-500">{p.camionero_numero}</p>
                      </td>
                      <td className="px-6 py-3 text-slate-500">{p.vehiculo_modelo ?? '—'}</td>
                      <td className="px-6 py-3 font-semibold text-brand-700">{formatCantidad(p.total_unidades)}</td>
                      <td className="px-6 py-3 text-slate-500">{p.usuario_nombre}</td>
                      <td className="px-6 py-3 text-right">
                        <Button variant="ghost" size="sm" onClick={() => verDetalle(p.id)}>
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
    </div>
  )
}
