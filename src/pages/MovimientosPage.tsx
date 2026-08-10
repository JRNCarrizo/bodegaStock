import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeftRight,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Eye,
  Loader2,
  Plus,
  Search,
  Send,
  User,
  X
} from 'lucide-react'
import { BarcodeScannerModal } from '@/components/BarcodeScannerModal'
import { DayTabsRow } from '@/components/DayTabsRow'
import {
  RegistroDetalleMetaChip,
  RegistroDetalleObsChip,
  RegistroDetallePanel
} from '@/components/RegistroDetallePanel'
import { SwipeableConteoLinea } from '@/components/SwipeableConteoLinea'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardBody } from '@/components/ui/Card'
import {
  botellasPorCajaDefault,
  cajasPorPalletDefault,
  calcTotalEnCajas,
  formatCantidad,
  formatCantidadUnidad,
  formatDayTabLabel,
  formatEtiqueta,
  formatTotalCajas,
  todayIsoDate,
  totalSueltoLineaConteo
} from '@/lib/desglose'
import { api, cn } from '@/lib/utils'
import { codigoProductoExacto } from '@/lib/productoSearch'
import type {
  MovimientoInternoDetalle,
  MovimientoInternoDetalleLinea,
  MovimientoInternoEstado,
  MovimientoInternoListItem,
  MovimientoInternoProductoStock,
  MovimientoInternoTipo,
  Sector,
  SectorUbicacion
} from '@/types'
import { useAuth } from '@/context/AuthContext'
import { useEscHandler } from '@/hooks/useEscHandler'
import { useRegistroListKeyboard } from '@/hooks/useRegistroListKeyboard'

function badgeTipo(tipo: MovimientoInternoTipo) {
  if (tipo === 'ENVIAR') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-800 ring-1 ring-brand-100">
        <Send className="h-3 w-3" />
        Enviar
      </span>
    )
  }
  if (tipo === 'LISTA') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-800 ring-1 ring-sky-100">
        <ClipboardList className="h-3 w-3" />
        Lista
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-surface-border">
      <ArrowLeftRight className="h-3 w-3" />
      Recibir
    </span>
  )
}

function badgeEstado(estado: MovimientoInternoEstado, ingresoDirecto = false) {
  switch (estado) {
    case 'ABIERTA':
      return (
        <span className="inline-flex items-center rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-800 ring-1 ring-sky-100">
          Abierta
        </span>
      )
    case 'PENDIENTE':
      return (
        <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-100">
          Pendiente
        </span>
      )
    case 'COMPLETADO':
      return (
        <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-800 ring-1 ring-green-100">
          {ingresoDirecto ? 'Ingreso directo' : 'Completado'}
        </span>
      )
    case 'CANCELADO':
      return (
        <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-surface-border">
          Cancelado
        </span>
      )
  }
}

function etiquetaLinea(l: MovimientoInternoDetalleLinea): string {
  if (l.etiqueta) return l.etiqueta
  if (l.tipo_bulto === 'SUELTO') {
    return formatEtiqueta(
      { tipo_bulto: 'SUELTO', cantidad_suelta: l.cantidad_suelta ?? 0 },
      l.unidad
    )
  }
  if (l.tipo_bulto && l.cantidad_bultos != null && l.unidades_por_bulto != null) {
    return formatEtiqueta(
      {
        tipo_bulto: l.tipo_bulto,
        cantidad_bultos: l.cantidad_bultos,
        unidades_por_bulto: l.unidades_por_bulto,
        cantidad_suelta: l.cantidad_suelta ?? 0
      },
      l.unidad
    )
  }
  return formatTotalCajas(l.cantidad_cajas)
}

