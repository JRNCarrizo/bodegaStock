import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Box,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
  ClipboardList,
  Download,
  Eye,
  Layers,
  Loader2,
  Package,
  Plus,
  Search,
  User,
  Warehouse,
  X
} from 'lucide-react'
import { BottleIcon } from '@/components/icons/BottleIcon'
import { DayTabsRow } from '@/components/DayTabsRow'
import { ProductQuickCreateModal } from '@/components/ProductQuickCreateModal'
import { SectionHelpButton } from '@/components/SectionHelpButton'
import { ProductImage } from '@/components/ProductImage'
import { ScrollableProductName } from '@/components/ScrollableProductName'
import { SwipeableConteoLinea } from '@/components/SwipeableConteoLinea'
import {
  RegistroDetalleMetaChip,
  RegistroDetalleObsChip,
  RegistroDetallePanel
} from '@/components/RegistroDetallePanel'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardBody } from '@/components/ui/Card'
import {
  calcTotalEnCajas,
  botellasPorCajaDefault,
  cajasPorPalletDefault,
  formatCantidad,
  formatDayTabLabel,
  formatEtiqueta,
  formatTotalCajas,
  formatTotalesInventarioFisicos,
  formatTotalesInventarioResumen,
  normalizarUnidadProducto,
  sumarTotalesInventarioFisicos,
  sumarTotalesInventarioLineas,
  todayIsoDate,
  totalSueltoLineaConteo
} from '@/lib/desglose'
import { downloadApiFile } from '@/lib/downloadFile'
import {
  scrollFocusedFieldIntoSheet,
  useVisualViewportBottomInset
} from '@/hooks/useVisualViewportBottomInset'
import { isNativeApp } from '@/lib/nativeServer'
import { searchDelayMs } from '@/lib/searchDelay'
import { api, cn } from '@/lib/utils'
import { codigoProductoExacto } from '@/lib/productoSearch'
import { KB_HIGHLIGHT_ROW } from '@/lib/listKeyboardHighlight'
import { clearDraft, readDraft, writeDraft } from '@/lib/draftStorage'
import { checkIngresoRemito } from '@/lib/checkDocumentoNumero'
import {
  initialRemitoConPrefijo,
  isRemitoPrefijoOnly,
  readRemitoPrefijo,
  saveRemitoPrefijoFromNumero
} from '@/lib/remitoPrefijo'
import { resolveSectorIdParaIngreso, sortSectoresParaIngreso } from '@/lib/sectores'
import type {
  IngresoDetalle,
  IngresoLineaDraft,
  IngresoListItem,
  Producto,
  Sector,
  SectorUbicacion
} from '@/types'
import { useAuth } from '@/context/AuthContext'
import { useConfirmDialog } from '@/context/ConfirmDialogContext'
import { useMainLayoutFullHeight } from '@/context/MainLayoutContext'
import { useEscHandler } from '@/hooks/useEscHandler'
import { useProductoQuickSearch } from '@/hooks/useProductoQuickSearch'
import { useRegistroFlashHighlight } from '@/hooks/useRegistroFlashHighlight'
import { useRegistroListKeyboard } from '@/hooks/useRegistroListKeyboard'

function newTempId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

const INGRESO_DRAFT_KEY = 'bodegaStock:ingresoDraft:v1'

type IngresoDraftStored = {
  fecha: string
  numeroRemito: string
  observacion: string
  sectorId: string
  ubicacionId: string
  createPhase: 'remito' | 'carga'
  lineas: IngresoLineaDraft[]
}

function readIngresoDraft(): IngresoDraftStored | null {
  const parsed = readDraft<IngresoDraftStored>(INGRESO_DRAFT_KEY)
  if (!parsed || !Array.isArray(parsed.lineas)) return null
  return parsed
}

function writeIngresoDraft(draft: IngresoDraftStored): void {
  writeDraft(INGRESO_DRAFT_KEY, draft)
}

function clearIngresoDraft(): void {
  clearDraft(INGRESO_DRAFT_KEY)
}

