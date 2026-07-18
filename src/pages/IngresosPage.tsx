import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
  Download,
  Eye,
  Loader2,
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
import { Card, CardBody } from '@/components/ui/Card'
import { calcTotalEnCajas, botellasPorCajaDefault, formatCantidad, formatDayTabLabel, formatEtiqueta, formatTotalCajas, normalizarUnidadProducto, todayIsoDate } from '@/lib/desglose'
import { downloadApiFile } from '@/lib/downloadFile'
import { api, cn } from '@/lib/utils'
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
import { useRegistroListKeyboard } from '@/hooks/useRegistroListKeyboard'

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
  const [exportingId, setExportingId] = useState<number | null>(null)

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

  function scrollListToBottom() {
    requestAnimationFrame(() => {
      const el = listScrollRef.current
      if (el) {
        el.scrollTop = el.scrollHeight
      }
    })
  }

  useEffect(() => {
    if (view !== 'list') return
    const timer = setTimeout(() => listSearchRef.current?.focus(), 80)
    return () => clearTimeout(timer)
  }, [view])

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

  async function exportarIngreso(id: number) {
    setExportingId(id)
    setError('')
    try {
      await downloadApiFile(`/api/ingresos/${id}/export`, `ingreso-${id}.xlsx`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al exportar')
    } finally {
      setExportingId(null)
    }
  }

  const registroListKb = useRegistroListKeyboard({
    enabled: view === 'list',
    items: ingresosDelDia,
    listSearchRef,
    canCreate: hasPermiso('ingresos.crear'),
    onCreate: abrirNuevoIngreso,
    onOpenDetail: (i) => {
      void verDetalle(i.id)
    }
  })

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
      <div ref={createScrollRef} className="-m-4 h-[calc(100vh-5rem)] overflow-y-auto lg:-m-6">
        <div className="mx-auto flex max-w-lg flex-col gap-5 px-4 py-6 pb-16 lg:px-6">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 h-9 self-start rounded-xl px-3"
            onClick={volverAlListadoIngreso}
          >
            <ChevronLeft className="h-4 w-4" />
            Volver al listado
          </Button>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Alta</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Nuevo ingreso</h1>
            <p className="mt-1 text-sm text-slate-500">
              Datos del remito · Enter avanza · Esc vuelve al listado
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
                  <Package className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Remito de ingreso</p>
                  <p className="text-xs text-slate-500">Fecha, número, sector y observaciones</p>
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
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Sector destino *
                </label>
                <select
                  ref={sectorRef}
                  value={sectorId}
                  onChange={(e) => setSectorId(e.target.value)}
                  onKeyDown={(e) => handleRemitoKeyDown(e, observacionRef)}
                  className="w-full rounded-xl border border-surface-border px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
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
              <Button type="button" className="w-full rounded-xl" onClick={irACargaProductos}>
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
            <Package className="h-6 w-6" />
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
                  'flex items-center gap-3 px-4 py-3 transition-colors sm:px-5',
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
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">
                    {grupo.producto.codigo_interno}
                  </span>
                  <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                    {grupo.producto.nombre}
                  </p>
                  {!isExpanded && grupo.lineas.length > 1 && (
                    <p className="mt-0.5 text-xs text-slate-500">{grupo.lineas.length} líneas</p>
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
                        {l.etiqueta}
                        {l.ubicacion_nombre && (
                          <span className="ml-1.5 text-xs text-slate-500">({l.ubicacion_nombre})</span>
                        )}
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
        {/* Panel superior fijo: remito + buscador + formulario */}
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
                onClick={volverAlListadoIngreso}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Salir
              </Button>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-white px-2.5 py-1 font-medium text-slate-700 ring-1 ring-surface-border">
                  {fecha}
                </span>
                <span className="rounded-full bg-white px-2.5 py-1 font-medium text-slate-700 ring-1 ring-surface-border">
                  Remito {numeroRemito}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 font-medium text-brand-800 ring-1 ring-brand-100">
                  <Warehouse className="h-3 w-3" />
                  {sectorSeleccionado?.nombre}
                </span>
              </div>
              <button
                type="button"
                className="ml-auto text-xs font-medium text-brand-600 hover:text-brand-700 hover:underline"
                onClick={() => setCreatePhase('remito')}
              >
                Editar remito
              </button>
            </div>
          </div>

          {error && !showPreview && (
            <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700 sm:px-5">
              {error}
            </div>
          )}

          <div className="space-y-3 overflow-visible p-4 sm:p-5">
            <div className="relative flex flex-col gap-2 overflow-visible sm:flex-row">
              <div className="relative z-30 min-w-0 flex-1">
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
                {searchingProducts && (
                  <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-brand-600" />
                )}
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
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="rounded-xl"
                  onClick={() => setShowScanner(true)}
                >
                  <Camera className="h-4 w-4" />
                  Escanear
                </Button>
                {hasPermiso('productos.crear') && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="rounded-xl"
                    onClick={() => setShowNewProduct(true)}
                  >
                    <Plus className="h-4 w-4" />
                    Nuevo
                  </Button>
                )}
              </div>
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
                    <Button
                      type="button"
                      size="sm"
                      className="w-full rounded-xl"
                      onClick={agregarLineaYContinuar}
                    >
                      <Plus className="h-4 w-4" />
                      Enter ↵
                    </Button>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-slate-500">
                  <span className="font-medium text-slate-600">Pallet:</span> 3 × 112 = 3 pallets de 112
                  cajas.{' '}
                  <span className="font-medium text-slate-600">Caja:</span> 5 × 3 = 5 cajas de 3
                  botellas (cualquier formato de caja suma).{' '}
                  <span className="font-medium text-slate-600">Suelto:</span> pucherio suelto — no suma
                  en movimientos del día.
                </p>
              </div>
            )}
          </div>
        </div>

        <div
          ref={listScrollRef}
          className="relative z-0 min-h-0 flex-1 overflow-y-auto bg-white"
        >
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
            {hasPermiso('ingresos.crear') && (
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button
                  variant="secondary"
                  className="rounded-xl"
                  onClick={abrirPreview}
                  disabled={lineas.length === 0 || saving}
                >
                  <Eye className="h-4 w-4" />
                  Vista previa
                </Button>
                <Button
                  className="rounded-xl"
                  onClick={confirmarIngresoDirecto}
                  disabled={lineas.length === 0 || saving}
                >
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
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Movimientos
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Ingresos
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-500">
            Entrada de mercadería archivada por día, con remito y sector destino.
          </p>
        </div>
        {hasPermiso('ingresos.crear') && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="hidden rounded-full border border-surface-border bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 shadow-card sm:inline-flex">
              Enter = nuevo ingreso
            </span>
            <Button className="rounded-xl px-4" onClick={abrirNuevoIngreso}>
              <Plus className="h-4 w-4" />
              Nuevo ingreso
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
                  placeholder="Buscar por remito..."
                  value={listSearch}
                  onChange={(e) => setListSearch(e.target.value)}
                  onKeyDown={registroListKb.handleListSearchKeyDown}
                  className="w-full rounded-xl border border-surface-border bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
              </div>

              <div className="flex shrink-0 items-center gap-1.5 rounded-xl border border-surface-border bg-white px-2 py-1.5 shadow-sm">
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
            </p>

            <DayTabsRow
              days={diasConIngresos}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
              getCount={(dia) => conteoPorDia.get(dia) ?? 0}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-surface-border bg-slate-50/80 px-5 py-3.5 sm:px-6">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              {diasConIngresos.length > 0 ? formatDayTabLabel(selectedDay) : 'Registros'}
            </h2>
            <p className="text-xs text-slate-500">
              {diasConIngresos.length > 0
                ? `${ingresosDelDia.length} ingreso(s) · ${formatCantidad(totalUnidadesDelDia)} en el día`
                : `${ingresos.length} ingreso(s)`}
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
              Cargando ingresos...
            </div>
          ) : ingresos.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <Package className="h-7 w-7" />
              </div>
              <p className="mt-4 text-sm font-medium text-slate-700">
                {listSearch || listFechaDesde || listFechaHasta
                  ? 'No hay ingresos con esos filtros'
                  : 'No hay ingresos registrados'}
              </p>
              <p className="mt-1 max-w-sm text-xs text-slate-500">
                {listSearch || listFechaDesde || listFechaHasta
                  ? 'Probá ampliar el rango de fechas o cambiar la búsqueda'
                  : 'Cargá el primer ingreso para sumar stock'}
              </p>
              {!(listSearch || listFechaDesde || listFechaHasta) &&
                hasPermiso('ingresos.crear') && (
                  <Button className="mt-4 rounded-xl" size="sm" onClick={abrirNuevoIngreso}>
                    <Plus className="h-4 w-4" />
                    Nuevo ingreso
                  </Button>
                )}
            </div>
          ) : ingresosDelDia.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <Package className="h-7 w-7" />
              </div>
              <p className="mt-4 text-sm font-medium text-slate-700">Sin resultados para este día</p>
              <p className="mt-1 text-xs text-slate-500">Probá otra fecha o ajustá la búsqueda</p>
            </div>
          ) : (
            <ul className="divide-y divide-surface-border">
              {ingresosDelDia.map((i, index) => (
                <li
                  key={i.id}
                  {...registroListKb.listItemProps(
                    index,
                    'flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-slate-50/80 sm:flex-row sm:items-center sm:gap-4 sm:px-6'
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold text-slate-900">{i.numero_remito}</p>
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                        <Warehouse className="h-3 w-3" />
                        {i.sector_nombre}
                      </span>
                    </div>
                    {i.observacion?.trim() ? (
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">{i.observacion}</p>
                    ) : (
                      <p className="mt-1 text-xs text-slate-400">Sin observaciones</p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span>{i.productos_count} producto{i.productos_count === 1 ? '' : 's'}</span>
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {i.usuario_nombre}
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2 sm:justify-end">
                    <span className="inline-flex min-w-[3rem] items-center justify-center rounded-lg bg-brand-50 px-2.5 py-1.5 text-sm font-bold tabular-nums text-brand-700 ring-1 ring-brand-100">
                      {formatCantidad(i.total_unidades)}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="rounded-lg"
                      disabled={exportingId === i.id}
                      onClick={() => void exportarIngreso(i.id)}
                      title="Exportar Excel del registro"
                    >
                      {exportingId === i.id ? (
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
                      onClick={() => verDetalle(i.id)}
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
