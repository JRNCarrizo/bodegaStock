import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
  Eye,
  Package,
  Plus,
  Search,
  Trash2,
  User,
  Warehouse,
  X
} from 'lucide-react'
import { BarcodeScannerModal } from '@/components/BarcodeScannerModal'
import { DayTabsRow } from '@/components/DayTabsRow'
import { ProductQuickCreateModal } from '@/components/ProductQuickCreateModal'
import { ProductImage } from '@/components/ProductImage'
import {
  RegistroDetalleMetaChip,
  RegistroDetalleObsChip,
  RegistroDetallePanel
} from '@/components/RegistroDetallePanel'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge, Card, CardBody, CardHeader } from '@/components/ui/Card'
import { calcTotalEnCajas, botellasPorCajaDefault, formatCantidad, formatDayTabLabel, formatEtiqueta, formatTotalCajas, normalizarUnidadProducto, todayIsoDate } from '@/lib/desglose'
import { api } from '@/lib/utils'
import type {
  IngresoDetalle,
  IngresoLineaDraft,
  IngresoListItem,
  Producto,
  Sector,
  SectorUbicacion
} from '@/types'
import { useAuth } from '@/context/AuthContext'
import { useEscHandler } from '@/hooks/useEscHandler'

function newTempId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeIngresoListItem(row: IngresoListItem): IngresoListItem {
  return {
    ...row,
    total_unidades: Number(row.total_unidades) || 0,
    lineas_count: Number(row.lineas_count) || 0,
    productos_count: Number(row.productos_count) || 0
  }
}

async function enrichIngresosProductosCount(items: IngresoListItem[]): Promise<IngresoListItem[]> {
  if (items.length === 0) return []
  if (items.every((i) => 'productos_count' in (i as object))) {
    return items.map(normalizeIngresoListItem)
  }

  return Promise.all(
    items.map(async (item) => {
      if (item.lineas_count === 0) {
        return normalizeIngresoListItem({ ...item, productos_count: 0 })
      }
      try {
        const det = await api<IngresoDetalle>(`/api/ingresos/${item.id}`)
        const productos_count = new Set(det.lineas.map((l) => l.producto_id)).size
        return normalizeIngresoListItem({
          ...item,
          productos_count,
          total_unidades: Number(det.total_unidades) || Number(item.total_unidades) || 0
        })
      } catch {
        return normalizeIngresoListItem({ ...item, productos_count: 0 })
      }
    })
  )
}