export function MovimientosPage() {
  const { hasPermiso, user } = useAuth()
  const [view, setView] = useState<'list' | 'editor' | 'detail'>('list')
  const [movimientos, setMovimientos] = useState<MovimientoInternoListItem[]>([])
  const [detalle, setDetalle] = useState<MovimientoInternoDetalle | null>(null)
  const [tieneListaAbierta, setTieneListaAbierta] = useState(false)
  const [loadingList, setLoadingList] = useState(true)
  const [loadingEditor, setLoadingEditor] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const [listSearch, setListSearch] = useState('')
  const [listFechaDesde, setListFechaDesde] = useState('')
  const [listFechaHasta, setListFechaHasta] = useState('')
  const [selectedDay, setSelectedDay] = useState(() => todayIsoDate())

  const [sectores, setSectores] = useState<Sector[]>([])
  const [origenId, setOrigenId] = useState('')
  const [destinoId, setDestinoId] = useState('')
  const [ubicacionOrigenId, setUbicacionOrigenId] = useState('')
  const [ubicacionDestinoId, setUbicacionDestinoId] = useState('')

  const [productSearch, setProductSearch] = useState('')
  const [productResults, setProductResults] = useState<MovimientoInternoProductoStock[]>([])
  const [productHighlightIndex, setProductHighlightIndex] = useState(-1)
  const [searchingProducts, setSearchingProducts] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<MovimientoInternoProductoStock | null>(null)
  const [tipoBulto, setTipoBulto] = useState<'PALLET' | 'CAJA' | 'SUELTO'>('PALLET')
  const [cantidadBultos, setCantidadBultos] = useState('')
  const [unidadesPorBulto, setUnidadesPorBulto] = useState('')
  const [cantidadSuelta, setCantidadSuelta] = useState('')
  const [stockDisponible, setStockDisponible] = useState<number | null>(null)
  const [stockDisponibleBotellas, setStockDisponibleBotellas] = useState<number | null>(null)
  const [expandedProductos, setExpandedProductos] = useState<Set<number>>(() => new Set())
  const [showScanner, setShowScanner] = useState(false)
  const [editingLineaId, setEditingLineaId] = useState<number | null>(null)
  const [swipeOpenLineId, setSwipeOpenLineId] = useState<number | null>(null)
  const [formOrigenId, setFormOrigenId] = useState('')
  const [formDestinoId, setFormDestinoId] = useState('')
  const [formUbicacionOrigenId, setFormUbicacionOrigenId] = useState('')
  const [formUbicacionDestinoId, setFormUbicacionDestinoId] = useState('')

  const [editLineas, setEditLineas] = useState<MovimientoInternoDetalleLinea[]>([])
  const [lineasConfirmadas, setLineasConfirmadas] = useState<Set<number>>(() => new Set())
  const [expandedProductosDetalle, setExpandedProductosDetalle] = useState<Set<number>>(() => new Set())
  const [dobleVerificacion, setDobleVerificacion] = useState(true)

  const productSearchRef = useRef<HTMLInputElement>(null)
  const listScrollRef = useRef<HTMLDivElement>(null)
  const productLineFormRef = useRef<HTMLDivElement>(null)
  const cantidadBultosRef = useRef<HTMLInputElement>(null)
  const unidadesPorBultoRef = useRef<HTMLInputElement>(null)
  const cantidadSueltaRef = useRef<HTMLInputElement>(null)
  const listSearchRef = useRef<HTMLInputElement>(null)
  const productResultsListRef = useRef<HTMLUListElement>(null)
  const origenRef = useRef<HTMLSelectElement>(null)
  const destinoRef = useRef<HTMLSelectElement>(null)

  const lineasEditor = detalle?.lineas ?? []
  const lineasActivasEditor = useMemo(
    () => lineasEditor.filter((l) => !l.cancelada),
    [lineasEditor]
  )

  const lineasPorProductoEditor = useMemo(() => {
    const map = new Map<
      number,
      { producto: MovimientoInternoDetalleLinea; lineas: MovimientoInternoDetalleLinea[] }
    >()
    for (const l of lineasEditor) {
      if (l.cancelada) continue
      const existing = map.get(l.producto_id)
      if (existing) existing.lineas.push(l)
      else map.set(l.producto_id, { producto: l, lineas: [l] })
    }
    return [...map.values()].map((g) => ({
      ...g,
      total: g.lineas.reduce((s, l) => s + l.cantidad_cajas, 0),
      totalSuelto: g.lineas.reduce(
        (s, l) =>
          s +
          totalSueltoLineaConteo({
            tipo_bulto: (l.tipo_bulto ?? 'CAJA') as 'PALLET' | 'CAJA' | 'SUELTO',
            cantidad_bultos: l.cantidad_bultos,
            unidades_por_bulto: l.unidades_por_bulto,
            cantidad_suelta: l.cantidad_suelta
          }),
        0
      )
    }))
  }, [lineasEditor])

  const totalGeneral = useMemo(
    () => lineasActivasEditor.reduce((s, l) => s + l.cantidad_cajas, 0),
    [lineasActivasEditor]
  )

  const totalSueltoGeneral = useMemo(
    () =>
      lineasActivasEditor.reduce(
        (s, l) =>
          s +
          totalSueltoLineaConteo({
            tipo_bulto: (l.tipo_bulto ?? 'CAJA') as 'PALLET' | 'CAJA' | 'SUELTO',
            cantidad_bultos: l.cantidad_bultos,
            unidades_por_bulto: l.unidades_por_bulto,
            cantidad_suelta: l.cantidad_suelta
          }),
        0
      ),
    [lineasActivasEditor]
  )

  const lineasPorProductoDetalle = useMemo(() => {
    const map = new Map<
      number,
      { producto: MovimientoInternoDetalleLinea; lineas: MovimientoInternoDetalleLinea[] }
    >()
    for (const l of editLineas) {
      const existing = map.get(l.producto_id)
      if (existing) existing.lineas.push(l)
      else map.set(l.producto_id, { producto: l, lineas: [l] })
    }
    return [...map.values()].map((g) => ({
      ...g,
      total: g.lineas.filter((l) => !l.cancelada).reduce((s, l) => s + l.cantidad_cajas, 0)
    }))
  }, [editLineas])

  const diasConMovimientos = useMemo(() => {
    const dias = new Set<string>()
    for (const m of movimientos) dias.add(m.fecha)
    return [...dias].sort((a, b) => b.localeCompare(a))
  }, [movimientos])

  const movimientosDelDia = useMemo(
    () => movimientos.filter((m) => m.fecha === selectedDay),
    [movimientos, selectedDay]
  )

  const conteoPorDia = useMemo(() => {
    const map = new Map<string, number>()
    for (const m of movimientos) map.set(m.fecha, (map.get(m.fecha) ?? 0) + 1)
    return map
  }, [movimientos])

  const totalCajasDelDia = useMemo(
    () => movimientosDelDia.reduce((s, m) => s + m.total_cajas, 0),
    [movimientosDelDia]
  )

  const puedeAutorizar =
    detalle?.movimiento.estado === 'PENDIENTE' && hasPermiso('movimientos_internos.crear')

  const puedeCancelarDoc =
    detalle?.movimiento.estado === 'PENDIENTE' && hasPermiso('movimientos_internos.crear')

  const lineasActivasDetalle = useMemo(
    () => editLineas.filter((l) => !l.cancelada),
    [editLineas]
  )

  const listoParaCompletar = useMemo(() => {
    if (editLineas.length === 0) return false
    if (lineasActivasDetalle.length === 0) return false
    return editLineas.every((l) => l.cancelada || lineasConfirmadas.has(l.id))
  }, [editLineas, lineasActivasDetalle, lineasConfirmadas])

  function sectorUsaUbicaciones(sectorId: number): boolean {
    return !!sectores.find((s) => s.id === sectorId)?.usa_ubicaciones
  }

  function sectorNombre(id: number): string {
    return sectores.find((s) => s.id === id)?.nombre ?? '—'
  }

  function formatRutaLinea(l: MovimientoInternoDetalleLinea): string {
    const origen = l.ubicacion_origen_nombre
      ? `${l.sector_origen_nombre} (${l.ubicacion_origen_nombre})`
      : l.sector_origen_nombre
    const destino = l.ubicacion_destino_nombre
      ? `${l.sector_destino_nombre} (${l.ubicacion_destino_nombre})`
      : l.sector_destino_nombre
    return `${origen || '—'} → ${destino || '—'}`
  }

  function rutaExtra(l: MovimientoInternoDetalleLinea) {
    return <span className="text-xs text-slate-500">{formatRutaLinea(l)}</span>
  }

  const loadAbiertoFlag = useCallback(async () => {
    try {
      const data = await api<{ abierto: MovimientoInternoDetalle | null }>(
        '/api/movimientos-internos/abierto'
      )
      setTieneListaAbierta(!!data.abierto)
    } catch {
      setTieneListaAbierta(false)
    }
  }, [])

  const loadMovimientos = useCallback(async () => {
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
      const data = await api<MovimientoInternoListItem[]>(`/api/movimientos-internos?${params}`)
      setMovimientos(data)
      if (data.length > 0 && !data.some((m) => m.fecha === selectedDay)) {
        setSelectedDay(data[0].fecha)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar')
    } finally {
      setLoadingList(false)
    }
  }, [listSearch, listFechaDesde, listFechaHasta, selectedDay])

  useEffect(() => {
    void loadMovimientos()
  }, [loadMovimientos])

  useEffect(() => {
    if (!error) return
    const t = window.setTimeout(() => setError(''), 4000)
    return () => window.clearTimeout(t)
  }, [error])

  useEffect(() => {
    if (view === 'list') void loadAbiertoFlag()
  }, [view, loadAbiertoFlag])

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
    void api<Sector[]>('/api/sectores').then(setSectores).catch(() => {})
  }, [])

  useEffect(() => {
    void api<{ doble_verificacion: boolean }>('/api/configuracion/movimientos')
      .then((cfg) => setDobleVerificacion(cfg.doble_verificacion))
      .catch(() => setDobleVerificacion(true))
  }, [])

  useEffect(() => {
    setUbicacionOrigenId('')
  }, [origenId])

  useEffect(() => {
    setUbicacionDestinoId('')
  }, [destinoId])

  useEffect(() => {
    if (view !== 'editor' || !origenId || !productSearch.trim() || !detalle) {
      if (!productSearch.trim()) {
        setProductResults([])
        setProductHighlightIndex(-1)
      }
      return
    }
    const t = setTimeout(async () => {
      setSearchingProducts(true)
      try {
        const params = new URLSearchParams({
          modo: 'origen',
          sector_id: origenId,
          q: productSearch.trim(),
          movimiento_id: String(detalle.movimiento.id)
        })
        const data = await api<MovimientoInternoProductoStock[]>(
          `/api/movimientos-internos/productos?${params}`
        )
        setProductResults(data.slice(0, 12))
      } catch {
        setProductResults([])
      } finally {
        setSearchingProducts(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [view, origenId, productSearch, detalle?.movimiento.id, detalle?.lineas])

  useEffect(() => {
    if (!selectedProduct || !formOrigenId || !detalle) {
      setStockDisponible(null)
      setStockDisponibleBotellas(null)
      return
    }
    const filterPorUbicacion = sectorUsaUbicaciones(Number(formOrigenId))
    const params = new URLSearchParams()
    if (filterPorUbicacion) {
      if (formUbicacionOrigenId) params.set('ubicacion_id', formUbicacionOrigenId)
      else params.set('sin_ubicacion', '1')
    }
    params.set('movimiento_id', String(detalle.movimiento.id))
    if (editingLineaId != null) params.set('excluir_linea_id', String(editingLineaId))
    const qs = params.toString() ? `?${params}` : ''
    void api<{ stock_disponible_cajas: number; stock_disponible_botellas: number }>(
      `/api/movimientos-internos/producto/${selectedProduct.id}/stock-sector/${formOrigenId}${qs}`
    )
      .then((r) => {
        setStockDisponible(r.stock_disponible_cajas)
        setStockDisponibleBotellas(r.stock_disponible_botellas)
      })
      .catch(() => {
        setStockDisponible(null)
        setStockDisponibleBotellas(null)
      })
  }, [
    selectedProduct,
    formOrigenId,
    formUbicacionOrigenId,
    sectores,
    detalle?.movimiento.id,
    detalle?.lineas,
    editingLineaId
  ])

  useLayoutEffect(() => {
    if (productHighlightIndex < 0) return
    const list = productResultsListRef.current
    if (!list) return
    const item = list.children[productHighlightIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [productHighlightIndex])

  useEffect(() => {
    if (detalle && view === 'detail') {
      setEditLineas(detalle.lineas.map((l) => ({ ...l })))
      setLineasConfirmadas(new Set())
      setExpandedProductosDetalle(new Set())
    }
  }, [detalle, view])

  useEscHandler(view !== 'list', () => {
    if (showScanner) {
      setShowScanner(false)
      return true
    }
    if (selectedProduct || editingLineaId != null) {
      cancelarLineaForm()
      return true
    }
    if (view !== 'list') {
      volverAlListado()
      return true
    }
    return false
  })

  function focusField(ref: React.RefObject<HTMLElement | null>) {
    requestAnimationFrame(() => ref.current?.focus({ preventScroll: true }))
  }

  function focusProductSearch() {
    productSearchRef.current?.focus({ preventScroll: true })
  }

  function focusListSearch() {
    listSearchRef.current?.focus({ preventScroll: true })
  }

  useEffect(() => {
    if (view !== 'list') return
    const timer = setTimeout(focusListSearch, 0)
    return () => clearTimeout(timer)
  }, [view])

  useEffect(() => {
    if (view !== 'editor') return
    const timer = setTimeout(focusProductSearch, 0)
    return () => clearTimeout(timer)
  }, [view, detalle?.movimiento.id])

  function volverAlListado() {
    setView('list')
    setDetalle(null)
    setSelectedProduct(null)
    setProductSearch('')
    setProductResults([])
    setExpandedProductos(new Set())
    setError('')
    void loadAbiertoFlag()
    void loadMovimientos()
  }

  async function abrirListaEditor() {
    if (!hasPermiso('movimientos_internos.crear')) return
    setLoadingEditor(true)
    setError('')
    try {
      const data = await api<MovimientoInternoDetalle>('/api/movimientos-internos/abierto', {
        method: 'POST'
      })
      setDetalle(data)
      setTieneListaAbierta(true)
      setExpandedProductos(new Set())
      setSelectedProduct(null)
      setProductSearch('')
      setProductResults([])
      setView('editor')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al abrir lista')
    } finally {
      setLoadingEditor(false)
    }
  }

  async function abrirDetalle(id: number) {
    setError('')
    try {
      const data = await api<MovimientoInternoDetalle>(`/api/movimientos-internos/${id}`)
      if (data.movimiento.estado === 'ABIERTA' && data.movimiento.tipo === 'LISTA') {
        setDetalle(data)
        setTieneListaAbierta(true)
        setView('editor')
        return
      }
      setDetalle(data)
      setView('detail')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar detalle')
    }
  }

  function defaultUnidadesPorBulto(
    tipo: 'PALLET' | 'CAJA',
    p: MovimientoInternoProductoStock | null
  ): string {
    if (tipo === 'PALLET') {
      return String(cajasPorPalletDefault(p?.unidades_por_pallet_default))
    }
    return String(botellasPorCajaDefault(p?.unidades_por_caja_default))
  }

  function resetLineaForm(forProduct?: MovimientoInternoProductoStock | null) {
    const p = forProduct ?? selectedProduct
    setTipoBulto('PALLET')
    setCantidadBultos('')
    setCantidadSuelta('')
    setUnidadesPorBulto(defaultUnidadesPorBulto('PALLET', p))
  }

  function handleTipoBultoChange(tipo: 'PALLET' | 'CAJA' | 'SUELTO') {
    setTipoBulto(tipo)
    if (tipo === 'SUELTO') {
      setCantidadBultos('')
      setUnidadesPorBulto('')
      setTimeout(() => focusField(cantidadSueltaRef), 50)
    } else {
      // Mantener sueltas opcionales al cambiar PALLET ↔ CAJA; limpiar al salir de SUELTO.
      if (tipoBulto === 'SUELTO') setCantidadSuelta('')
      setUnidadesPorBulto(defaultUnidadesPorBulto(tipo, selectedProduct))
      setTimeout(() => focusField(cantidadBultosRef), 50)
    }
  }

  function cancelarLineaForm() {
    setEditingLineaId(null)
    setSelectedProduct(null)
    setProductSearch('')
    setProductResults([])
    setStockDisponible(null)
    setStockDisponibleBotellas(null)
    setError('')
    resetLineaForm(null)
    setTimeout(() => productSearchRef.current?.focus(), 50)
  }

  function selectProduct(p: MovimientoInternoProductoStock) {
    setEditingLineaId(null)
    setSelectedProduct(p)
    setProductSearch(p.codigo_interno)
    setProductResults([])
    setProductHighlightIndex(-1)
    setFormOrigenId(origenId)
    setFormDestinoId(destinoId)
    setFormUbicacionOrigenId(ubicacionOrigenId)
    setFormUbicacionDestinoId(ubicacionDestinoId)
    resetLineaForm(p)
    setError('')
    setTimeout(() => focusField(cantidadBultosRef), 50)
  }

  function empezarEditarLinea(l: MovimientoInternoDetalleLinea) {
    setSwipeOpenLineId(null)
    setEditingLineaId(l.id)
    setSelectedProduct({
      id: l.producto_id,
      codigo_interno: l.codigo_interno,
      codigo_barras: null,
      nombre: l.nombre,
      imagen_path: null,
      unidad: l.unidad,
      unidades_por_pallet_default: null,
      unidades_por_caja_default: null,
      stock_cajas: 0
    })
    setProductSearch(l.codigo_interno)
    setProductResults([])
    setFormOrigenId(String(l.sector_origen_id))
    setFormDestinoId(String(l.sector_destino_id))
    setFormUbicacionOrigenId(l.ubicacion_origen_id != null ? String(l.ubicacion_origen_id) : '')
    setFormUbicacionDestinoId(l.ubicacion_destino_id != null ? String(l.ubicacion_destino_id) : '')
    if (l.tipo_bulto === 'SUELTO') {
      setTipoBulto('SUELTO')
      setCantidadBultos('')
      setUnidadesPorBulto('')
      setCantidadSuelta(l.cantidad_suelta != null ? String(l.cantidad_suelta) : '')
      setTimeout(() => focusField(cantidadSueltaRef), 50)
    } else {
      setTipoBulto(l.tipo_bulto === 'CAJA' ? 'CAJA' : 'PALLET')
      setCantidadBultos(l.cantidad_bultos != null ? String(l.cantidad_bultos) : '')
      setUnidadesPorBulto(l.unidades_por_bulto != null ? String(l.unidades_por_bulto) : '')
      setCantidadSuelta(
        l.cantidad_suelta != null && Number(l.cantidad_suelta) > 0 ? String(l.cantidad_suelta) : ''
      )
      setTimeout(() => focusField(cantidadBultosRef), 50)
    }
    setExpandedProductos((prev) => new Set(prev).add(l.producto_id))
    setError('')
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

  function toggleProductoExpand(productoId: number) {
    setExpandedProductos((prev) => {
      const next = new Set(prev)
      if (next.has(productoId)) next.delete(productoId)
      else next.add(productoId)
      return next
    })
  }

  function toggleProductoExpandDetalle(productoId: number) {
    setExpandedProductosDetalle((prev) => {
      const next = new Set(prev)
      if (next.has(productoId)) next.delete(productoId)
      else next.add(productoId)
      return next
    })
  }

  async function guardarLineaForm() {
    if (!detalle) return
    if (!selectedProduct) {
      setError('Seleccioná un producto primero')
      return
    }
    if (!formOrigenId || !formDestinoId) {
      setError('Elegí sector origen y destino')
      return
    }

    const esSuelto = tipoBulto === 'SUELTO'
    let qty = 0
    let qtySuelta: number | null = null
    let etiqueta = ''
    let payloadCantidadBultos: number | null = null
    let payloadUnidadesPorBulto: number | null = null

    if (esSuelto) {
      const suelta = Number(cantidadSuelta)
      if (!Number.isFinite(suelta) || suelta <= 0) {
        setError('Indicá la cantidad de botellas')
        return
      }
      if (stockDisponibleBotellas !== null && suelta > stockDisponibleBotellas) {
        setError(
          `Stock insuficiente (disponible: ${formatCantidadUnidad(stockDisponibleBotellas, selectedProduct.unidad)})`
        )
        return
      }
      qtySuelta = suelta
      etiqueta = formatEtiqueta(
        { tipo_bulto: 'SUELTO', cantidad_suelta: suelta },
        selectedProduct.unidad
      )
    } else {
      const bultos = Number(cantidadBultos)
      const porBulto = Number(unidadesPorBulto)
      if (!Number.isFinite(bultos) || bultos <= 0) {
        setError(`Indicá la cantidad de ${tipoBulto === 'PALLET' ? 'pallets' : 'cajas'}`)
        return
      }
      if (!Number.isFinite(porBulto) || porBulto <= 0) {
        setError('Indicá las unidades por bulto')
        return
      }

      let extra = 0
      if (cantidadSuelta.trim()) {
        extra = Number(cantidadSuelta)
        if (!Number.isFinite(extra) || extra < 0) {
          setError(
            tipoBulto === 'PALLET' ? 'Cajas sueltas inválidas' : 'Botellas sueltas inválidas'
          )
          return
        }
      }

      const lineaInput = {
        tipo_bulto: tipoBulto,
        cantidad_bultos: bultos,
        unidades_por_bulto: porBulto,
        cantidad_suelta: extra > 0 ? extra : null
      }

      qty = calcTotalEnCajas(
        lineaInput,
        botellasPorCajaDefault(selectedProduct.unidades_por_caja_default)
      )
      if (qty <= 0) {
        setError('La cantidad debe ser mayor a cero')
        return
      }
      if (stockDisponible !== null && qty > stockDisponible) {
        setError(`Stock insuficiente (disponible: ${formatCantidad(stockDisponible)})`)
        return
      }
      if (
        tipoBulto === 'CAJA' &&
        extra > 0 &&
        stockDisponibleBotellas !== null &&
        extra > stockDisponibleBotellas
      ) {
        setError(
          `Stock insuficiente de botellas (disponible: ${formatCantidadUnidad(stockDisponibleBotellas, selectedProduct.unidad)})`
        )
        return
      }
      qtySuelta = extra > 0 ? extra : null
      payloadCantidadBultos = bultos
      payloadUnidadesPorBulto = porBulto
      etiqueta = formatEtiqueta(
        {
          tipo_bulto: tipoBulto,
          cantidad_bultos: bultos,
          unidades_por_bulto: porBulto,
          cantidad_suelta: extra
        },
        selectedProduct.unidad
      )
    }

    const oId = Number(formOrigenId)
    const dId = Number(formDestinoId)
    const origenUbId = formUbicacionOrigenId ? Number(formUbicacionOrigenId) : null
    const destinoUbId = formUbicacionDestinoId ? Number(formUbicacionDestinoId) : null
    const origenTieneUbicaciones = sectorUsaUbicaciones(oId)

    if (oId === dId) {
      if (!origenTieneUbicaciones) {
        setError('Origen y destino deben ser distintos')
        return
      }
      if (origenUbId === destinoUbId) {
        setError('En el mismo sector, elegí una ubicación destino distinta a la origen')
        return
      }
      if (destinoUbId == null && origenUbId == null) {
        setError('Elegí una ubicación destino para reubicar')
        return
      }
    }

    const bodyBase = {
      cantidad_cajas: qty,
      cantidad_suelta: qtySuelta,
      sector_origen_id: oId,
      sector_destino_id: dId,
      ubicacion_destino_id: destinoUbId,
      ubicacion_origen_id: origenTieneUbicaciones ? origenUbId : null,
      tipo_bulto: tipoBulto,
      cantidad_bultos: payloadCantidadBultos,
      unidades_por_bulto: payloadUnidadesPorBulto,
      etiqueta
    }

    setSaving(true)
    setError('')
    try {
      if (editingLineaId != null) {
        const data = await api<MovimientoInternoDetalle>(
          `/api/movimientos-internos/${detalle.movimiento.id}/lineas`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              lineas: [{ id: editingLineaId, ...bodyBase }]
            })
          }
        )
        setDetalle(data)
      } else {
        const data = await api<MovimientoInternoDetalle>(
          `/api/movimientos-internos/${detalle.movimiento.id}/lineas`,
          {
            method: 'POST',
            body: JSON.stringify({
              producto_id: selectedProduct.id,
              ...bodyBase
            })
          }
        )
        setDetalle(data)
        setExpandedProductos((prev) => new Set(prev).add(selectedProduct.id))
      }
      cancelarLineaForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar línea')
    } finally {
      setSaving(false)
    }
  }

  function handleLineaEnter(e: React.KeyboardEvent) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    void guardarLineaForm()
  }

  async function patchLineas(
    updates: Array<{
      id: number
      sector_origen_id?: number
      sector_destino_id?: number
      ubicacion_destino_id?: number | null
      ubicacion_origen_id?: number | null
      verificada?: boolean
      cancelada?: boolean
    }>
  ) {
    if (!detalle || updates.length === 0) return
    setSaving(true)
    setError('')
    try {
      const data = await api<MovimientoInternoDetalle>(
        `/api/movimientos-internos/${detalle.movimiento.id}/lineas`,
        {
          method: 'PATCH',
          body: JSON.stringify({ lineas: updates })
        }
      )
      setDetalle(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar línea')
    } finally {
      setSaving(false)
    }
  }

  async function toggleVerificada(linea: MovimientoInternoDetalleLinea) {
    await patchLineas([{ id: linea.id, verificada: !linea.verificada }])
  }

  async function eliminarLinea(lineaId: number) {
    if (!detalle) return
    setSwipeOpenLineId(null)
    setSaving(true)
    setError('')
    try {
      const data = await api<MovimientoInternoDetalle>(
        `/api/movimientos-internos/${detalle.movimiento.id}/lineas/${lineaId}`,
        { method: 'DELETE' }
      )
      setDetalle(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar línea')
    } finally {
      setSaving(false)
    }
  }

  async function finalizarLista() {
    if (!detalle) return
    if (lineasActivasEditor.length === 0) {
      setError('Agregá al menos una línea')
      return
    }
    if (dobleVerificacion) {
      const sinTilde = lineasActivasEditor.filter((l) => !l.verificada)
      if (sinTilde.length > 0) {
        setError(
          `Hay ${sinTilde.length} línea(s) sin tilde. Tildalas o eliminalas antes de finalizar.`
        )
        return
      }
    }
    setSaving(true)
    setError('')
    try {
      await api(`/api/movimientos-internos/${detalle.movimiento.id}/finalizar`, {
        method: 'POST'
      })
      setTieneListaAbierta(false)
      volverAlListado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al finalizar')
    } finally {
      setSaving(false)
    }
  }

  async function cancelarListaAbierta() {
    if (!detalle) return
    const activas = lineasActivasEditor.length
    if (activas > 0) {
      if (!confirm(`La lista tiene ${activas} línea(s). ¿Cancelar la lista abierta?`)) return
    } else if (!confirm('¿Cancelar la lista abierta?')) {
      return
    }
    setSaving(true)
    setError('')
    try {
      await api(`/api/movimientos-internos/${detalle.movimiento.id}/cancelar`, {
        method: 'POST'
      })
      setTieneListaAbierta(false)
      volverAlListado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cancelar')
    } finally {
      setSaving(false)
    }
  }

  function updateEditLinea(
    lineaId: number,
    patch: Partial<{
      cancelada: boolean
      sector_origen_id: number
      sector_destino_id: number
      ubicacion_destino_id: number | null
      ubicacion_origen_id: number | null
    }>
  ) {
    if (patch.sector_origen_id !== undefined || patch.sector_destino_id !== undefined || patch.cancelada) {
      setLineasConfirmadas((prev) => {
        const next = new Set(prev)
        next.delete(lineaId)
        return next
      })
    }
    setEditLineas((prev) =>
      prev.map((l) => {
        if (l.id !== lineaId) return l
        const next = { ...l, ...patch }
        if (patch.sector_origen_id !== undefined) {
          next.sector_origen_nombre = sectorNombre(patch.sector_origen_id)
          if (patch.ubicacion_origen_id === undefined) {
            next.ubicacion_origen_id = null
            next.ubicacion_origen_nombre = null
          }
        }
        if (patch.sector_destino_id !== undefined) {
          next.sector_destino_nombre = sectorNombre(patch.sector_destino_id)
          if (patch.ubicacion_destino_id === undefined) {
            next.ubicacion_destino_id = null
            next.ubicacion_destino_nombre = null
          }
        }
        if (patch.cancelada !== undefined) next.cancelada = patch.cancelada
        return next
      })
    )
  }

  function lineasActivasGrupo(lineas: MovimientoInternoDetalleLinea[]) {
    return lineas.filter((l) => !l.cancelada)
  }

  function grupoEstaConfirmado(lineas: MovimientoInternoDetalleLinea[]) {
    const activas = lineasActivasGrupo(lineas)
    return activas.length > 0 && activas.every((l) => lineasConfirmadas.has(l.id))
  }

  function grupoEstaCancelado(lineas: MovimientoInternoDetalleLinea[]) {
    return lineas.length > 0 && lineas.every((l) => l.cancelada)
  }

  function toggleConfirmadaGrupo(lineas: MovimientoInternoDetalleLinea[]) {
    const activas = lineasActivasGrupo(lineas)
    if (activas.length === 0) return
    const allConfirmed = activas.every((l) => lineasConfirmadas.has(l.id))
    setLineasConfirmadas((prev) => {
      const next = new Set(prev)
      for (const l of activas) {
        if (allConfirmed) next.delete(l.id)
        else next.add(l.id)
      }
      return next
    })
  }

  function cancelarLineasGrupo(lineas: MovimientoInternoDetalleLinea[]) {
    for (const l of lineasActivasGrupo(lineas)) {
      updateEditLinea(l.id, { cancelada: true })
    }
  }

  function restaurarLineasGrupo(lineas: MovimientoInternoDetalleLinea[]) {
    for (const l of lineas.filter((l) => l.cancelada)) {
      updateEditLinea(l.id, { cancelada: false })
    }
  }

  function updateSectorLineasGrupo(
    lineas: MovimientoInternoDetalleLinea[],
    patch: Partial<{
      sector_origen_id: number
      sector_destino_id: number
      ubicacion_destino_id: number | null
      ubicacion_origen_id: number | null
    }>
  ) {
    for (const l of lineasActivasGrupo(lineas)) {
      updateEditLinea(l.id, patch)
    }
  }

  async function completarPendiente() {
    if (!detalle) return
    setSaving(true)
    setError('')
    try {
      if (puedeAutorizar) {
        await api(`/api/movimientos-internos/${detalle.movimiento.id}/lineas`, {
          method: 'PATCH',
          body: JSON.stringify({
            lineas: editLineas.map((l) => ({
              id: l.id,
              cancelada: l.cancelada,
              sector_origen_id: l.sector_origen_id,
              sector_destino_id: l.sector_destino_id,
              ubicacion_destino_id: l.ubicacion_destino_id,
              ubicacion_origen_id: l.ubicacion_origen_id
            }))
          })
        })
      }
      const data = await api<MovimientoInternoDetalle>(
        `/api/movimientos-internos/${detalle.movimiento.id}/completar`,
        { method: 'POST' }
      )
      setDetalle(data)
      void loadMovimientos()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al completar')
    } finally {
      setSaving(false)
    }
  }

  async function cancelarDocPendiente() {
    if (!detalle || !confirm('¿Cancelar este movimiento?')) return
    setSaving(true)
    setError('')
    try {
      const data = await api<MovimientoInternoDetalle>(
        `/api/movimientos-internos/${detalle.movimiento.id}/cancelar`,
        { method: 'POST' }
      )
      setDetalle(data)
      void loadMovimientos()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cancelar')
    } finally {
      setSaving(false)
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
      if (productSearch.trim()) {
        pickProductFromSearch()
      }
    }
  }

  const registroListKb = useRegistroListKeyboard({
    enabled: view === 'list',
    items: movimientosDelDia,
    listSearchRef,
    enterPrioritizesListNavigation: true,
    onEnterFromSearch: () => {
      listSearchRef.current?.blur()
      if (hasPermiso('movimientos_internos.crear')) void abrirListaEditor()
    },
    onOpenDetail: (m) => {
      void abrirDetalle(m.id)
    }
  })

  if (view === 'detail' && detalle) {
    const m = detalle.movimiento
    const pendienteEditable = m.estado === 'PENDIENTE' && puedeAutorizar

    const metaDetalle = (
      <>
        <RegistroDetalleMetaChip icon={<User className="h-3.5 w-3.5 shrink-0 text-slate-400" />}>
          {m.creado_por_nombre}
        </RegistroDetalleMetaChip>
        {m.recibido_por_nombre && (
          <RegistroDetalleMetaChip>
            <span className="font-medium text-slate-500">Finalizado </span>
            {m.recibido_por_nombre}
          </RegistroDetalleMetaChip>
        )}
        {m.observacion && <RegistroDetalleObsChip>{m.observacion}</RegistroDetalleObsChip>}
      </>
    )

    const antesProductosDetalle = (
      <>
        {error && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}
        {m.estado === 'PENDIENTE' && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p className="font-medium">Pendiente de autorización</p>
            <p className="mt-1 text-amber-900/80">
              Creado por {m.creado_por_nombre}.
              {puedeAutorizar
                ? user?.id === m.creado_por_id
                  ? ' Podés revisar y completar vos mismo: tildá cada producto; cuando todos estén confirmados, completá el movimiento.'
                  : ' Tildá cada producto revisado; cuando todos estén confirmados podés completar.'
                : ' Se necesita permiso de crear movimientos para autorizarlo.'}
            </p>
          </div>
        )}
        {m.estado === 'COMPLETADO' && m.ingreso_directo && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
            <p className="font-medium">Ingreso directo</p>
            <p className="mt-1 text-emerald-900/80">
              Se registró sin doble verificación digital (stock aplicado al crear).
            </p>
          </div>
        )}
      </>
    )

    if (!pendienteEditable) {
      return (
        <RegistroDetallePanel
          onVolver={volverAlListado}
          titulo={`Movimiento #${m.id}`}
          fecha={m.fecha}
          totalEtiqueta="Total"
          total={detalle.total_cajas}
          encabezadoExtra={
            <>
              {badgeTipo(m.tipo)}
              {badgeEstado(m.estado, !!m.ingreso_directo)}
            </>
          }
          meta={metaDetalle}
          antesProductos={antesProductosDetalle}
          lineas={detalle.lineas
            .filter((l) => !l.cancelada)
            .map((l) => ({
              id: l.id,
              producto_id: l.producto_id,
              codigo_interno: l.codigo_interno,
              nombre: l.nombre,
              etiqueta: etiquetaLinea(l),
              cantidad: l.cantidad_cajas,
              extra: (
                <span className="text-xs text-slate-500">{formatRutaLinea(l)}</span>
              ),
              extraKey: formatRutaLinea(l),
              extraSoloDesglose: true
            }))}
        />
      )
    }

    const productosContent = (
      <Card className="overflow-hidden shadow-panel">
        <div className="flex items-center justify-between border-b border-surface-border bg-slate-50/80 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-800">Productos</h2>
          </div>
          <span className="text-xs text-slate-500">
            {lineasActivasDetalle.length} línea{lineasActivasDetalle.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="divide-y divide-surface-border">
          {lineasPorProductoDetalle.map((grupo) => {
            const isExpanded = expandedProductosDetalle.has(grupo.producto.producto_id)
            const confirmada = grupoEstaConfirmado(grupo.lineas)
            const cancelada = grupoEstaCancelado(grupo.lineas)
            const lineaControl = lineasActivasGrupo(grupo.lineas)[0]
            const lineaRef = lineasActivasGrupo(grupo.lineas)[0] ?? grupo.lineas[0]

            return (
              <div key={grupo.producto.producto_id}>
                <div
                  className={`flex items-center gap-2 px-4 py-2.5 ${
                    cancelada
                      ? 'bg-slate-50/80 opacity-60'
                      : confirmada
                        ? 'border-l-2 border-green-500 bg-green-50/90'
                        : 'hover:bg-slate-50/80'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleProductoExpandDetalle(grupo.producto.producto_id)}
                    className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                    aria-expanded={isExpanded}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-baseline gap-2">
                      <span className="shrink-0 font-mono text-sm font-semibold text-slate-900">
                        {grupo.producto.codigo_interno}
                      </span>
                      <span className="min-w-0 truncate text-sm text-slate-600" title={grupo.producto.nombre}>
                        {grupo.producto.nombre}
                      </span>
                    </div>
                    {!isExpanded && grupo.lineas.length > 1 && (
                      <p className="text-xs text-slate-400">{grupo.lineas.length} líneas</p>
                    )}
                  </div>
                  {lineaRef && !cancelada && (
                    <div
                      className="flex shrink-0 flex-wrap items-center gap-1.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <select
                        value={lineaRef.sector_origen_id}
                        onChange={(e) =>
                          updateSectorLineasGrupo(grupo.lineas, {
                            sector_origen_id: Number(e.target.value),
                            ubicacion_origen_id: null
                          })
                        }
                        className="h-7 w-[100px] shrink-0 rounded border border-surface-border px-1 py-0 text-xs sm:w-[130px]"
                      >
                        {sectores.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.nombre}
                          </option>
                        ))}
                      </select>
                      <span className="text-xs text-slate-400">→</span>
                      <select
                        value={lineaRef.sector_destino_id}
                        onChange={(e) =>
                          updateSectorLineasGrupo(grupo.lineas, {
                            sector_destino_id: Number(e.target.value),
                            ubicacion_destino_id: null
                          })
                        }
                        className="h-7 w-[100px] shrink-0 rounded border border-surface-border px-1 py-0 text-xs sm:w-[130px]"
                      >
                        {sectores
                          .filter(
                            (s) => s.id !== lineaRef.sector_origen_id || !!s.usa_ubicaciones
                          )
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.nombre}
                              {s.id === lineaRef.sector_origen_id ? ' (reubicar)' : ''}
                            </option>
                          ))}
                      </select>
                      {sectorUsaUbicaciones(lineaRef.sector_origen_id) && (
                        <UbicacionOrigenSelect
                          sectorId={lineaRef.sector_origen_id}
                          value={lineaRef.ubicacion_origen_id}
                          className="h-7 w-[90px] shrink-0 rounded border border-surface-border px-1 py-0 text-xs sm:w-[110px]"
                          onChange={(id) =>
                            updateSectorLineasGrupo(grupo.lineas, { ubicacion_origen_id: id })
                          }
                        />
                      )}
                      {sectorUsaUbicaciones(lineaRef.sector_destino_id) && (
                        <UbicacionDestinoSelect
                          sectorId={lineaRef.sector_destino_id}
                          value={lineaRef.ubicacion_destino_id}
                          className="h-7 w-[90px] shrink-0 rounded border border-surface-border px-1 py-0 text-xs sm:w-[110px]"
                          onChange={(id) =>
                            updateSectorLineasGrupo(grupo.lineas, { ubicacion_destino_id: id })
                          }
                        />
                      )}
                    </div>
                  )}
                  <div className="flex shrink-0 items-center gap-2">
                    {cancelada && (
                      <span className="shrink-0 text-xs text-slate-400">Cancelada</span>
                    )}
                    <span className="inline-flex shrink-0 items-center rounded-lg bg-brand-50 px-2.5 py-1.5 text-sm font-bold tabular-nums text-brand-700 ring-1 ring-brand-100">
                      {formatCantidad(grupo.total)}
                    </span>
                    {cancelada ? (
                      <button
                        type="button"
                        className="shrink-0 text-xs text-brand-600 hover:underline"
                        onClick={() => restaurarLineasGrupo(grupo.lineas)}
                      >
                        Restaurar
                      </button>
                    ) : (
                      <div className="flex shrink-0 items-center gap-0.5">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          title="Quitar producto"
                          className="h-7 w-7 p-0 text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                          onClick={() => cancelarLineasGrupo(grupo.lineas)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          title={confirmada ? 'Quitar confirmación' : 'Confirmar revisión'}
                          className={
                            confirmada
                              ? 'h-7 w-7 border-green-600 bg-green-600 p-0 text-white hover:bg-green-700'
                              : 'h-7 w-7 p-0'
                          }
                          variant={confirmada ? 'primary' : 'secondary'}
                          onClick={() => toggleConfirmadaGrupo(grupo.lineas)}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
                {isExpanded && (
                  <ul className="divide-y divide-surface-border border-t border-surface-border bg-surface-muted/20">
                    {grupo.lineas.map((l) => (
                      <li
                        key={l.id}
                        className={cn(
                          'flex items-center justify-between gap-2 py-2.5 pl-11 pr-4 text-sm',
                          l.cancelada && 'opacity-50'
                        )}
                      >
                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                          <span className="text-slate-700">{etiquetaLinea(l)}</span>
                          {rutaExtra(l)}
                        </div>
                        <span className="shrink-0 font-semibold tabular-nums text-slate-900">
                          {formatCantidad(l.cantidad_cajas)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      </Card>
    )

    return (
      <RegistroDetallePanel
        onVolver={volverAlListado}
        titulo={`Movimiento #${m.id}`}
        fecha={m.fecha}
        totalEtiqueta="Total"
        total={detalle.total_cajas}
        encabezadoExtra={
          <>
            {badgeTipo(m.tipo)}
            {badgeEstado(m.estado, !!m.ingreso_directo)}
          </>
        }
        meta={metaDetalle}
        antesProductos={antesProductosDetalle}
        productosContent={productosContent}
        productosCount={lineasPorProductoDetalle.length}
        accionesTotal={
          <>
            <Button
              className="rounded-xl"
              disabled={saving || !listoParaCompletar}
              onClick={() => void completarPendiente()}
              title={
                listoParaCompletar
                  ? undefined
                  : 'Tildá cada producto activo o quitá los que no van'
              }
            >
              <Check className="h-4 w-4" />
              Completar movimiento
            </Button>
            {puedeCancelarDoc && (
              <Button
                variant="secondary"
                className="rounded-xl"
                disabled={saving}
                onClick={() => void cancelarDocPendiente()}
              >
                Cancelar
              </Button>
            )}
          </>
        }
      />
    )
  }

  if (view === 'editor' && detalle) {
    const m = detalle.movimiento
    const origenUsaUb = origenId ? sectorUsaUbicaciones(Number(origenId)) : false
    const destinoUsaUb = destinoId ? sectorUsaUbicaciones(Number(destinoId)) : false
    const formOrigenUsaUb = formOrigenId ? sectorUsaUbicaciones(Number(formOrigenId)) : false
    const formDestinoUsaUb = formDestinoId ? sectorUsaUbicaciones(Number(formDestinoId)) : false

    const lineasListContent =
      lineasActivasEditor.length === 0 ? (
        <div className="flex h-full min-h-[140px] flex-col items-center justify-center px-6 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <ClipboardList className="h-6 w-6" />
          </div>
          <p className="mt-3 text-sm font-medium text-slate-600">Sin líneas cargadas</p>
          <p className="mt-1 text-xs text-slate-500">
            Elegí origen y destino, buscá productos y agregalos
          </p>
        </div>
      ) : (
        lineasPorProductoEditor.map((grupo) => {
          const isExpanded = expandedProductos.has(grupo.producto.producto_id)
          const grupoVerificado =
            dobleVerificacion &&
            grupo.lineas.length > 0 &&
            grupo.lineas.every((l) => l.verificada)
          return (
            <div key={grupo.producto.producto_id} className="border-b border-surface-border last:border-0">
              <div
                className={cn(
                  'flex items-center gap-3 px-4 py-2.5 transition-colors sm:px-5',
                  grupoVerificado
                    ? 'border-l-2 border-green-500 bg-green-50/90'
                    : isExpanded
                      ? 'bg-brand-50/50'
                      : 'hover:bg-slate-50/80'
                )}
              >
                <button
                  type="button"
                  onClick={() => toggleProductoExpand(grupo.producto.producto_id)}
                  className={cn(
                    'shrink-0 rounded-lg p-1.5 transition-colors',
                    grupoVerificado
                      ? 'bg-green-100 text-green-700'
                      : isExpanded
                        ? 'bg-brand-100 text-brand-700'
                        : 'text-slate-400 hover:bg-slate-200 hover:text-slate-700'
                  )}
                  aria-expanded={isExpanded}
                >
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => toggleProductoExpand(grupo.producto.producto_id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span
                    className={cn(
                      'shrink-0 rounded-md px-2 py-0.5 font-mono text-xs font-semibold',
                      grupoVerificado
                        ? 'bg-green-100 text-green-800'
                        : 'bg-slate-100 text-slate-700'
                    )}
                  >
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
                <div className="shrink-0 text-right">
                  {grupo.total > 0 && (
                    <span
                      className={cn(
                        'inline-flex items-center rounded-lg px-2.5 py-1.5 text-sm font-bold tabular-nums ring-1',
                        grupoVerificado
                          ? 'bg-green-100 text-green-800 ring-green-200'
                          : 'bg-brand-50 text-brand-700 ring-brand-100'
                      )}
                    >
                      {formatCantidad(grupo.total)}
                    </span>
                  )}
                  {grupo.totalSuelto > 0 && (
                    <p className={cn('text-[11px] font-medium text-slate-500', grupo.total > 0 && 'mt-1')}>
                      + {formatCantidadUnidad(grupo.totalSuelto, grupo.producto.unidad)}
                    </p>
                  )}
                  {grupo.total <= 0 && grupo.totalSuelto <= 0 && (
                    <span
                      className={cn(
                        'inline-flex items-center rounded-lg px-2.5 py-1.5 text-sm font-bold tabular-nums ring-1',
                        grupoVerificado
                          ? 'bg-green-100 text-green-800 ring-green-200'
                          : 'bg-brand-50 text-brand-700 ring-brand-100'
                      )}
                    >
                      0
                    </span>
                  )}
                </div>
              </div>
              {isExpanded && (
                <ul
                  className={cn(
                    'space-y-2 border-t px-4 py-3 sm:px-5',
                    grupoVerificado
                      ? 'border-green-100 bg-green-50/40'
                      : 'border-brand-100/80 bg-gradient-to-b from-surface-muted/40 to-white'
                  )}
                >
                  {grupo.lineas.map((l) => (
                    <SwipeableConteoLinea
                      key={l.id}
                      disabled={saving}
                      open={swipeOpenLineId === l.id}
                      onOpenChange={(open) => setSwipeOpenLineId(open ? l.id : null)}
                      onEdit={() => empezarEditarLinea(l)}
                      onDelete={() => void eliminarLinea(l.id)}
                      className={
                        dobleVerificacion && l.verificada
                          ? 'border-green-500 bg-green-50'
                          : undefined
                      }
                      contentClassName={
                        dobleVerificacion && l.verificada ? 'bg-green-50' : undefined
                      }
                    >
                      <div className="min-w-0 flex-1 text-slate-800">
                        {etiquetaLinea(l)}
                        <span className="ml-1.5 text-xs text-slate-500">{formatRutaLinea(l)}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="rounded-md bg-slate-50 px-2 py-1 text-sm font-semibold tabular-nums text-slate-900 ring-1 ring-surface-border">
                          {l.tipo_bulto === 'SUELTO'
                            ? formatCantidadUnidad(l.cantidad_suelta ?? 0, l.unidad)
                            : formatCantidad(l.cantidad_cajas)}
                        </span>
                        {l.tipo_bulto === 'CAJA' && Number(l.cantidad_suelta ?? 0) > 0 && (
                          <span className="text-[11px] font-medium text-slate-500">
                            + {formatCantidadUnidad(l.cantidad_suelta ?? 0, l.unidad)}
                          </span>
                        )}
                        {dobleVerificacion && (
                          <button
                            type="button"
                            title={l.verificada ? 'Quitar tilde' : 'Marcar verificada'}
                            className={cn(
                              'flex h-8 w-8 items-center justify-center rounded-lg border',
                              l.verificada
                                ? 'border-green-600 bg-green-600 text-white'
                                : 'border-surface-border bg-white text-slate-500'
                            )}
                            disabled={saving}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation()
                              void toggleVerificada(l)
                            }}
                          >
                            <Check className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </SwipeableConteoLinea>
                  ))}
                </ul>
              )}
            </div>
          )
        })
      )

    return (
      <div className="-m-4 flex h-[calc(100vh-5rem)] flex-col bg-surface-muted/30 lg:-m-6">
        <div className="relative z-20 shrink-0 overflow-visible border-b border-surface-border bg-white shadow-sm">
          <div className="border-b border-brand-100 bg-gradient-to-r from-brand-50/80 via-white to-white px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <Button
                variant="ghost"
                size="sm"
                className="-ml-2 h-8 rounded-lg px-2"
                onClick={volverAlListado}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Salir
              </Button>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {badgeTipo('LISTA')}
                {badgeEstado('ABIERTA')}
                <span className="rounded-full bg-white px-2.5 py-1 font-medium text-slate-700 ring-1 ring-surface-border">
                  #{m.id}
                </span>
                <span className="rounded-full bg-white px-2.5 py-1 font-medium text-slate-700 ring-1 ring-surface-border">
                  {lineasActivasEditor.length} línea{lineasActivasEditor.length === 1 ? '' : 's'}
                </span>
              </div>
            </div>
          </div>

          {error && (
            <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700 sm:px-5">
              {error}
            </div>
          )}

          <div className="space-y-3 overflow-visible p-4 sm:p-5">
            <div className="flex flex-wrap gap-2">
              <div className="flex min-w-[9.5rem] flex-1 items-center rounded-xl border border-surface-border bg-white shadow-sm focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20">
                <span className="shrink-0 pl-3 text-xs font-medium text-slate-400">Origen</span>
                <select
                  ref={origenRef}
                  aria-label="Origen"
                  value={origenId}
                  onChange={(e) => setOrigenId(e.target.value)}
                  className="min-w-0 flex-1 border-0 bg-transparent py-2 pl-2 pr-3 text-sm focus:outline-none"
                >
                  <option value="">Elegir…</option>
                  {sectores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
              </div>
              {origenUsaUb && (
                <div className="flex min-w-[9.5rem] flex-1 items-center rounded-xl border border-surface-border bg-white shadow-sm focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20">
                  <span className="shrink-0 pl-3 text-xs font-medium text-slate-400">Ub. origen</span>
                  <UbicacionOrigenSelect
                    sectorId={Number(origenId)}
                    value={ubicacionOrigenId ? Number(ubicacionOrigenId) : null}
                    emptyLabel="Sin ub."
                    className="min-w-0 flex-1 border-0 bg-transparent py-2 pl-2 pr-3 text-sm shadow-none focus:outline-none"
                    onChange={(id) => setUbicacionOrigenId(id ? String(id) : '')}
                  />
                </div>
              )}
              <div className="flex min-w-[9.5rem] flex-1 items-center rounded-xl border border-surface-border bg-white shadow-sm focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20">
                <span className="shrink-0 pl-3 text-xs font-medium text-slate-400">Destino</span>
                <select
                  ref={destinoRef}
                  aria-label="Destino"
                  value={destinoId}
                  onChange={(e) => setDestinoId(e.target.value)}
                  className="min-w-0 flex-1 border-0 bg-transparent py-2 pl-2 pr-3 text-sm focus:outline-none"
                >
                  <option value="">Elegir…</option>
                  {sectores
                    .filter((s) => String(s.id) !== origenId || !!s.usa_ubicaciones)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nombre}
                        {String(s.id) === origenId ? ' (reubicar)' : ''}
                      </option>
                    ))}
                </select>
              </div>
              {destinoUsaUb && (
                <div className="flex min-w-[9.5rem] flex-1 items-center rounded-xl border border-surface-border bg-white shadow-sm focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20">
                  <span className="shrink-0 pl-3 text-xs font-medium text-slate-400">Ub. destino</span>
                  <UbicacionDestinoSelect
                    sectorId={Number(destinoId)}
                    value={ubicacionDestinoId ? Number(ubicacionDestinoId) : null}
                    emptyLabel="Sin ub."
                    className="min-w-0 flex-1 border-0 bg-transparent py-2 pl-2 pr-3 text-sm shadow-none focus:outline-none"
                    onChange={(id) => setUbicacionDestinoId(id ? String(id) : '')}
                  />
                </div>
              )}
            </div>

            <div className="relative flex flex-col gap-2 overflow-visible sm:flex-row">
              <div
                className="relative z-30 min-w-0 flex-1"
                onMouseDown={(e) => {
                  if (e.target === productSearchRef.current) return
                  e.preventDefault()
                  focusProductSearch()
                }}
              >
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400" />
                <input
                  ref={productSearchRef}
                  type="search"
                  role="combobox"
                  aria-expanded={productResults.length > 0 && !selectedProduct}
                  aria-autocomplete="list"
                  placeholder={
                    origenId
                      ? 'Buscar producto con stock en origen — ↑↓ · Enter'
                      : 'Primero elegí sector origen'
                  }
                  disabled={!origenId}
                  value={productSearch}
                  onChange={(e) => {
                    setProductSearch(e.target.value)
                    setProductHighlightIndex(-1)
                    if (selectedProduct && e.target.value !== selectedProduct.codigo_interno) {
                      setSelectedProduct(null)
                      setError('')
                    }
                  }}
                  onKeyDown={handleProductSearchKeyDown}
                  className="w-full rounded-xl border border-surface-border bg-white py-2.5 pl-10 pr-3 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50 disabled:opacity-70"
                />
                {searchingProducts && productSearch.trim() && !selectedProduct && (
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
                            index === productHighlightIndex ? 'bg-brand-50 text-brand-900' : 'hover:bg-slate-50'
                          )}
                          onMouseEnter={() => setProductHighlightIndex(index)}
                          onClick={() => selectProduct(p)}
                        >
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-semibold">
                            {p.codigo_interno}
                          </span>
                          <span className="truncate text-slate-600">{p.nombre}</span>
                          <span className="ml-auto shrink-0 text-right text-xs text-slate-400">
                            {Number(p.stock_cajas) > 0 && (
                              <span className="block">{formatCantidad(p.stock_cajas)} cj</span>
                            )}
                            {Number(p.stock_botellas_sueltas ?? 0) > 0 && (
                              <span className="block">
                                {formatCantidadUnidad(p.stock_botellas_sueltas ?? 0, p.unidad)}
                              </span>
                            )}
                            {Number(p.stock_cajas) <= 0 &&
                              Number(p.stock_botellas_sueltas ?? 0) <= 0 &&
                              formatCantidad(p.stock_cajas)}
                          </span>
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
                  disabled={!origenId}
                  onClick={() => setShowScanner(true)}
                >
                  <Camera className="h-4 w-4" />
                  Escanear
                </Button>
              </div>
            </div>

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
              {totalSueltoGeneral > 0 && (
                <p className="mt-0.5 text-xs font-medium text-slate-500">
                  + {formatCantidad(totalSueltoGeneral)} botellas sueltas
                </p>
              )}
              <p className="mt-1 text-xs text-slate-500">
                {dobleVerificacion ? (
                  <>
                    {lineasActivasEditor.filter((l) => l.verificada).length}/
                    {lineasActivasEditor.length} verificada
                    {lineasActivasEditor.length === 1 ? '' : 's'}
                  </>
                ) : (
                  <>
                    {lineasActivasEditor.length} línea
                    {lineasActivasEditor.length === 1 ? '' : 's'} cargada
                    {lineasActivasEditor.length === 1 ? '' : 's'}
                  </>
                )}
              </p>
            </div>
            {hasPermiso('movimientos_internos.crear') && (
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button
                  variant="secondary"
                  className="rounded-xl"
                  disabled={saving}
                  onClick={() => void cancelarListaAbierta()}
                >
                  Cancelar movimientos
                </Button>
                <Button
                  className="rounded-xl"
                  onClick={() => void finalizarLista()}
                  disabled={
                    lineasActivasEditor.length === 0 ||
                    saving ||
                    (dobleVerificacion &&
                      lineasActivasEditor.some((l) => !l.verificada))
                  }
                  title={
                    dobleVerificacion &&
                    lineasActivasEditor.some((l) => !l.verificada)
                      ? 'Tildá cada línea activa antes de finalizar'
                      : undefined
                  }
                >
                  <Check className="h-4 w-4" />
                  {saving ? 'Guardando...' : 'Finalizar movimientos'}
                </Button>
              </div>
            )}
          </div>
        </div>

        {selectedProduct && (
          <>
            <div
              className="fixed inset-0 z-40 bg-slate-900/45"
              aria-hidden
              onClick={cancelarLineaForm}
            />
            <div
              ref={productLineFormRef}
              className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-3xl overflow-y-auto overscroll-contain rounded-t-2xl border-2 border-b-0 border-brand-400 bg-white p-4 shadow-[0_-12px_40px_rgba(15,23,42,0.25)] ring-4 ring-brand-500/15 sm:rounded-2xl sm:border sm:p-5"
              style={{ maxHeight: 'min(92dvh, 40rem)' }}
            >
              <div className="mb-3 sm:mb-4">
                <div className="flex items-center gap-2">
                  <span className="inline-flex min-w-0 rounded-md bg-slate-50 px-2 py-0.5 font-mono text-sm font-semibold text-slate-700 ring-1 ring-surface-border">
                    {selectedProduct.codigo_interno}
                  </span>
                  <p className="ml-auto shrink-0 text-xs font-semibold uppercase tracking-wide text-brand-600">
                    {editingLineaId != null ? 'Editar línea' : 'Nueva línea'}
                  </p>
                  <button
                    type="button"
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    onClick={cancelarLineaForm}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-1 text-base font-semibold text-slate-900">{selectedProduct.nombre}</p>
                {tipoBulto === 'SUELTO'
                  ? stockDisponibleBotellas !== null && (
                      <p className="mt-0.5 text-xs text-slate-500">
                        Disponible:{' '}
                        {formatCantidadUnidad(stockDisponibleBotellas, selectedProduct.unidad)}
                      </p>
                    )
                  : (stockDisponible !== null || stockDisponibleBotellas !== null) && (
                      <p className="mt-0.5 text-xs text-slate-500">
                        Disponible:{' '}
                        {stockDisponible !== null
                          ? `${formatCantidad(stockDisponible)} cajas`
                          : null}
                        {tipoBulto === 'CAJA' &&
                          stockDisponibleBotellas !== null &&
                          stockDisponibleBotellas > 0 && (
                            <>
                              {stockDisponible !== null ? ' · ' : null}
                              {formatCantidadUnidad(
                                stockDisponibleBotellas,
                                selectedProduct.unidad
                              )}{' '}
                              sueltas
                            </>
                          )}
                      </p>
                    )}
              </div>

              <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="flex items-center rounded-xl border border-surface-border bg-white focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20">
                  <span className="shrink-0 pl-3 text-xs font-medium text-slate-400">Origen</span>
                  <select
                    value={formOrigenId}
                    onChange={(e) => {
                      setFormOrigenId(e.target.value)
                      setFormUbicacionOrigenId('')
                    }}
                    className="min-w-0 flex-1 border-0 bg-transparent py-2 pl-2 pr-3 text-sm focus:outline-none"
                  >
                    <option value="">Elegir…</option>
                    {sectores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                {formOrigenUsaUb && (
                  <div className="flex items-center rounded-xl border border-surface-border bg-white focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20">
                    <span className="shrink-0 pl-3 text-xs font-medium text-slate-400">Ub. origen</span>
                    <UbicacionOrigenSelect
                      sectorId={Number(formOrigenId)}
                      value={formUbicacionOrigenId ? Number(formUbicacionOrigenId) : null}
                      emptyLabel="Sin ub."
                      className="min-w-0 flex-1 border-0 bg-transparent py-2 pl-2 pr-3 text-sm shadow-none focus:outline-none"
                      onChange={(id) => setFormUbicacionOrigenId(id ? String(id) : '')}
                    />
                  </div>
                )}
                <div className="flex items-center rounded-xl border border-surface-border bg-white focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20">
                  <span className="shrink-0 pl-3 text-xs font-medium text-slate-400">Destino</span>
                  <select
                    value={formDestinoId}
                    onChange={(e) => {
                      setFormDestinoId(e.target.value)
                      setFormUbicacionDestinoId('')
                    }}
                    className="min-w-0 flex-1 border-0 bg-transparent py-2 pl-2 pr-3 text-sm focus:outline-none"
                  >
                    <option value="">Elegir…</option>
                    {sectores
                      .filter((s) => String(s.id) !== formOrigenId || !!s.usa_ubicaciones)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nombre}
                          {String(s.id) === formOrigenId ? ' (reubicar)' : ''}
                        </option>
                      ))}
                  </select>
                </div>
                {formDestinoUsaUb && (
                  <div className="flex items-center rounded-xl border border-surface-border bg-white focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20">
                    <span className="shrink-0 pl-3 text-xs font-medium text-slate-400">Ub. destino</span>
                    <UbicacionDestinoSelect
                      sectorId={Number(formDestinoId)}
                      value={formUbicacionDestinoId ? Number(formUbicacionDestinoId) : null}
                      emptyLabel="Sin ub."
                      className="min-w-0 flex-1 border-0 bg-transparent py-2 pl-2 pr-3 text-sm shadow-none focus:outline-none"
                      onChange={(id) => setFormUbicacionDestinoId(id ? String(id) : '')}
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Tipo</label>
                  <div className="flex rounded-xl border border-surface-border bg-slate-50 p-0.5">
                    {(
                      [
                        { value: 'PALLET' as const, label: 'Pallets' },
                        { value: 'CAJA' as const, label: 'Cajas' },
                        { value: 'SUELTO' as const, label: 'Botellas' }
                      ]
                    ).map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleTipoBultoChange(opt.value)}
                        className={cn(
                          'flex-1 rounded-[10px] px-2 py-2 text-sm font-semibold transition-colors',
                          tipoBulto === opt.value
                            ? 'bg-brand-600 text-white shadow-md ring-2 ring-brand-600/30'
                            : 'text-slate-500 hover:bg-white/70 hover:text-slate-700'
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                {tipoBulto === 'SUELTO' ? (
                  <>
                    <div className="col-span-2">
                      <Input
                        ref={cantidadSueltaRef}
                        label="Cant. botellas"
                        type="number"
                        min="1"
                        value={cantidadSuelta}
                        onChange={(e) => setCantidadSuelta(e.target.value)}
                        onKeyDown={handleLineaEnter}
                        placeholder="6"
                        className="rounded-xl [&_label]:text-sm"
                      />
                    </div>
                    {/* Reserva la 2.ª fila (mismo alto que el campo opcional en Pallets/Cajas). */}
                    <div
                      className="col-span-2 invisible pointer-events-none sm:col-span-2 sm:col-start-3"
                      aria-hidden
                    >
                      <Input
                        label="Espacio"
                        type="number"
                        value=""
                        readOnly
                        tabIndex={-1}
                        className="rounded-xl [&_label]:text-sm"
                      />
                    </div>
                  </>
                ) : (
                  <>
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
                          focusField(unidadesPorBultoRef)
                        }
                      }}
                      placeholder={tipoBulto === 'PALLET' ? '2' : '1'}
                      className="rounded-xl [&_label]:text-sm"
                    />
                    <Input
                      ref={unidadesPorBultoRef}
                      label={tipoBulto === 'PALLET' ? '× cajas por pallet' : '× botellas por caja'}
                      type="number"
                      min="1"
                      value={unidadesPorBulto}
                      onChange={(e) => setUnidadesPorBulto(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          focusField(cantidadSueltaRef)
                        }
                      }}
                      placeholder={tipoBulto === 'PALLET' ? '112' : '6'}
                      className="rounded-xl [&_label]:text-sm"
                    />
                    <div className="col-span-2 sm:col-span-2 sm:col-start-3">
                      <Input
                        ref={cantidadSueltaRef}
                        label={
                          tipoBulto === 'PALLET'
                            ? 'Cajas sueltas (opc.)'
                            : 'Botellas sueltas (opc.)'
                        }
                        type="number"
                        min="0"
                        value={cantidadSuelta}
                        onChange={(e) => setCantidadSuelta(e.target.value)}
                        onKeyDown={handleLineaEnter}
                        placeholder="0"
                        className="rounded-xl [&_label]:text-sm"
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="mt-4 flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1 rounded-xl"
                  disabled={saving}
                  onClick={cancelarLineaForm}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  className="flex-1 rounded-xl"
                  disabled={saving || !formOrigenId || !formDestinoId}
                  onClick={() => void guardarLineaForm()}
                >
                  {editingLineaId != null ? (
                    <>
                      <Check className="h-4 w-4" />
                      {saving ? 'Guardando...' : 'Guardar'}
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      {saving ? 'Guardando...' : 'Agregar'}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </>
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
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Movimientos</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Movimientos internos
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-500">
            {dobleVerificacion
              ? 'Lista abierta compartida: cargá líneas, salí y volvé cuando quieras; tildá y finalizá para mover el stock.'
              : 'Lista abierta compartida: cargá líneas, salí y volvé cuando quieras; al finalizar se mueve el stock sin tildar.'}
          </p>
        </div>
        {hasPermiso('movimientos_internos.crear') && (
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <p className="text-xs text-slate-400 sm:text-right">
              {movimientosDelDia.length > 0
                ? 'Enter o ↓ en movimientos · Enter abre detalle'
                : 'Enter → abrir lista'}
            </p>
            <Button
              type="button"
              className="rounded-xl px-4"
              disabled={loadingEditor}
              onClick={() => void abrirListaEditor()}
            >
              {loadingEditor ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ClipboardList className="h-4 w-4" />
              )}
              {tieneListaAbierta ? 'Continuar lista abierta' : 'Crear lista de movimientos'}
            </Button>
          </div>
        )}
      </section>

      <Card className="overflow-hidden shadow-panel">
        <div className="border-b border-brand-100 bg-gradient-to-r from-brand-50/80 via-white to-white px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div
                className="relative min-w-[10rem] flex-1"
                onMouseDown={(e) => {
                  if (e.target === listSearchRef.current) return
                  e.preventDefault()
                  focusListSearch()
                }}
              >
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400" />
                <input
                  ref={listSearchRef}
                  type="search"
                  placeholder="Buscar por sector, producto..."
                  value={listSearch}
                  onChange={(e) => setListSearch(e.target.value)}
                  onKeyDown={registroListKb.handleListSearchKeyDown}
                  className="w-full rounded-xl border border-surface-border bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
              </div>

              <div className="flex shrink-0 items-center gap-1.5 rounded-xl border border-surface-border bg-white px-2 py-1.5 shadow-sm">
                <span className="pl-1 text-xs font-medium text-slate-500">Desde</span>
                <input
                  id="movimientos-fecha-desde"
                  type="date"
                  value={listFechaDesde}
                  onChange={(e) => setListFechaDesde(e.target.value)}
                  className="rounded border-0 bg-transparent px-1 py-1 text-sm focus:outline-none focus:ring-0"
                />
                <span className="text-slate-300">|</span>
                <span className="text-xs font-medium text-slate-500">Hasta</span>
                <input
                  id="movimientos-fecha-hasta"
                  type="date"
                  value={listFechaHasta}
                  onChange={(e) => setListFechaHasta(e.target.value)}
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
              Una sola fecha filtra ese día · las dos juntas = rango · la lista abierta no aparece
              acá
            </p>

            <DayTabsRow
              days={diasConMovimientos}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
              getCount={(dia) => conteoPorDia.get(dia) ?? 0}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-surface-border bg-slate-50/80 px-5 py-3.5 sm:px-6">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              {diasConMovimientos.length > 0 ? formatDayTabLabel(selectedDay) : 'Historial'}
            </h2>
            <p className="text-xs text-slate-500">
              {diasConMovimientos.length > 0
                ? `${movimientosDelDia.length} movimiento(s) · ${formatCantidad(totalCajasDelDia)} en el día`
                : `${movimientos.length} movimiento(s)`}
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
              Cargando movimientos...
            </div>
          ) : movimientos.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <ClipboardList className="h-7 w-7" />
              </div>
              <p className="mt-4 text-sm font-medium text-slate-700">
                {listSearch || listFechaDesde || listFechaHasta
                  ? 'No hay movimientos con esos filtros'
                  : 'No hay movimientos cerrados'}
              </p>
              <p className="mt-1 max-w-sm text-xs text-slate-500">
                {listSearch || listFechaDesde || listFechaHasta
                  ? 'Probá ampliar el rango de fechas o limpiar la búsqueda'
                  : 'Creá una lista de movimientos para empezar a trasladar stock'}
              </p>
            </div>
          ) : movimientosDelDia.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <ArrowLeftRight className="h-7 w-7" />
              </div>
              <p className="mt-4 text-sm font-medium text-slate-700">No hay movimientos en este día</p>
              <p className="mt-1 text-xs text-slate-500">Elegí otra pestaña de día arriba</p>
            </div>
          ) : (
            <ul className="divide-y divide-surface-border">
              {movimientosDelDia.map((m, index) => (
                <li
                  key={m.id}
                  {...registroListKb.listItemProps(
                    index,
                    'flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-slate-50/80 sm:flex-row sm:items-center sm:gap-4 sm:px-6'
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold text-slate-900">Movimiento #{m.id}</p>
                      {badgeTipo(m.tipo)}
                      {badgeEstado(m.estado, !!m.ingreso_directo)}
                    </div>
                    <p className="mt-1 text-sm text-slate-700">
                      {m.sector_origen_nombre} → {m.sector_destino_nombre}
                    </p>
                    {m.observacion?.trim() ? (
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">{m.observacion}</p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span>
                        {m.lineas_count} línea{m.lineas_count === 1 ? '' : 's'}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {m.creado_por_nombre}
                      </span>
                      {m.recibido_por_nombre && (
                        <span className="text-green-700">Completado por {m.recibido_por_nombre}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 sm:justify-end">
                    <span className="inline-flex min-w-[3rem] items-center justify-center rounded-lg bg-brand-50 px-2.5 py-1.5 text-sm font-bold tabular-nums text-brand-700 ring-1 ring-brand-100">
                      {formatCantidad(m.total_cajas)}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="rounded-lg"
                      onClick={() => void abrirDetalle(m.id)}
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

function UbicacionDestinoSelect({
  sectorId,
  value,
  disabled = false,
  className = '',
  emptyLabel = 'Sin ubicación',
  onChange
}: {
  sectorId: number
  value: number | null
  disabled?: boolean
  className?: string
  emptyLabel?: string
  onChange: (id: number | null) => void
}) {
  const [opciones, setOpciones] = useState<SectorUbicacion[]>([])

  useEffect(() => {
    void api<SectorUbicacion[]>(`/api/sectores/${sectorId}/ubicaciones`)
      .then((data) => setOpciones(data.filter((u) => u.activo)))
      .catch(() => setOpciones([]))
  }, [sectorId])

  return (
    <select
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      className={`rounded border border-surface-border px-2 py-1.5 text-sm disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-70 ${className}`}
    >
      <option value="">{emptyLabel}</option>
      {opciones.map((u) => (
        <option key={u.id} value={u.id}>
          {u.nombre}
        </option>
      ))}
    </select>
  )
}

function UbicacionOrigenSelect({
  sectorId,
  value,
  disabled = false,
  className = '',
  emptyLabel,
  onChange
}: {
  sectorId: number
  value: number | null
  disabled?: boolean
  className?: string
  emptyLabel?: string
  onChange: (id: number | null) => void
}) {
  return (
    <UbicacionDestinoSelect
      sectorId={sectorId}
      value={value}
      disabled={disabled}
      className={className}
      emptyLabel={emptyLabel}
      onChange={onChange}
    />
  )
}