function ingresoDraftTieneContenido(d: {
  numeroRemito: string
  observacion: string
  lineas: IngresoLineaDraft[]
}): boolean {
  const remito = d.numeroRemito.trim()
  return (
    d.lineas.length > 0 ||
    (!!remito && !isRemitoPrefijoOnly(remito)) ||
    !!d.observacion.trim()
  )
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
  const { confirm } = useConfirmDialog()
  const { setFlashId, flashClass } = useRegistroFlashHighlight()
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
  const [checkingNumero, setCheckingNumero] = useState(false)
  const [exportingId, setExportingId] = useState<number | null>(null)

  const [fecha, setFecha] = useState(todayIsoDate())
  const [numeroRemito, setNumeroRemito] = useState('')
  const [observacion, setObservacion] = useState('')
  const [sectorId, setSectorId] = useState('')
  const [sectores, setSectores] = useState<Sector[]>([])
  const [ubicaciones, setUbicaciones] = useState<SectorUbicacion[]>([])

  const [productSearch, setProductSearch] = useState('')
  const [productHighlightIndex, setProductHighlightIndex] = useState(-1)
  const [selectedProduct, setSelectedProduct] = useState<Producto | null>(null)
  const {
    results: productResults,
    searching: searchingProducts,
    setResults: setProductResults
  } = useProductoQuickSearch(productSearch, {
    enabled: !!sectorId && !selectedProduct,
    limit: 12
  })
  const [lineas, setLineas] = useState<IngresoLineaDraft[]>([])
  const [totalVistaFisica, setTotalVistaFisica] = useState(false)
  const [totalVistaFisicaIds, setTotalVistaFisicaIds] = useState<Set<number>>(() => new Set())

  const [tipoBulto, setTipoBulto] = useState<'PALLET' | 'CAJA' | 'SUELTO'>('PALLET')
  const [cantidadBultos, setCantidadBultos] = useState('')
  const [unidadesPorBulto, setUnidadesPorBulto] = useState('')
  const [cantidadSuelta, setCantidadSuelta] = useState('')
  const [ubicacionId, setUbicacionId] = useState('')

  const [showNewProduct, setShowNewProduct] = useState(false)
  const [createPhase, setCreatePhase] = useState<'remito' | 'carga'>('remito')
  const [expandedProductos, setExpandedProductos] = useState<Set<number>>(new Set())
  const [tieneBorrador, setTieneBorrador] = useState(false)
  const [editingLineaTempId, setEditingLineaTempId] = useState<string | null>(null)
  const [swipeOpenLineId, setSwipeOpenLineId] = useState<string | null>(null)
  const draftHydratedRef = useRef(false)
  const sectoresRef = useRef(sectores)
  sectoresRef.current = sectores

  const fechaRef = useRef<HTMLInputElement>(null)
  const remitoRef = useRef<HTMLInputElement>(null)
  const sectorRef = useRef<HTMLSelectElement>(null)
  const observacionRef = useRef<HTMLInputElement>(null)
  const productSearchRef = useRef<HTMLInputElement>(null)
  const productResultsListRef = useRef<HTMLUListElement>(null)
  const cantidadBultosRef = useRef<HTMLInputElement>(null)
  const unidadesRef = useRef<HTMLInputElement>(null)
  const cantidadSueltaRef = useRef<HTMLInputElement>(null)
  const ubicacionRef = useRef<HTMLSelectElement>(null)
  const listScrollRef = useRef<HTMLDivElement>(null)
  const listSearchRef = useRef<HTMLInputElement>(null)
  const createScrollRef = useRef<HTMLDivElement>(null)
  const cargaPanelRef = useRef<HTMLDivElement>(null)
  const productLineFormRef = useRef<HTMLDivElement>(null)
  const keyboardBridgeRef = useRef<HTMLInputElement>(null)
  const pendingFocusCantidadRef = useRef(false)
  const nativeApp = isNativeApp()
  const keyboardInset = useVisualViewportBottomInset()
  useMainLayoutFullHeight(view === 'create' && createPhase === 'carga')

  const sectorSeleccionado = sectores.find((s) => s.id === Number(sectorId))
  const sectoresOrdenados = useMemo(() => sortSectoresParaIngreso(sectores), [sectores])
  const usaUbicaciones =
    Boolean(sectorSeleccionado?.usa_ubicaciones) && ubicaciones.length > 0

  function armKeyboardForCantidadModal() {
    if (!nativeApp) return
    pendingFocusCantidadRef.current = true
    keyboardBridgeRef.current?.focus({ preventScroll: true })
  }

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

  function focusRemitoInput() {
    requestAnimationFrame(() => {
      const el = remitoRef.current
      if (!el) return
      el.focus()
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      const pos = el.value.length
      requestAnimationFrame(() => el.setSelectionRange(pos, pos))
    })
  }

  function scrollFieldIntoView(ref: React.RefObject<HTMLElement | null>) {
    requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
  }

  async function abrirNuevoIngreso() {
    if (tieneBorrador && ingresoDraftTieneContenido({ numeroRemito, observacion, lineas })) {
      const ok = await confirm({
        title: 'Ingreso en curso',
        message: 'Hay un ingreso en curso. ¿Descartarlo y empezar uno nuevo?',
        confirmLabel: 'Descartar y continuar',
        tone: 'danger'
      })
      if (!ok) return
    }
    clearIngresoDraft()
    setTieneBorrador(false)
    let data = sectoresRef.current
    try {
      data = await api<Sector[]>('/api/sectores?activo=1')
      setSectores(data)
    } catch {
      /* usar listado en memoria si falla la red */
    }
    resetCreateForm(data)
    setView('create')
  }

  function continuarBorrador() {
    const draft = readIngresoDraft()
    if (draft) {
      setFecha(draft.fecha || todayIsoDate())
      setNumeroRemito(draft.numeroRemito || '')
      setObservacion(draft.observacion || '')
      setSectorId(resolveSectorIdParaIngreso(sectoresRef.current, draft.sectorId || ''))
      setUbicacionId(draft.ubicacionId || '')
      setLineas(draft.lineas || [])
      setCreatePhase(
        draft.lineas?.length > 0 || draft.createPhase === 'carga' ? 'carga' : draft.createPhase || 'remito'
      )
      setTieneBorrador(true)
    }
    setSelectedProduct(null)
    setProductSearch('')
    setProductResults([])
    setError('')
    setView('create')
  }

  async function cancelarIngresoEnCurso() {
    const remito = numeroRemito.trim()
    if (lineas.length > 0 || (remito && !isRemitoPrefijoOnly(remito)) || observacion.trim()) {
      const ok = await confirm({
        title: 'Cancelar ingreso',
        message: '¿Cancelar el ingreso en curso? Se perderán las líneas cargadas.',
        confirmLabel: 'Cancelar ingreso',
        tone: 'danger'
      })
      if (!ok) return
    }
    clearIngresoDraft()
    setTieneBorrador(false)
    resetCreateForm()
    volverAlListadoIngreso()
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
    if (draftHydratedRef.current) return
    draftHydratedRef.current = true
    const draft = readIngresoDraft()
    if (!draft || !ingresoDraftTieneContenido(draft)) {
      setTieneBorrador(false)
      return
    }
    setFecha(draft.fecha || todayIsoDate())
    setNumeroRemito(draft.numeroRemito || '')
    setObservacion(draft.observacion || '')
    setSectorId(resolveSectorIdParaIngreso(sectoresRef.current, draft.sectorId || ''))
    setUbicacionId(draft.ubicacionId || '')
    setLineas(draft.lineas || [])
    setCreatePhase(draft.createPhase || (draft.lineas?.length ? 'carga' : 'remito'))
    setTieneBorrador(true)
  }, [])

  useEffect(() => {
    if (!draftHydratedRef.current) return
    const payload = {
      fecha,
      numeroRemito,
      observacion,
      sectorId,
      ubicacionId,
      createPhase,
      lineas
    }
    if (!ingresoDraftTieneContenido(payload)) {
      clearIngresoDraft()
      setTieneBorrador(false)
      return
    }
    writeIngresoDraft(payload)
    setTieneBorrador(true)
  }, [fecha, numeroRemito, observacion, sectorId, ubicacionId, createPhase, lineas])

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
      setTimeout(() => focusField(sectorId ? productSearchRef : sectorRef), 50)
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
    const timer = setTimeout(() => loadIngresos(), searchDelayMs(listSearch))
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
      .then((data) => {
        setSectores(data)
        setSectorId((prev) => {
          if (view !== 'create') return prev
          return resolveSectorIdParaIngreso(data, prev)
        })
      })
      .catch(() => {})
  }, [view])

  useEffect(() => {
    if (view !== 'create' || sectores.length === 0) return
    setSectorId((prev) => resolveSectorIdParaIngreso(sectores, prev))
  }, [view, createPhase, sectores])

  useLayoutEffect(() => {
    if (view !== 'create' || createPhase !== 'carga' || sectores.length === 0) return
    setSectorId((prev) => resolveSectorIdParaIngreso(sectores, prev))
  }, [view, createPhase, sectores])

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

  const totalGeneral = useMemo(() => sumarTotalesInventarioLineas(lineas), [lineas])
  const resumenGeneral = useMemo(
    () => formatTotalesInventarioResumen(totalGeneral),
    [totalGeneral]
  )
  const resumenFisico = useMemo(
    () => formatTotalesInventarioFisicos(sumarTotalesInventarioFisicos(lineas)),
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

  function labelTotalIngresoLista(i: IngresoListItem): string {
    const showFisico = totalVistaFisicaIds.has(i.id)
    if (showFisico) {
      return formatTotalesInventarioFisicos({
        pallets: Number(i.total_pallets ?? 0),
        cajas: Number(i.total_cajas_fisicas ?? 0),
        suelto: Number(i.total_suelto ?? 0)
      })
    }
    return formatTotalesInventarioResumen({
      cajas: Number(i.total_unidades || 0),
      suelto: Number(i.total_suelto ?? 0)
    })
  }

  function toggleTotalIngresoLista(id: number) {
    setTotalVistaFisicaIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

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
      // Mantener "hoy" aunque aún no haya registros (inicio del día / recién cargado).
      if (selectedDay === today) return
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
      total: g.lineas.reduce((s, l) => s + l.total_unidades, 0),
      totalSuelto: g.lineas.reduce((s, l) => s + totalSueltoLineaConteo(l), 0)
    }))
  }, [lineas])

  function resetCreateForm(sectoresList: Sector[] = sectoresRef.current) {
    setFecha(todayIsoDate())
    setNumeroRemito(initialRemitoConPrefijo())
    setObservacion('')
    setSectorId(resolveSectorIdParaIngreso(sectoresList, ''))
    setUbicacionId('')
    setProductSearch('')
    setProductResults([])
    setSelectedProduct(null)
    setLineas([])
    resetLineaForm()
    setError('')
    setCreatePhase('remito')
    setExpandedProductos(new Set())
    setEditingLineaTempId(null)
    setSwipeOpenLineId(null)
  }

  function volverAlListadoIngreso() {
    setSelectedProduct(null)
    setProductSearch('')
    setProductResults([])
    setShowNewProduct(false)
    setError('')
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
    if (tipo === 'PALLET') {
      return String(cajasPorPalletDefault(p?.unidades_por_pallet_default))
    }
    return String(botellasPorCajaDefault(p?.unidades_por_caja_default))
  }

  function palletCantidadActiva(value: string): boolean {
    const n = value.trim() === '' ? 0 : Number(value)
    return Number.isFinite(n) && n > 0
  }

  const palletConBultos = tipoBulto === 'PALLET' && palletCantidadActiva(cantidadBultos)

  function resetLineaForm(forProduct?: Producto | null) {
    const p = forProduct ?? selectedProduct
    setTipoBulto('PALLET')
    setCantidadBultos('')
    setUnidadesPorBulto(defaultUnidadesPorBulto('PALLET', p))
    setCantidadSuelta('')
    setUbicacionId('')
  }

  function handleTipoBultoChange(tipo: 'PALLET' | 'CAJA' | 'SUELTO') {
    const targetEl =
      tipo === 'SUELTO' ? cantidadSueltaRef.current : cantidadBultosRef.current
    // Si el input con foco se va a ocultar, mover el foco ANTES del setState
    // para que Android no cierre y reabra el teclado.
    if (nativeApp && targetEl && document.activeElement !== targetEl) {
      targetEl.focus({ preventScroll: true })
    }

    setTipoBulto(tipo)
    if (tipo === 'SUELTO') {
      setCantidadBultos('')
      setUnidadesPorBulto('')
      setCantidadSuelta('')
    } else {
      setCantidadSuelta('')
      setUnidadesPorBulto(defaultUnidadesPorBulto(tipo, selectedProduct))
    }

    requestAnimationFrame(() => {
      const el =
        tipo === 'SUELTO' ? cantidadSueltaRef.current : cantidadBultosRef.current
      if (!el) return
      if (document.activeElement !== el) el.focus({ preventScroll: true })
      if (nativeApp) scrollFocusedFieldIntoSheet(el, 0)
      else el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      el.select()
    })
  }

  function selectProduct(p: Producto) {
    if (!sectorId) {
      setError('Seleccioná el sector destino primero')
      return
    }
    if (usaUbicaciones && !ubicacionId) {
      setError('Seleccioná la ubicación dentro del sector')
      focusField(ubicacionRef)
      return
    }
    armKeyboardForCantidadModal()
    setEditingLineaTempId(null)
    setSelectedProduct(p)
    setProductSearch(p.codigo_interno)
    setProductResults([])
    setProductHighlightIndex(-1)
    resetLineaForm(p)
    setError('')
    if (!nativeApp) {
      setTimeout(() => focusField(cantidadBultosRef), 50)
    }

    // Refresca defaults (botellas/caja) alineados al stock real.
    void api<Producto>(`/api/productos/${p.id}`)
      .then((fresh) => {
        setSelectedProduct((cur) => (cur?.id === fresh.id ? fresh : cur))
      })
      .catch(() => {
        /* keep list product */
      })
  }

  useEffect(() => {
    if (!nativeApp || !selectedProduct || !pendingFocusCantidadRef.current) return
    pendingFocusCantidadRef.current = false
    const id = window.requestAnimationFrame(() => {
      const ref = tipoBulto === 'SUELTO' ? cantidadSueltaRef : cantidadBultosRef
      focusField(ref)
      scrollFocusedFieldIntoSheet(ref.current, 0)
    })
    return () => window.cancelAnimationFrame(id)
  }, [nativeApp, selectedProduct, tipoBulto, editingLineaTempId])

  function cancelarLineaForm() {
    setEditingLineaTempId(null)
    setSelectedProduct(null)
    setProductSearch('')
    setProductResults([])
    resetLineaForm(null)
    setError('')
    setTimeout(() => productSearchRef.current?.focus(), 50)
  }

  function empezarEditarLinea(l: IngresoLineaDraft) {
    setSwipeOpenLineId(null)
    armKeyboardForCantidadModal()
    setEditingLineaTempId(l.tempId)
    setExpandedProductos((prev) => new Set(prev).add(l.producto_id))
    setSectorId(String(l.sector_id))
    setUbicacionId(l.ubicacion_id != null ? String(l.ubicacion_id) : '')
    setSelectedProduct({
      id: l.producto_id,
      codigo_interno: l.codigo_interno,
      codigo_barras: null,
      nombre: l.nombre,
      descripcion: null,
      imagen_path: null,
      unidad: l.unidad,
      unidades_por_pallet_default:
        l.tipo_bulto === 'PALLET' ? (l.unidades_por_bulto ?? null) : null,
      unidades_por_caja_default:
        l.tipo_bulto === 'CAJA' ? (l.unidades_por_bulto ?? null) : null,
      activo: 1,
      created_at: '',
      updated_at: ''
    })
    setProductSearch(l.codigo_interno)
    setProductResults([])
    setTipoBulto(l.tipo_bulto)
    if (l.tipo_bulto === 'SUELTO') {
      setCantidadBultos('')
      setUnidadesPorBulto('')
      setCantidadSuelta(String(l.cantidad_suelta ?? ''))
    } else {
      setCantidadBultos(
        l.cantidad_bultos != null && l.cantidad_bultos > 0 ? String(l.cantidad_bultos) : ''
      )
      setUnidadesPorBulto(l.unidades_por_bulto != null ? String(l.unidades_por_bulto) : '')
      setCantidadSuelta(
        l.cantidad_suelta != null && l.cantidad_suelta > 0 ? String(l.cantidad_suelta) : ''
      )
    }
    setError('')
    if (!nativeApp) {
      scrollFieldIntoView(productLineFormRef)
      setTimeout(
        () => focusField(l.tipo_bulto === 'SUELTO' ? cantidadSueltaRef : cantidadBultosRef),
        50
      )
    }
    void api<Producto>(`/api/productos/${l.producto_id}`)
      .then((fresh) => {
        setSelectedProduct((cur) => (cur?.id === fresh.id ? fresh : cur))
      })
      .catch(() => {
        /* keep draft product */
      })
  }

  function validarRemito(): boolean {
    if (!fecha || !numeroRemito.trim()) {
      setError('Completá fecha y número de remito')
      return false
    }
    if (isRemitoPrefijoOnly(numeroRemito)) {
      setError('Completá el número después del guión')
      focusRemitoInput()
      return false
    }
    setError('')
    return true
  }

  async function irACargaProductos() {
    if (!validarRemito()) return
    setCheckingNumero(true)
    setError('')
    try {
      const dup = await checkIngresoRemito(numeroRemito)
      if (dup) {
        setError(dup)
        focusRemitoInput()
        return
      }
      const resolved = resolveSectorIdParaIngreso(sectoresRef.current, sectorId)
      setSectorId(resolved)
      setCreatePhase('carga')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo verificar el número de remito')
    } finally {
      setCheckingNumero(false)
    }
  }

  function handleRemitoKeyDown(
    e: React.KeyboardEvent,
    next?: React.RefObject<HTMLInputElement | HTMLSelectElement | null>
  ) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (next?.current) {
      if (next === remitoRef) focusRemitoInput()
      else focusField(next)
    } else {
      void irACargaProductos()
    }
  }

  function handleCargaSectorKeyDown(e: React.KeyboardEvent<HTMLSelectElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (!sectorId) {
      setError('Seleccioná el sector destino')
      return
    }
    setError('')
    if (usaUbicaciones) {
      focusField(ubicacionRef)
      return
    }
    focusField(productSearchRef)
  }

  function handleCargaUbicacionKeyDown(e: React.KeyboardEvent<HTMLSelectElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (usaUbicaciones && !ubicacionId) {
      setError('Seleccioná la ubicación dentro del sector')
      return
    }
    setError('')
    focusField(productSearchRef)
  }

  function pickProductFromSearch() {
    if (!productSearch.trim()) return
    const term = productSearch.trim()
    const exact = productResults.find((p) =>
      codigoProductoExacto(p.codigo_interno, p.codigo_barras, term)
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
    if (!sectorSeleccionado) {
      setError('Sector destino no válido')
      return false
    }
    if (usaUbicaciones && !ubicacionId) {
      setError('Seleccioná la ubicación dentro del sector')
      focusField(ubicacionRef)
      return false
    }

    const sueltaNum = cantidadSuelta.trim() === '' ? 0 : Number(cantidadSuelta)
    const bultosNum = cantidadBultos.trim() === '' ? 0 : Number(cantidadBultos)
    const soloSueltasPallet =
      tipoBulto === 'PALLET' && (!Number.isFinite(bultosNum) || bultosNum <= 0) && sueltaNum > 0

    const porBultoResolved =
      tipoBulto === 'SUELTO'
        ? 0
        : tipoBulto === 'CAJA'
          ? Number(unidadesPorBulto) > 0
            ? Number(unidadesPorBulto)
            : Number(defaultUnidadesPorBulto('CAJA', selectedProduct))
          : Number(unidadesPorBulto) > 0
            ? Number(unidadesPorBulto)
            : Number(defaultUnidadesPorBulto('PALLET', selectedProduct))

    const lineaInput =
      tipoBulto === 'SUELTO'
        ? {
            tipo_bulto: tipoBulto,
            cantidad_suelta: sueltaNum
          }
        : {
            tipo_bulto: tipoBulto,
            cantidad_bultos: bultosNum,
            unidades_por_bulto: porBultoResolved,
            cantidad_suelta: sueltaNum
          }

    if (!Number.isFinite(sueltaNum) || sueltaNum < 0) {
      setError('Cantidad suelta inválida')
      return false
    }

    if (tipoBulto === 'SUELTO') {
      if (sueltaNum <= 0) {
        setError('Indicá la cantidad suelta')
        return false
      }
    } else if (soloSueltasPallet) {
      if (!Number.isFinite(bultosNum) || bultosNum < 0) {
        setError('Cantidad de pallets inválida')
        return false
      }
      if (!Number.isFinite(porBultoResolved) || porBultoResolved <= 0) {
        setError('No hay cajas por pallet definidas para este producto')
        return false
      }
    } else if (tipoBulto === 'PALLET' && bultosNum <= 0 && sueltaNum <= 0) {
      setError('Indicá pallets o cajas sueltas')
      focusField(cantidadBultosRef)
      return false
    } else {
      if (!Number.isFinite(bultosNum) || bultosNum <= 0) {
        setError(`Indicá la cantidad de ${tipoBulto === 'PALLET' ? 'pallets' : 'cajas'}`)
        return false
      }
      if (!Number.isFinite(porBultoResolved) || porBultoResolved <= 0) {
        setError(
          tipoBulto === 'CAJA'
            ? 'No hay botellas por caja definidas para este producto'
            : 'Indicá las cajas por pallet'
        )
        return false
      }
    }

    const totalCajas = calcTotalEnCajas(
      lineaInput,
      botellasPorCajaDefault(selectedProduct.unidades_por_caja_default)
    )
    if (tipoBulto !== 'SUELTO' && totalCajas <= 0) {
      setError('La cantidad debe ser mayor a cero')
      return false
    }

    const ub = ubicacionId
      ? ubicaciones.find((u) => u.id === Number(ubicacionId))
      : null

    const draft: IngresoLineaDraft = {
      tempId: editingLineaTempId ?? newTempId(),
      producto_id: selectedProduct.id,
      codigo_interno: selectedProduct.codigo_interno,
      nombre: selectedProduct.nombre,
      unidad: selectedProduct.unidad,
      tipo_bulto: tipoBulto,
      cantidad_bultos: tipoBulto === 'SUELTO' ? undefined : bultosNum,
      unidades_por_bulto:
        tipoBulto === 'SUELTO' ? undefined : Number(lineaInput.unidades_por_bulto),
      cantidad_suelta: sueltaNum > 0 ? sueltaNum : undefined,
      total_unidades: totalCajas,
      etiqueta: formatEtiqueta(lineaInput, selectedProduct.unidad),
      sector_id: Number(sectorId),
      sector_nombre: sectorSeleccionado.nombre,
      ubicacion_id: ub?.id ?? null,
      ubicacion_nombre: ub?.nombre ?? null
    }

    setLineas((prev) =>
      editingLineaTempId
        ? prev.map((l) => (l.tempId === editingLineaTempId ? draft : l))
        : [...prev, draft]
    )
    setEditingLineaTempId(null)
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
    setSwipeOpenLineId(null)
    if (editingLineaTempId === tempId) {
      setEditingLineaTempId(null)
      setSelectedProduct(null)
      setProductSearch('')
      resetLineaForm(null)
    }
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
          lineas: lineas.map((l) => ({
            producto_id: l.producto_id,
            sector_id: l.sector_id,
            ubicacion_id: l.ubicacion_id ?? null,
            tipo_bulto: l.tipo_bulto,
            cantidad_bultos: l.cantidad_bultos ?? null,
            unidades_por_bulto: l.unidades_por_bulto ?? null,
            cantidad_suelta: l.cantidad_suelta ?? null
          }))
        })
      })
      saveRemitoPrefijoFromNumero(numeroRemito)
      clearIngresoDraft()
      setTieneBorrador(false)
      resetCreateForm()
      setDetalle(null)
      await loadIngresos()
      setSelectedDay(fecha)
      setFlashId(result.id)
      setView('list')
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
    onCreate: () => {
      if (tieneBorrador) continuarBorrador()
      else abrirNuevoIngreso()
    },
    onOpenDetail: (i) => {
      void verDetalle(i.id)
    }
  })

  function validarIngresoParaRegistrar(): boolean {
    if (!fecha || !numeroRemito.trim()) {
      setError('Completá fecha y número de remito')
      return false
    }
    if (isRemitoPrefijoOnly(numeroRemito)) {
      setError('Completá el número después del guión')
      return false
    }
    if (lineas.length === 0) {
      setError('Agregá al menos una línea de producto')
      return false
    }
    if (lineas.some((l) => !l.sector_id)) {
      setError('Todas las líneas necesitan sector destino')
      return false
    }
    if (
      lineas.some((l) => {
        const sec = sectores.find((s) => s.id === l.sector_id)
        return !!sec?.usa_ubicaciones && l.ubicacion_id == null
      })
    ) {
      setError('Todas las líneas en sectores con ubicaciones necesitan ubicación asignada')
      return false
    }
    setError('')
    return true
  }

  function confirmarIngresoDirecto() {
    if (!validarIngresoParaRegistrar()) return
    void confirmarIngreso()
  }

  if (view === 'detail' && detalle) {
    const resumenFisicoDetalle = formatTotalesInventarioFisicos(
      sumarTotalesInventarioFisicos(detalle.lineas)
    )
    const resumenGeneralDetalle = formatTotalesInventarioResumen(
      sumarTotalesInventarioLineas(
        detalle.lineas.map((l) => ({
          tipo_bulto: (l.tipo_bulto as 'PALLET' | 'CAJA' | 'SUELTO') || 'CAJA',
          cantidad_bultos: l.cantidad_bultos,
          unidades_por_bulto: l.unidades_por_bulto,
          cantidad_suelta: l.cantidad_suelta
        }))
      )
    )

    return (
      <RegistroDetallePanel
        onVolver={volverAlListadoDesdeDetalle}
        titulo={`Remito ${detalle.ingreso.numero_remito}`}
        fecha={detalle.ingreso.fecha}
        totalEtiqueta="Total"
        total={detalle.total_unidades}
        totalTexto={resumenGeneralDetalle}
        totalFisicoTexto={resumenFisicoDetalle}
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
          etiqueta: l.etiqueta,
          cantidad: l.total_unidades,
          extra: (
            <span className="text-xs text-slate-500">
              {l.sector_nombre}
              {l.ubicacion_nombre ? ` (${l.ubicacion_nombre})` : ''}
            </span>
          ),
          extraKey: `${l.sector_nombre}|${l.ubicacion_nombre ?? ''}`,
          extraSoloDesglose: true
        }))}
      />
    )
  }

  if (view === 'create' && createPhase === 'remito') {
    const remitoPrefijoGuardado = readRemitoPrefijo()
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
                  <p className="text-xs text-slate-500">Fecha, número y observaciones</p>
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
                onFocus={() => {
                  if (!isRemitoPrefijoOnly(numeroRemito)) return
                  requestAnimationFrame(() => {
                    const el = remitoRef.current
                    if (!el) return
                    const pos = el.value.length
                    el.setSelectionRange(pos, pos)
                  })
                }}
                onKeyDown={(e) => handleRemitoKeyDown(e, observacionRef)}
                placeholder="ej. 0001-00012345"
                required
              />
              {remitoPrefijoGuardado ? (
                <p className="text-xs text-slate-400">
                  Prefijo recordado: {remitoPrefijoGuardado} — cargá solo el número después del guión.
                </p>
              ) : null}
              <Input
                ref={observacionRef}
                label="Observaciones"
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                onFocus={() => scrollFieldIntoView(observacionRef)}
                onKeyDown={(e) => handleRemitoKeyDown(e)}
                placeholder="Notas sobre el ingreso..."
              />
              <p className="text-xs text-slate-400">
                Enter en observaciones → carga de productos (el destino se elige ahí)
              </p>
              <Button
                type="button"
                className="w-full rounded-xl"
                disabled={checkingNumero}
                onClick={() => void irACargaProductos()}
              >
                {checkingNumero ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verificando número...
                  </>
                ) : (
                  'Continuar a productos'
                )}
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
                  <ScrollableProductName className="min-w-0 flex-1 text-sm font-semibold text-slate-900">
                    {grupo.producto.nombre}
                  </ScrollableProductName>
                  {!isExpanded && grupo.lineas.length > 1 && (
                    <span className="shrink-0 text-xs text-slate-500">
                      · {grupo.lineas.length} líneas
                    </span>
                  )}
                </button>
                <div className="shrink-0 text-right">
                  <span className="inline-flex items-center rounded-lg bg-brand-50 px-2.5 py-1.5 text-sm font-bold tabular-nums text-brand-700 ring-1 ring-brand-100">
                    {formatCantidad(grupo.total)}
                  </span>
                  {grupo.totalSuelto > 0 && (
                    <p className="mt-1 text-[11px] font-medium text-slate-500">
                      + {formatCantidad(grupo.totalSuelto)}{' '}
                      {normalizarUnidadProducto(grupo.producto.unidad)}
                      {grupo.totalSuelto === 1 ? '' : 's'} sueltas
                    </p>
                  )}
                </div>
              </div>
              {isExpanded && (
                <ul className="space-y-2 border-t border-brand-100/80 bg-gradient-to-b from-surface-muted/40 to-white px-4 py-3 sm:px-5">
                  {grupo.lineas.map((l) => (
                    <SwipeableConteoLinea
                      key={l.tempId}
                      open={swipeOpenLineId === l.tempId}
                      onOpenChange={(open) => setSwipeOpenLineId(open ? l.tempId : null)}
                      onEdit={() => empezarEditarLinea(l)}
                      onDelete={() => quitarLinea(l.tempId)}
                    >
                      <div className="min-w-0 flex-1 text-slate-800">
                        {l.etiqueta}
                        <span className="ml-1.5 text-xs text-slate-500">
                          {l.sector_nombre}
                          {l.ubicacion_nombre ? ` (${l.ubicacion_nombre})` : ''}
                        </span>
                      </div>
                      <span className="shrink-0 rounded-md bg-slate-50 px-2 py-1 text-sm font-semibold tabular-nums text-slate-900 ring-1 ring-surface-border">
                        {l.tipo_bulto === 'SUELTO'
                          ? `${formatCantidad(l.cantidad_suelta ?? 0)} ${normalizarUnidadProducto(
                              l.unidad
                            )}${l.cantidad_suelta === 1 ? '' : 's'}`
                          : formatCantidad(l.total_unidades)}
                      </span>
                    </SwipeableConteoLinea>
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
          'flex min-h-0 flex-col overflow-hidden bg-surface-muted/30',
          nativeApp
            ? 'fixed inset-x-0 bottom-0 top-14 z-10'
            : 'h-full min-h-0 flex-1'
        )}
      >
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

          {error && (
            <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700 sm:px-5">
              {error}
            </div>
          )}

          <div className="space-y-3 overflow-visible p-4 sm:p-5">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="flex items-center rounded-xl border border-surface-border bg-white focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20">
                <span className="shrink-0 pl-3 text-xs font-medium text-slate-400">Destino</span>
                <select
                  ref={sectorRef}
                  value={sectorId}
                  onChange={(e) => {
                    setSectorId(e.target.value)
                    setUbicacionId('')
                  }}
                  onKeyDown={handleCargaSectorKeyDown}
                  className="min-w-0 flex-1 border-0 bg-transparent py-2 pl-2 pr-3 text-sm focus:outline-none"
                >
                  <option value="">Elegir sector…</option>
                  {sectoresOrdenados.map((s) => (
                    <option key={s.id} value={String(s.id)}>
                      {s.nombre}
                      {Boolean(s.ingreso_por_defecto) ? ' (por defecto)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              {usaUbicaciones && (
                <div className="flex items-center rounded-xl border border-surface-border bg-white focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20">
                  <span className="shrink-0 pl-3 text-xs font-medium text-slate-400">Ubicación</span>
                  <select
                    ref={ubicacionRef}
                    value={ubicacionId}
                    onChange={(e) => {
                      setUbicacionId(e.target.value)
                      setError('')
                    }}
                    onKeyDown={handleCargaUbicacionKeyDown}
                    className="min-w-0 flex-1 border-0 bg-transparent py-2 pl-2 pr-3 text-sm focus:outline-none"
                    aria-label="Ubicación"
                  >
                    <option value="">Seleccionar ubicación…</option>
                    {ubicaciones.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="relative flex flex-col gap-2 overflow-visible sm:flex-row">
              <div className="relative z-30 min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400" />
                <input
                  ref={productSearchRef}
                  type="search"
                  role="combobox"
                  aria-expanded={productResults.length > 0 && !selectedProduct}
                  aria-autocomplete="list"
                  placeholder={
                    !sectorId
                      ? 'Primero elegí sector destino'
                      : usaUbicaciones && !ubicacionId
                        ? 'Primero elegí ubicación'
                        : 'Buscar producto — ↑↓ navegar · Enter seleccionar'
                  }
                  value={productSearch}
                  disabled={!sectorId || (usaUbicaciones && !ubicacionId)}
                  onChange={(e) => {
                    setProductSearch(e.target.value)
                    setProductHighlightIndex(-1)
                    if (selectedProduct && e.target.value !== selectedProduct.codigo_interno) {
                      setSelectedProduct(null)
                    }
                  }}
                  onKeyDown={handleProductSearchKeyDown}
                  className="w-full rounded-xl border border-surface-border bg-white py-2.5 pl-10 pr-3 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
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
              {hasPermiso('productos.crear') && (
                <div className="flex shrink-0 justify-end">
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
                </div>
              )}
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
                      ? 'fixed inset-x-0 z-50 mx-auto w-full max-w-3xl overflow-y-auto overscroll-contain rounded-t-2xl border-2 border-b-0 border-brand-400 bg-white p-4 shadow-[0_-12px_40px_rgba(15,23,42,0.25)] ring-4 ring-brand-500/15 transition-[bottom,max-height] duration-200 ease-out'
                      : 'overflow-hidden rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50/80 to-white p-4 shadow-card'
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
                      <span className="inline-flex rounded-md bg-white px-2 py-0.5 font-mono text-xs font-semibold text-slate-700 ring-1 ring-surface-border">
                        {selectedProduct.codigo_interno}
                      </span>
                      <p className="ml-auto shrink-0 text-[10px] font-semibold uppercase tracking-wide text-brand-600">
                        {editingLineaTempId ? 'Editar línea' : 'Nueva línea'}
                      </p>
                    </div>
                    <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                      {selectedProduct.nombre}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-600"
                    onClick={cancelarLineaForm}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:gap-3">
                  <div className="w-full shrink-0 lg:w-[17.5rem]">
                    <label className="mb-0.5 block text-xs font-medium text-slate-600">Tipo</label>
                    <div className="flex rounded-xl border border-surface-border bg-slate-50 p-0.5">
                      {(
                        [
                          {
                            value: 'PALLET' as const,
                            label: 'Pallets',
                            Icon: Layers,
                            active:
                              'bg-indigo-600 text-white shadow-md ring-2 ring-indigo-500/40',
                            idle: 'text-indigo-700/75 hover:bg-indigo-50 hover:text-indigo-900'
                          },
                          {
                            value: 'CAJA' as const,
                            label: 'Cajas',
                            Icon: Box,
                            active:
                              'bg-amber-600 text-white shadow-md ring-2 ring-amber-500/40',
                            idle: 'text-amber-800/80 hover:bg-amber-50 hover:text-amber-950'
                          },
                          {
                            value: 'SUELTO' as const,
                            label: 'Botellas',
                            Icon: BottleIcon,
                            active:
                              'bg-emerald-600 text-white shadow-md ring-2 ring-emerald-500/40',
                            idle: 'text-emerald-800/75 hover:bg-emerald-50 hover:text-emerald-950'
                          }
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onPointerDown={(e) => e.preventDefault()}
                          onClick={() => handleTipoBultoChange(opt.value)}
                          className={cn(
                            'flex flex-1 items-center justify-center gap-1.5 rounded-[10px] px-2 py-2 text-sm font-semibold transition-colors',
                            tipoBulto === opt.value ? opt.active : opt.idle
                          )}
                        >
                          <opt.Icon className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                          <span className="truncate">{opt.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {tipoBulto === 'SUELTO' ? (
                        <Input
                          ref={cantidadSueltaRef}
                          label={`Cant. ${normalizarUnidadProducto(selectedProduct.unidad)}s sueltas`}
                          type="number"
                          min="1"
                          value={cantidadSuelta}
                          onChange={(e) => setCantidadSuelta(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              agregarLineaYContinuar()
                            }
                          }}
                          placeholder="3"
                          leading={<BottleIcon className="h-4 w-4" />}
                          className="[&_label]:text-xs"
                        />
                      ) : (
                        <Input
                          ref={cantidadBultosRef}
                          label={tipoBulto === 'PALLET' ? 'Cant. pallets' : 'Cant. cajas'}
                          type="number"
                          min={tipoBulto === 'PALLET' ? '0' : '1'}
                          value={cantidadBultos}
                          onChange={(e) => setCantidadBultos(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              if (tipoBulto === 'CAJA') {
                                focusField(cantidadSueltaRef)
                              } else if (palletCantidadActiva(cantidadBultos)) {
                                focusField(unidadesRef)
                              } else {
                                focusField(cantidadSueltaRef)
                              }
                            }
                          }}
                          placeholder={tipoBulto === 'PALLET' ? '0 o vacío → sueltas' : '1'}
                          leading={
                            tipoBulto === 'PALLET' ? (
                              <Layers className="h-4 w-4" aria-hidden />
                            ) : (
                              <Box className="h-4 w-4" aria-hidden />
                            )
                          }
                          className="[&_label]:text-xs"
                        />
                      )}

                      <div
                        className={cn(
                          tipoBulto !== 'PALLET' && 'invisible pointer-events-none',
                          tipoBulto === 'PALLET' &&
                            !palletConBultos &&
                            'pointer-events-none opacity-40'
                        )}
                        aria-hidden={tipoBulto !== 'PALLET'}
                      >
                        <Input
                          ref={unidadesRef}
                          label="× cajas por pallet"
                          type="number"
                          min="1"
                          value={tipoBulto === 'PALLET' ? unidadesPorBulto : ''}
                          onChange={(e) => setUnidadesPorBulto(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              focusField(cantidadSueltaRef)
                            }
                          }}
                          placeholder="112"
                          leading={<Box className="h-4 w-4" aria-hidden />}
                          disabled={tipoBulto === 'PALLET' && !palletConBultos}
                          tabIndex={
                            tipoBulto !== 'PALLET' || !palletConBultos ? -1 : undefined
                          }
                          className="[&_label]:text-xs"
                        />
                      </div>

                      <div
                        className={cn(
                          tipoBulto === 'SUELTO' && 'invisible pointer-events-none'
                        )}
                        aria-hidden={tipoBulto === 'SUELTO'}
                      >
                        <Input
                          ref={tipoBulto === 'SUELTO' ? undefined : cantidadSueltaRef}
                          label={
                            tipoBulto === 'PALLET'
                              ? palletConBultos
                                ? 'Cajas sueltas (opc.)'
                                : 'Cajas sueltas'
                              : `${normalizarUnidadProducto(selectedProduct.unidad)}s sueltas (opc.)`
                          }
                          type="number"
                          min="0"
                          value={tipoBulto === 'SUELTO' ? '' : cantidadSuelta}
                          onChange={(e) => setCantidadSuelta(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              agregarLineaYContinuar()
                            }
                          }}
                          placeholder={tipoBulto === 'PALLET' && !palletConBultos ? '38' : '0'}
                          leading={
                            tipoBulto === 'PALLET' ? (
                              <Box className="h-4 w-4" aria-hidden />
                            ) : (
                              <BottleIcon className="h-4 w-4" />
                            )
                          }
                          tabIndex={tipoBulto === 'SUELTO' ? -1 : undefined}
                          className="[&_label]:text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-end">
                    <Button
                      type="button"
                      className="h-[2.625rem] w-full rounded-xl px-4 lg:w-auto lg:min-w-[7.5rem]"
                      onClick={agregarLineaYContinuar}
                    >
                      {editingLineaTempId ? (
                        <>
                          <Check className="h-4 w-4" />
                          Guardar
                        </>
                      ) : (
                        <>
                          <Plus className="h-4 w-4" />
                          Agregar
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
              </>
            )}
          </div>
        </div>

        <div
          ref={listScrollRef}
          className="relative z-0 min-h-0 flex-1 overflow-y-auto bg-white"
        >
          {lineasListContent}
        </div>

        <div
          className={cn(
            'mt-auto shrink-0 border-t border-surface-border bg-white shadow-[0_-4px_12px_rgba(0,0,0,0.04)]',
            nativeApp
              ? 'px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]'
              : 'px-4 py-3 sm:px-5'
          )}
          style={nativeApp && keyboardInset > 0 ? { paddingBottom: keyboardInset } : undefined}
        >
          {nativeApp ? (
            <div className="space-y-3">
              <div className="flex items-end justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setTotalVistaFisica((v) => !v)}
                  className="min-w-0 flex-1 rounded-xl text-left active:bg-slate-100"
                  aria-label={
                    totalVistaFisica
                      ? 'Mostrar total en cajas'
                      : 'Mostrar total en pallets y cajas'
                  }
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {totalVistaFisica ? 'Total pallets + cajas' : 'Total general'}
                  </p>
                  <p className="scrollbar-none-x overflow-x-auto whitespace-nowrap text-xl font-bold tabular-nums text-brand-700">
                    {totalVistaFisica ? resumenFisico : resumenGeneral}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {lineas.length} línea{lineas.length === 1 ? '' : 's'}
                    <span className="text-slate-400"> · tocá para cambiar</span>
                  </p>
                </button>
              </div>
              {hasPermiso('ingresos.crear') && (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="secondary"
                    className="h-11 rounded-xl"
                    onClick={cancelarIngresoEnCurso}
                    disabled={saving}
                  >
                    Cancelar
                  </Button>
                  <Button
                    className="h-11 rounded-xl"
                    onClick={confirmarIngresoDirecto}
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
              <button
                type="button"
                onClick={() => setTotalVistaFisica((v) => !v)}
                className="min-w-0 flex-1 rounded-xl text-left hover:bg-slate-50 active:bg-slate-100"
                aria-label={
                  totalVistaFisica
                    ? 'Mostrar total en cajas'
                    : 'Mostrar total en pallets y cajas'
                }
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {totalVistaFisica ? 'Total pallets + cajas' : 'Total general'}
                </p>
                <p className="scrollbar-none-x overflow-x-auto whitespace-nowrap text-2xl font-bold tabular-nums text-brand-700">
                  {totalVistaFisica ? resumenFisico : resumenGeneral}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {lineas.length} línea{lineas.length === 1 ? '' : 's'} cargada
                  {lineas.length === 1 ? '' : 's'}
                  <span className="text-slate-400"> · clic para cambiar</span>
                </p>
              </button>
              {hasPermiso('ingresos.crear') && (
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    className="rounded-xl"
                    onClick={cancelarIngresoEnCurso}
                    disabled={saving}
                  >
                    Cancelar
                  </Button>
                  <Button
                    className="rounded-xl"
                    onClick={confirmarIngresoDirecto}
                    disabled={lineas.length === 0 || saving}
                  >
                    <Check className="h-4 w-4" />
                    {saving ? 'Registrando...' : 'Confirmar'}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        <ProductQuickCreateModal
          open={showNewProduct}
          onClose={() => setShowNewProduct(false)}
          onCreated={(p) => selectProduct(p)}
        />
      </div>
    )
  }

  return (
    <div className={cn('mx-auto max-w-6xl', nativeApp ? '-mt-1 space-y-3' : 'space-y-6')}>
      {nativeApp ? (
        <div className="flex items-center gap-3">
          <h1 className="min-w-0 flex-1 truncate text-xl font-bold tracking-tight text-slate-900">
            Ingresos
          </h1>
          {hasPermiso('ingresos.crear') && (
            <Button
              className="h-10 shrink-0 rounded-xl px-3"
              onClick={() => {
                if (tieneBorrador) continuarBorrador()
                else abrirNuevoIngreso()
              }}
            >
              {tieneBorrador ? (
                <>
                  <ClipboardList className="h-4 w-4" />
                  Continuar
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Nuevo
                </>
              )}
            </Button>
          )}
        </div>
      ) : (
        <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Movimientos
            </p>
            <div className="mt-1 flex items-center gap-1.5">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Ingresos
              </h1>
              <SectionHelpButton guideId="ingresos" />
            </div>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-500">
              Entrada de mercadería archivada por día, con remito y destinos por línea.
            </p>
          </div>
          {hasPermiso('ingresos.crear') && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                className="rounded-xl px-4"
                onClick={() => {
                  if (tieneBorrador) continuarBorrador()
                  else abrirNuevoIngreso()
                }}
              >
                {tieneBorrador ? (
                  <>
                    <ClipboardList className="h-4 w-4" />
                    Continuar ingreso
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Nuevo ingreso
                  </>
                )}
              </Button>
            </div>
          )}
        </section>
      )}

      <Card className="overflow-hidden shadow-panel">
        <div
          className={cn(
            'border-b border-brand-100 bg-gradient-to-r from-brand-50/80 via-white to-white sm:px-6',
            nativeApp ? 'px-3 py-2.5' : 'px-5 py-4'
          )}
        >
          <div className={cn('flex flex-col', nativeApp ? 'gap-2' : 'gap-3')}>
            <div className={cn('flex gap-2', nativeApp ? 'flex-col' : 'flex-wrap items-center')}>
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400" />
                <input
                  ref={listSearchRef}
                  type="search"
                  placeholder="Buscar por remito..."
                  value={listSearch}
                  onChange={(e) => setListSearch(e.target.value)}
                  onKeyDown={registroListKb.handleListSearchKeyDown}
                  className={cn(
                    'w-full rounded-xl border border-surface-border bg-white pl-9 pr-3 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20',
                    nativeApp ? 'py-2' : 'py-2.5 pl-10 pr-4'
                  )}
                />
              </div>

              <div
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-xl border border-surface-border bg-white shadow-sm',
                  nativeApp ? 'w-full justify-between px-2 py-1' : 'px-2 py-1.5'
                )}
              >
                <span className="pl-0.5 text-[11px] font-medium text-slate-500">Desde</span>
                <input
                  id="ingresos-fecha-desde"
                  type="date"
                  value={listFechaDesde}
                  onChange={(e) => setListFechaDesde(e.target.value)}
                  title="Fecha desde — solo este campo = ese día"
                  className="min-w-0 flex-1 rounded border-0 bg-transparent px-1 py-1 text-sm focus:outline-none focus:ring-0"
                />
                <span className="text-slate-300">|</span>
                <span className="text-[11px] font-medium text-slate-500">Hasta</span>
                <input
                  id="ingresos-fecha-hasta"
                  type="date"
                  value={listFechaHasta}
                  onChange={(e) => setListFechaHasta(e.target.value)}
                  title="Fecha hasta — solo este campo = ese día"
                  className="min-w-0 flex-1 rounded border-0 bg-transparent px-1 py-1 text-sm focus:outline-none focus:ring-0"
                />
                {(listFechaDesde || listFechaHasta) && (
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
            {!nativeApp && (
              <p className="text-xs text-slate-500">
                Una sola fecha filtra ese día · las dos juntas = rango
              </p>
            )}

            <DayTabsRow
              days={diasConIngresos}
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
          <div>
            <h2 className={cn('font-semibold text-slate-900', nativeApp ? 'text-sm' : 'text-sm')}>
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

        <CardBody className={cn(nativeApp ? 'bg-surface-muted/35 p-2' : 'p-0')}>
          {error && (
            <div className="mb-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {loadingList ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
              Cargando ingresos...
            </div>
          ) : ingresos.length === 0 ? (
            <div
              className={cn(
                'flex flex-col items-center px-6 py-14 text-center',
                nativeApp && 'rounded-xl border border-dashed border-surface-border bg-white shadow-card'
              )}
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <Package className="h-7 w-7" />
              </div>
              <p className="mt-4 text-sm font-medium text-slate-700">
                {listSearch || listFechaDesde || listFechaHasta
                  ? 'No hay ingresos con esos filtros'
                  : 'No hay ingresos registrados'}
              </p>
              {!nativeApp && (
                <p className="mt-1 max-w-sm text-xs text-slate-500">
                  {listSearch || listFechaDesde || listFechaHasta
                    ? 'Probá ampliar el rango de fechas o cambiar la búsqueda'
                    : 'Cargá el primer ingreso para sumar stock'}
                </p>
              )}
              {!(listSearch || listFechaDesde || listFechaHasta) &&
                hasPermiso('ingresos.crear') &&
                !nativeApp && (
                  <Button className="mt-4 rounded-xl" size="sm" onClick={() => {
                    if (tieneBorrador) continuarBorrador()
                    else abrirNuevoIngreso()
                  }}>
                    {tieneBorrador ? (
                      <>
                        <ClipboardList className="h-4 w-4" />
                        Continuar ingreso
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4" />
                        Nuevo ingreso
                      </>
                    )}
                  </Button>
                )}
            </div>
          ) : ingresosDelDia.length === 0 ? (
            <div
              className={cn(
                'flex flex-col items-center px-6 py-14 text-center',
                nativeApp && 'rounded-xl border border-dashed border-surface-border bg-white shadow-card'
              )}
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <Package className="h-7 w-7" />
              </div>
              <p className="mt-4 text-sm font-medium text-slate-700">Sin resultados para este día</p>
              {!nativeApp && (
                <p className="mt-1 text-xs text-slate-500">Probá otra fecha o ajustá la búsqueda</p>
              )}
            </div>
          ) : nativeApp ? (
            <ul className="space-y-2">
              {ingresosDelDia.map((i, index) => {
                const showFisico = totalVistaFisicaIds.has(i.id)
                return (
                <li
                  key={i.id}
                  {...registroListKb.listItemProps(
                    index,
                    cn(
                      'overflow-hidden rounded-xl border border-surface-border bg-white shadow-card',
                      flashClass(i.id)
                    )
                  )}
                >
                  <div className="flex w-full items-stretch gap-0">
                    <button
                      type="button"
                      className="min-w-0 flex-1 px-3 py-3 text-left active:bg-slate-50"
                      onClick={() => verDetalle(i.id)}
                    >
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {i.numero_remito}
                        </p>
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                          <Warehouse className="h-3 w-3" />
                          {i.sector_nombre}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                        <span>
                          {i.productos_count} producto{i.productos_count === 1 ? '' : 's'}
                        </span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {i.usuario_nombre}
                        </span>
                      </div>
                    </button>
                    <button
                      type="button"
                      className="flex shrink-0 flex-col items-end justify-center px-3 py-3 active:bg-slate-50"
                      onClick={() => toggleTotalIngresoLista(i.id)}
                      title={
                        showFisico
                          ? 'Mostrar total en cajas'
                          : 'Mostrar total en pallets y cajas'
                      }
                      aria-label={
                        showFisico
                          ? 'Mostrar total en cajas'
                          : 'Mostrar total en pallets y cajas'
                      }
                    >
                      <span className="inline-flex max-w-[9.5rem] items-center justify-end rounded-lg bg-brand-50 px-2.5 py-1 text-right text-sm font-bold tabular-nums leading-tight text-brand-700 ring-1 ring-brand-100">
                        {labelTotalIngresoLista(i)}
                      </span>
                    </button>
                  </div>
                </li>
                )
              })}
            </ul>
          ) : (
            <ul className="divide-y divide-surface-border">
              {ingresosDelDia.map((i, index) => {
                const showFisico = totalVistaFisicaIds.has(i.id)
                return (
                <li
                  key={i.id}
                  {...registroListKb.listItemProps(
                    index,
                    cn(
                      'flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-slate-50/80 sm:flex-row sm:items-center sm:gap-4 sm:px-6',
                      flashClass(i.id)
                    )
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

                  <div className="flex w-full shrink-0 items-center gap-1.5 sm:w-auto sm:gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="rounded-lg !px-2 !py-2"
                      disabled={exportingId === i.id}
                      onClick={() => void exportarIngreso(i.id)}
                      title="Exportar Excel"
                      aria-label="Exportar Excel"
                    >
                      {exportingId === i.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="rounded-lg !px-2 !py-2"
                      onClick={() => verDetalle(i.id)}
                      title="Ver detalle"
                      aria-label="Ver detalle"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <button
                      type="button"
                      className="ml-auto inline-flex min-w-[3rem] max-w-[12rem] items-center justify-center rounded-lg bg-brand-50 px-2.5 py-1.5 text-right text-sm font-bold tabular-nums leading-tight text-brand-700 ring-1 ring-brand-100 hover:bg-brand-100 sm:ml-2"
                      onClick={() => toggleTotalIngresoLista(i.id)}
                      title={
                        showFisico
                          ? 'Mostrar total en cajas'
                          : 'Mostrar total en pallets y cajas'
                      }
                      aria-label={
                        showFisico
                          ? 'Mostrar total en cajas'
                          : 'Mostrar total en pallets y cajas'
                      }
                    >
                      {labelTotalIngresoLista(i)}
                    </button>
                  </div>
                </li>
                )
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