export function IngresosPage() {
  const { hasPermiso } = useAuth()
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list')
  const [ingresos, setIngresos] = useState<IngresoListItem[]>([])
  const [detalle, setDetalle] = useState<IngresoDetalle | null>(null)
  const [listSearch, setListSearch] = useState('')
  const [listFechaDesde, setListFechaDesde] = useState('')
  const [listFechaHasta, setListFechaHasta] = useState('')
  const [selectedDay, setSelectedDay] = useState(() => todayIsoDate())
  const [loadingList, setLoadingList] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const [fecha, setFecha] = useState(todayIsoDate())
  const [numeroRemito, setNumeroRemito] = useState('')
  const [observacion, setObservacion] = useState('')
  const [sectorId, setSectorId] = useState('')
  const [sectores, setSectores] = useState<Sector[]>([])
  const [ubicaciones, setUbicaciones] = useState<SectorUbicacion[]>([])

  const [productSearch, setProductSearch] = useState('')
  const [productResults, setProductResults] = useState<Producto[]>([])
  const [productHighlightIndex, setProductHighlightIndex] = useState(-1)
  const [searchingProducts, setSearchingProducts] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Producto | null>(null)
  const [lineas, setLineas] = useState<IngresoLineaDraft[]>([])

  const [tipoBulto, setTipoBulto] = useState<'PALLET' | 'CAJA'>('PALLET')
  const [cantidadBultos, setCantidadBultos] = useState('')
  const [unidadesPorBulto, setUnidadesPorBulto] = useState('')
  const [ubicacionId, setUbicacionId] = useState('')

  const [showScanner, setShowScanner] = useState(false)
  const [showNewProduct, setShowNewProduct] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [createPhase, setCreatePhase] = useState<'remito' | 'carga'>('remito')
  const [expandedProductos, setExpandedProductos] = useState<Set<number>>(new Set())

  const fechaRef = useRef<HTMLInputElement>(null)
  const remitoRef = useRef<HTMLInputElement>(null)
  const sectorRef = useRef<HTMLSelectElement>(null)
  const observacionRef = useRef<HTMLInputElement>(null)
  const productSearchRef = useRef<HTMLInputElement>(null)
  const productResultsListRef = useRef<HTMLUListElement>(null)
  const tipoRef = useRef<HTMLSelectElement>(null)
  const cantidadBultosRef = useRef<HTMLInputElement>(null)
  const unidadesRef = useRef<HTMLInputElement>(null)
  const ubicacionRef = useRef<HTMLSelectElement>(null)
  const listScrollRef = useRef<HTMLDivElement>(null)
  const listSearchRef = useRef<HTMLInputElement>(null)
  const createScrollRef = useRef<HTMLDivElement>(null)
  const cargaPanelRef = useRef<HTMLDivElement>(null)
  const productLineFormRef = useRef<HTMLDivElement>(null)

  const sectorSeleccionado = sectores.find((s) => s.id === Number(sectorId))

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

  function abrirNuevoIngreso() {
    resetCreateForm()
    setView('create')
  }

  function handleListSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' || !hasPermiso('ingresos.crear')) return
    e.preventDefault()
    abrirNuevoIngreso()
  }

  function shouldAbrirFormularioConEnter(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return true
    if (target.closest('button, a, textarea, [contenteditable="true"]')) return false
    if (target instanceof HTMLInputElement && target.type === 'date') return false
    if (target instanceof HTMLSelectElement) return false
    return true
  }

  useEffect(() => {
    if (view !== 'list' || !hasPermiso('ingresos.crear')) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat) return
      if (!shouldAbrirFormularioConEnter(e.target)) return
      e.preventDefault()
      abrirNuevoIngreso()
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
      if (el) {
        el.scrollTop = el.scrollHeight
      }
    })
  }

  useLayoutEffect(() => {
    if (productHighlightIndex < 0) return
    const list = productResultsListRef.current
    if (!list) return
    const item = list.children[productHighlightIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [productHighlightIndex])

  useEffect(() => {
    setProductHighlightIndex(-1)
  }, [productResults])

  useLayoutEffect(() => {
    if (createPhase === 'carga' && lineas.length > 0) {
      scrollListToBottom()
    }
  }, [lineas.length, createPhase])

  useEffect(() => {
    if (view === 'create' && createPhase === 'remito') {
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

  const loadIngresos = useCallback(async () => {
    setLoadingList(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (listSearch.trim()) params.set('q', listSearch.trim())

      let desde = listFechaDesde
      let hasta = listFechaHasta
      if (desde && hasta && desde > hasta) {
        ;[desde, hasta] = [hasta, desde]
      }
      if (desde) params.set('fecha_desde', desde)
      if (hasta) params.set('fecha_hasta', hasta)

      const data = await api<IngresoListItem[]>(`/api/ingresos?${params}`)
      const enriched = await enrichIngresosProductosCount(data)
      setIngresos(enriched)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar ingresos')
    } finally {
      setLoadingList(false)
    }
  }, [listSearch, listFechaDesde, listFechaHasta])

  useEffect(() => {
    if (view !== 'list') return
    const timer = setTimeout(() => loadIngresos(), 300)
    return () => clearTimeout(timer)
  }, [view, listSearch, listFechaDesde, listFechaHasta, loadIngresos])

  useEffect(() => {
    if (listFechaDesde && !listFechaHasta) {
      setSelectedDay(listFechaDesde)
    } else if (listFechaHasta && !listFechaDesde) {
      setSelectedDay(listFechaHasta)
    } else if (listFechaDesde && listFechaHasta && listFechaDesde === listFechaHasta) {
      setSelectedDay(listFechaDesde)
    }
  }, [listFechaDesde, listFechaHasta])

  useEffect(() => {
    api<Sector[]>('/api/sectores?activo=1')
      .then(setSectores)
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!sectorId || !sectorSeleccionado?.usa_ubicaciones) {
      setUbicaciones([])
      setUbicacionId('')
      return
    }
    api<SectorUbicacion[]>(`/api/sectores/${sectorId}/ubicaciones`)
      .then((data) => setUbicaciones(data.filter((u) => u.activo)))
      .catch(() => setUbicaciones([]))
  }, [sectorId, sectorSeleccionado?.usa_ubicaciones])

  useEffect(() => {
    if (!productSearch.trim()) {
      setProductResults([])
      return
    }
    const timer = setTimeout(async () => {
      setSearchingProducts(true)
      try {
        const data = await api<Producto[]>(
          `/api/productos?q=${encodeURIComponent(productSearch.trim())}&activo=1`
        )
        setProductResults(data.slice(0, 12))
      } catch {
        setProductResults([])
      } finally {
        setSearchingProducts(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [productSearch])

  const totalGeneral = useMemo(
    () => lineas.reduce((s, l) => s + l.total_unidades, 0),
    [lineas]
  )

  const diasConIngresos = useMemo(() => {
    const dias = new Set<string>()
    for (const i of ingresos) dias.add(i.fecha)
    return [...dias].sort((a, b) => b.localeCompare(a))
  }, [ingresos])

  const ingresosDelDia = useMemo(
    () => ingresos.filter((i) => i.fecha === selectedDay),
    [ingresos, selectedDay]
  )

  const totalUnidadesDelDia = useMemo(
    () => ingresosDelDia.reduce((s, i) => s + Number(i.total_unidades || 0), 0),
    [ingresosDelDia]
  )

  const conteoPorDia = useMemo(() => {
    const map = new Map<string, number>()
    for (const i of ingresos) {
      map.set(i.fecha, (map.get(i.fecha) ?? 0) + 1)
    }
    return map
  }, [ingresos])

  useEffect(() => {
    if (loadingList || diasConIngresos.length === 0) return
    if (!diasConIngresos.includes(selectedDay)) {
      const today = todayIsoDate()
      setSelectedDay(diasConIngresos.includes(today) ? today : diasConIngresos[0])
    }
  }, [loadingList, diasConIngresos, selectedDay])

  const lineasPorProducto = useMemo(() => {
    const map = new Map<number, { producto: IngresoLineaDraft; lineas: IngresoLineaDraft[] }>()
    for (const l of lineas) {
      const existing = map.get(l.producto_id)
      if (existing) {
        existing.lineas.push(l)
      } else {
        map.set(l.producto_id, { producto: l, lineas: [l] })
      }
    }
    return [...map.values()].map((g) => ({
      ...g,
      total: g.lineas.reduce((s, l) => s + l.total_unidades, 0)
    }))
  }, [lineas])

  function resetCreateForm() {
    setFecha(todayIsoDate())
    setNumeroRemito('')
    setObservacion('')
    setSectorId('')
    setProductSearch('')
    setProductResults([])
    setSelectedProduct(null)
    setLineas([])
    resetLineaForm()
    setError('')
    setCreatePhase('remito')
    setExpandedProductos(new Set())
  }

  function volverAlListadoIngreso() {
    resetCreateForm()
    setShowPreview(false)
    setShowScanner(false)
    setShowNewProduct(false)
    setView('list')
  }

  function volverAlListadoDesdeDetalle() {
    if (detalle) setSelectedDay(detalle.ingreso.fecha)
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
    if (productResults.length > 0 && !selectedProduct) {
      setProductResults([])
      setProductHighlightIndex(-1)
      return true
    }

    volverAlListadoIngreso()
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

  function defaultUnidadesPorBulto(tipo: 'PALLET' | 'CAJA', p: Producto | null): string {
    if (!p) return tipo === 'PALLET' ? '112' : '6'
    if (tipo === 'PALLET') {
      return String(p.unidades_por_pallet_default ?? 112)
    }
    return String(p.unidades_por_caja_default ?? 6)
  }

  function resetLineaForm(forProduct?: Producto | null) {
    const p = forProduct ?? selectedProduct
    setTipoBulto('PALLET')
    setCantidadBultos('')
    setUnidadesPorBulto(defaultUnidadesPorBulto('PALLET', p))
    setUbicacionId('')
  }

  function handleTipoBultoChange(tipo: 'PALLET' | 'CAJA') {
    setTipoBulto(tipo)
    setUnidadesPorBulto(defaultUnidadesPorBulto(tipo, selectedProduct))
  }

  function selectProduct(p: Producto) {
    setSelectedProduct(p)
    setProductSearch(p.codigo_interno)
    setProductResults([])
    setProductHighlightIndex(-1)
    resetLineaForm(p)
    setError('')
    setTimeout(() => focusField(cantidadBultosRef), 50)
  }

  function validarRemito(): boolean {
    if (!fecha || !numeroRemito.trim()) {
      setError('Completá fecha y número de remito')
      return false
    }
    if (!sectorId) {
      setError('Seleccioná el sector destino')
      return false
    }
    setError('')
    return true
  }

  function irACargaProductos() {
    if (!validarRemito()) return
    setCreatePhase('carga')
  }

  function handleRemitoKeyDown(
    e: React.KeyboardEvent,
    next?: React.RefObject<HTMLInputElement | HTMLSelectElement | null>
  ) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (next?.current) {
      focusField(next)
    } else {
      irACargaProductos()
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
    if (productResults.length === 1) {
      selectProduct(productResults[0])
    }
  }

  function handleProductSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (selectedProduct) return

    const hasDropdown = productResults.length > 0

    if (e.key === 'ArrowDown') {
      if (!hasDropdown) return
      e.preventDefault()
      setProductHighlightIndex((i) => (i < productResults.length - 1 ? i + 1 : 0))
      return
    }

    if (e.key === 'ArrowUp') {
      if (!hasDropdown) return
      e.preventDefault()
      setProductHighlightIndex((i) => (i > 0 ? i - 1 : productResults.length - 1))
      return
    }

    if (e.key === 'Escape') {
      if (!hasDropdown) return
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

  function agregarLinea(): boolean {
    if (!selectedProduct) {
      setError('Seleccioná un producto primero')
      return false
    }
    if (!sectorId) {
      setError('Seleccioná el sector destino')
      return false
    }

    const lineaInput = {
      tipo_bulto: tipoBulto,
      cantidad_bultos: Number(cantidadBultos),
      unidades_por_bulto: Number(unidadesPorBulto)
    }

    if (!Number.isFinite(lineaInput.cantidad_bultos) || lineaInput.cantidad_bultos <= 0) {
      setError(`Indicá la cantidad de ${tipoBulto === 'PALLET' ? 'pallets' : 'cajas'}`)
      return false
    }
    if (!Number.isFinite(lineaInput.unidades_por_bulto) || lineaInput.unidades_por_bulto <= 0) {
      setError('Indicá las unidades por bulto')
      return false
    }

    const totalCajas = calcTotalEnCajas(
      lineaInput,
      botellasPorCajaDefault(selectedProduct.unidades_por_caja_default)
    )
    if (totalCajas <= 0) {
      setError('La cantidad debe ser mayor a cero')
      return false
    }

    const ub = ubicacionId
      ? ubicaciones.find((u) => u.id === Number(ubicacionId))
      : null

    const draft: IngresoLineaDraft = {
      tempId: newTempId(),
      producto_id: selectedProduct.id,
      codigo_interno: selectedProduct.codigo_interno,
      nombre: selectedProduct.nombre,
      tipo_bulto: tipoBulto,
      cantidad_bultos: lineaInput.cantidad_bultos,
      unidades_por_bulto: lineaInput.unidades_por_bulto,
      cantidad_suelta: undefined,
      total_unidades: totalCajas,
      etiqueta: formatEtiqueta(lineaInput, selectedProduct.unidad),
      ubicacion_id: ub?.id ?? null,
      ubicacion_nombre: ub?.nombre ?? null
    }

    setLineas((prev) => [...prev, draft])
    resetLineaForm()
    setError('')
    return true
  }

  function agregarLineaYContinuar() {
    if (!agregarLinea()) return
    setSelectedProduct(null)
    setProductSearch('')
    setProductResults([])
    setTimeout(() => productSearchRef.current?.focus(), 50)
  }

  function handleLineaEnter(e: React.KeyboardEvent) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    agregarLineaYContinuar()
  }

  function quitarLinea(tempId: string) {
    setLineas((prev) => prev.filter((l) => l.tempId !== tempId))
  }

  async function confirmarIngreso() {
    setSaving(true)
    setError('')
    try {
      const result = await api<{ id: number }>('/api/ingresos', {
        method: 'POST',
        body: JSON.stringify({
          fecha,
          numero_remito: numeroRemito,
          observacion: observacion || null,
          sector_id: Number(sectorId),
          lineas: lineas.map((l) => ({
            producto_id: l.producto_id,
            ubicacion_id: l.ubicacion_id ?? null,
            tipo_bulto: l.tipo_bulto,
            cantidad_bultos: l.cantidad_bultos ?? null,
            unidades_por_bulto: l.unidades_por_bulto ?? null,
            cantidad_suelta: l.cantidad_suelta ?? null
          }))
        })
      })
      setShowPreview(false)
      const data = await api<IngresoDetalle>(`/api/ingresos/${result.id}`)
      setDetalle(data)
      setSelectedDay(fecha)
      setView('detail')
      resetCreateForm()
      await loadIngresos()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al confirmar ingreso')
    } finally {
      setSaving(false)
    }
  }

  async function verDetalle(id: number) {
    setError('')
    try {
      const data = await api<IngresoDetalle>(`/api/ingresos/${id}`)
      setDetalle(data)
      setView('detail')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar detalle')
    }
  }

  function validarIngresoParaRegistrar(): boolean {
    if (!fecha || !numeroRemito.trim()) {
      setError('Completá fecha y número de remito')
      return false
    }
    if (!sectorId) {
      setError('Seleccioná el sector destino')
      return false
    }
    if (lineas.length === 0) {
      setError('Agregá al menos una línea de producto')
      return false
    }
    setError('')
    return true
  }

  function abrirPreview() {
    if (!validarIngresoParaRegistrar()) return
    setShowPreview(true)
  }

  function confirmarIngresoDirecto() {
    if (!validarIngresoParaRegistrar()) return
    void confirmarIngreso()
  }

  if (view === 'detail' && detalle) {
    return (
      <RegistroDetallePanel
        onVolver={volverAlListadoDesdeDetalle}
        titulo={`Remito ${detalle.ingreso.numero_remito}`}
        fecha={detalle.ingreso.fecha}
        totalEtiqueta="Total"
        total={detalle.total_unidades}
        meta={
          <>
            <RegistroDetalleMetaChip
              icon={<Warehouse className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
            >
              {detalle.ingreso.sector_nombre}
            </RegistroDetalleMetaChip>
            <RegistroDetalleMetaChip icon={<User className="h-3.5 w-3.5 shrink-0 text-slate-400" />}>
              {detalle.ingreso.usuario_nombre}
            </RegistroDetalleMetaChip>
            {detalle.ingreso.observacion && (
              <RegistroDetalleObsChip>{detalle.ingreso.observacion}</RegistroDetalleObsChip>
            )}
          </>
        }
        lineas={detalle.lineas.map((l) => ({
          id: l.id,
          producto_id: l.producto_id,
          codigo_interno: l.codigo_interno,
          nombre: l.nombre,
          etiqueta: l.ubicacion_nombre ? `${l.etiqueta} (${l.ubicacion_nombre})` : l.etiqueta,
          cantidad: l.total_unidades
        }))}
      />
    )
  }

  if (view === 'create' && createPhase === 'remito') {
    return (
      <div
        ref={createScrollRef}
        className="-m-4 h-[calc(100vh-5rem)] overflow-y-auto lg:-m-6"
      >
        <div className="mx-auto flex max-w-lg flex-col px-4 py-8 pb-16">
        <Button variant="ghost" size="sm" className="mb-4 -ml-2 self-start" onClick={volverAlListadoIngreso}>
          <ChevronLeft className="h-4 w-4" />
          Volver al listado
        </Button>

        <h1 className="text-2xl font-bold text-slate-900">Nuevo ingreso</h1>
        <p className="mt-1 mb-6 text-slate-500">
          Completá el remito con Enter para pasar al siguiente campo · Esc vuelve al listado
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
              onKeyDown={(e) => handleRemitoKeyDown(e, remitoRef)}
              required
            />
            <Input
              ref={remitoRef}
              label="Número de remito *"
              value={numeroRemito}
              onChange={(e) => setNumeroRemito(e.target.value)}
              onKeyDown={(e) => handleRemitoKeyDown(e, sectorRef)}
              placeholder="ej. REM-2024-001"
              required
            />
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Sector destino *</label>
              <select
                ref={sectorRef}
                value={sectorId}
                onChange={(e) => setSectorId(e.target.value)}
                onKeyDown={(e) => handleRemitoKeyDown(e, observacionRef)}
                className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              >
                <option value="">Seleccionar sector...</option>
                {sectores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
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
              onKeyDown={(e) => handleRemitoKeyDown(e)}
              placeholder="Notas sobre el ingreso..."
            />
            <p className="text-xs text-slate-400">Enter en observaciones → carga de productos</p>
            <Button type="button" className="w-full" onClick={irACargaProductos}>
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
                <Badge variant="default">{formatCantidad(grupo.total)}</Badge>
              </div>
              {isExpanded && (
                <ul className="divide-y divide-surface-border border-t border-surface-border bg-surface-muted/20">
                  {grupo.lineas.map((l) => (
                    <li
                      key={l.tempId}
                      className="flex items-center justify-between gap-2 py-2.5 pl-11 pr-4 text-sm"
                    >
                      <div className="text-slate-700">
                        {l.etiqueta}
                        {l.ubicacion_nombre && (
                          <span className="ml-1 text-slate-400">({l.ubicacion_nombre})</span>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="font-semibold text-slate-900">
                          {formatCantidad(l.total_unidades)}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
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
        {/* Panel superior fijo: remito + buscador + formulario */}
        <div
          ref={cargaPanelRef}
          className="relative z-20 shrink-0 overflow-visible border-b border-surface-border bg-white shadow-sm"
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-surface-border px-4 py-2 text-xs text-slate-600">
            <Button variant="ghost" size="sm" className="-ml-2 h-7" onClick={volverAlListadoIngreso}>
              <ChevronLeft className="h-3.5 w-3.5" />
              Salir
            </Button>
            <span><strong className="text-slate-800">{fecha}</strong></span>
            <span>Remito <strong className="text-slate-800">{numeroRemito}</strong></span>
            <span>Sector <strong className="text-slate-800">{sectorSeleccionado?.nombre}</strong></span>
            <button
              type="button"
              className="text-brand-600 hover:underline"
              onClick={() => setCreatePhase('remito')}
            >
              Editar remito
            </button>
          </div>

          {error && !showPreview && (
            <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
          )}

          <div className="space-y-3 overflow-visible p-4">
            <div className="relative flex flex-col gap-2 overflow-visible sm:flex-row">
              <div className="relative z-30 min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
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
                  className="w-full rounded-lg border border-surface-border py-2.5 pl-10 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
                {productResults.length > 0 && !selectedProduct && (
                  <ul
                    ref={productResultsListRef}
                    role="listbox"
                    className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-surface-border bg-white shadow-lg"
                  >
                    {productResults.map((p, index) => (
                      <li key={p.id} role="option" aria-selected={index === productHighlightIndex}>
                        <button
                          type="button"
                          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                            index === productHighlightIndex
                              ? 'bg-brand-50 text-brand-900'
                              : 'hover:bg-slate-50'
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
              <div
                ref={productLineFormRef}
                className="rounded-lg border border-brand-200 bg-brand-50/50 p-3"
              >
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
                      productSearchRef.current?.focus()
                    }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                  <div>
                    <label className="mb-0.5 block text-xs font-medium text-slate-600">Tipo</label>
                    <select
                      ref={tipoRef}
                      value={tipoBulto}
                      onChange={(e) => handleTipoBultoChange(e.target.value as 'PALLET' | 'CAJA')}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          focusField(cantidadBultosRef)
                        }
                      }}
                      className="w-full rounded-lg border border-surface-border px-2 py-1.5 text-sm"
                    >
                      <option value="PALLET">Pallet</option>
                      <option value="CAJA">Caja</option>
                    </select>
                  </div>

                  <Input
                    ref={cantidadBultosRef}
                    label={tipoBulto === 'PALLET' ? 'Cant. pallets' : 'Cant. cajas'}
                    type="number"
                    min="1"
                    value={cantidadBultos}
                    onChange={(e) => setCantidadBultos(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        focusField(unidadesRef)
                      }
                    }}
                    placeholder={tipoBulto === 'PALLET' ? '2' : '1'}
                    className="[&_label]:text-xs"
                  />
                  <Input
                    ref={unidadesRef}
                    label={
                      tipoBulto === 'PALLET'
                        ? '× cajas por pallet'
                        : `× botellas por caja`
                    }
                    type="number"
                    min="1"
                    value={unidadesPorBulto}
                    onChange={(e) => setUnidadesPorBulto(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        if (sectorSeleccionado?.usa_ubicaciones && ubicaciones.length > 0) {
                          ubicacionRef.current?.focus()
                        } else {
                          agregarLineaYContinuar()
                        }
                      }
                    }}
                    placeholder={tipoBulto === 'PALLET' ? '112' : '6'}
                    className="[&_label]:text-xs"
                  />

                  {sectorSeleccionado?.usa_ubicaciones && ubicaciones.length > 0 && (
                    <div>
                      <label className="mb-0.5 block text-xs font-medium text-slate-600">Ubicación</label>
                      <select
                        ref={ubicacionRef}
                        value={ubicacionId}
                        onChange={(e) => setUbicacionId(e.target.value)}
                        onKeyDown={handleLineaEnter}
                        className="w-full rounded-lg border border-surface-border px-2 py-1.5 text-sm"
                      >
                        <option value="">—</option>
                        {ubicaciones.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="flex items-end">
                    <Button type="button" size="sm" className="w-full" onClick={agregarLineaYContinuar}>
                      <Plus className="h-4 w-4" />
                      Enter ↵
                    </Button>
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  <span className="font-medium text-slate-600">Pallet:</span> 3 × 112 = 3 pallets de 112 cajas.
                  {' '}
                  <span className="font-medium text-slate-600">Caja:</span> 30 × 6 = 30 cajas de 6 botellas.
                  {' '}
                  <span className="font-medium text-slate-600">Botellerio:</span> 1 × 4 = 1 caja con 4 botellas.
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Enter en el último campo agrega la línea y vuelve al buscador
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Lista — siempre visible, scroll interno */}
        <div
          ref={listScrollRef}
          className="relative z-0 min-h-0 flex-1 overflow-y-auto bg-white"
        >
          <div className="sticky top-0 z-[2] border-b border-surface-border bg-white/95 px-4 py-2 backdrop-blur-sm">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-700">
                Líneas cargadas ({lineas.length})
              </span>
              {lineas.length > 0 && (
                <span className="text-brand-700 font-semibold">{formatCantidad(totalGeneral)} total</span>
              )}
            </div>
          </div>
          {lineasListContent}
        </div>

        {/* Pie fijo */}
        <div className="shrink-0 border-t border-surface-border bg-white px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs text-slate-500">Total general</p>
              <p className="text-xl font-bold text-brand-700">{formatCantidad(totalGeneral)}</p>
            </div>
            {hasPermiso('ingresos.crear') && (
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={abrirPreview}
                  disabled={lineas.length === 0 || saving}
                >
                  <Eye className="h-4 w-4" />
                  Vista previa
                </Button>
                <Button onClick={confirmarIngresoDirecto} disabled={lineas.length === 0 || saving}>
                  <Check className="h-4 w-4" />
                  {saving ? 'Registrando...' : 'Confirmar ingreso'}
                </Button>
              </div>
            )}
          </div>
        </div>

        {showPreview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/50" onClick={() => setShowPreview(false)} />
            <div className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-auto rounded-xl border border-surface-border bg-white shadow-xl">
              <div className="sticky top-0 flex items-center justify-between border-b border-surface-border bg-white px-5 py-4">
                <h3 className="font-semibold text-slate-900">Vista previa del ingreso</h3>
                <button type="button" onClick={() => setShowPreview(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-4 p-5">
                {error && (
                  <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
                )}
                <div className="grid gap-3 sm:grid-cols-2 text-sm">
                  <div><span className="text-slate-500">Fecha:</span> <strong>{fecha}</strong></div>
                  <div><span className="text-slate-500">Remito:</span> <strong>{numeroRemito}</strong></div>
                  <div className="sm:col-span-2">
                    <span className="text-slate-500">Sector:</span>{' '}
                    <strong>{sectorSeleccionado?.nombre}</strong>
                  </div>
                  {observacion && (
                    <div className="sm:col-span-2">
                      <span className="text-slate-500">Observaciones:</span> {observacion}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-surface-border">
                  {lineasPorProducto.map((grupo) => (
                    <div key={grupo.producto.producto_id} className="border-b border-surface-border last:border-0">
                      <div className="bg-slate-50 px-4 py-2 font-medium text-slate-900">
                        {grupo.producto.codigo_interno} — {grupo.producto.nombre}
                        <span className="float-right text-brand-700">{formatTotalCajas(grupo.total)}</span>
                      </div>
                      <ul className="divide-y divide-surface-border text-sm">
                        {grupo.lineas.map((l) => (
                          <li key={l.tempId} className="flex justify-between px-4 py-2">
                            <span>
                              {l.etiqueta}
                              {l.ubicacion_nombre && ` (${l.ubicacion_nombre})`}
                            </span>
                            <span>{formatTotalCajas(l.total_unidades)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between rounded-lg bg-brand-50 px-4 py-3">
                  <span className="font-medium text-slate-800">Total general</span>
                  <span className="text-xl font-bold text-brand-700">{formatTotalCajas(totalGeneral)}</span>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button onClick={confirmarIngreso} disabled={saving}>
                    {saving ? 'Registrando...' : 'Confirmar ingreso'}
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
          <h1 className="text-2xl font-bold text-slate-900">Ingresos</h1>
          <p className="mt-1 text-slate-500">Entrada de mercadería archivada por día</p>
        </div>
        {hasPermiso('ingresos.crear') && (
          <Button onClick={abrirNuevoIngreso}>
            <Plus className="h-4 w-4" />
            Nuevo ingreso
          </Button>
        )}
      </div>

      <Card>
        <CardBody className="border-b border-surface-border py-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[10rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={listSearchRef}
                type="search"
                placeholder="Buscar por remito... · Enter = nuevo ingreso"
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
                onKeyDown={handleListSearchKeyDown}
                className="w-full rounded-lg border border-surface-border py-2 pl-10 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>

            <div className="flex shrink-0 items-center gap-1.5 rounded-lg border border-surface-border bg-slate-50/60 px-2 py-1">
              <span className="pl-1 text-xs font-medium text-slate-500">Desde</span>
              <input
                id="ingresos-fecha-desde"
                type="date"
                value={listFechaDesde}
                onChange={(e) => setListFechaDesde(e.target.value)}
                title="Fecha desde — solo este campo = ese día"
                className="rounded border-0 bg-transparent px-1 py-1 text-sm focus:outline-none focus:ring-0"
              />
              <span className="text-slate-300">|</span>
              <span className="text-xs font-medium text-slate-500">Hasta</span>
              <input
                id="ingresos-fecha-hasta"
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
                className="shrink-0"
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
            Una sola fecha (Desde o Hasta) filtra ese día · las dos juntas = rango
            {hasPermiso('ingresos.crear') && ' · Enter = nuevo ingreso'}
          </p>

          <DayTabsRow
            days={diasConIngresos}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
            getCount={(dia) => conteoPorDia.get(dia) ?? 0}
          />
        </CardBody>

        <CardHeader
          title={diasConIngresos.length > 0 ? formatDayTabLabel(selectedDay) : 'Registros'}
          description={
            diasConIngresos.length > 0
              ? `${ingresosDelDia.length} ingreso(s) · ${formatCantidad(totalUnidadesDelDia)} en el día`
              : `${ingresos.length} ingreso(s)`
          }
        />

        <CardBody className="p-0">
          {error && (
            <div className="border-b border-red-100 bg-red-50 px-6 py-3 text-sm text-red-700">{error}</div>
          )}
          {loadingList ? (
            <p className="p-6 text-sm text-slate-500">Cargando...</p>
          ) : ingresos.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <Package className="h-12 w-12 text-slate-300" />
              <p className="mt-3 font-medium text-slate-700">
                {listSearch || listFechaDesde || listFechaHasta
                  ? 'No hay ingresos con esos filtros'
                  : 'No hay ingresos registrados'}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {listSearch || listFechaDesde || listFechaHasta
                  ? 'Probá ampliar el rango de fechas o cambiar la búsqueda'
                  : 'Cargá el primer ingreso para sumar stock'}
              </p>
            </div>
          ) : ingresosDelDia.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <Package className="h-12 w-12 text-slate-300" />
              <p className="mt-3 font-medium text-slate-700">Sin resultados para este día</p>
              <p className="mt-1 text-sm text-slate-500">Probá otra fecha o ajustá la búsqueda</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-border bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-6 py-3">Remito</th>
                    <th className="max-w-[14rem] px-6 py-3">Observación</th>
                    <th className="px-6 py-3">Productos</th>
                    <th className="px-6 py-3">Total</th>
                    <th className="px-6 py-3">Usuario</th>
                    <th className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {ingresosDelDia.map((i) => (
                    <tr key={i.id} className="hover:bg-slate-50/50">
                      <td className="px-6 py-3 font-medium text-slate-900">{i.numero_remito}</td>
                      <td className="max-w-[14rem] px-6 py-3 text-slate-600">
                        <div className="overflow-x-auto whitespace-nowrap [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                          {i.observacion?.trim() || '—'}
                        </div>
                      </td>
                      <td className="px-6 py-3 text-slate-500">{i.productos_count}</td>
                      <td className="px-6 py-3 font-semibold text-brand-700">{formatCantidad(i.total_unidades)}</td>
                      <td className="px-6 py-3 text-slate-500">{i.usuario_nombre}</td>
                      <td className="px-6 py-3 text-right">
                        <Button variant="ghost" size="sm" onClick={() => verDetalle(i.id)}>
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
