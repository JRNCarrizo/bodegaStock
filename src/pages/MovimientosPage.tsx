import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeftRight,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  Plus,
  Search,
  Send,
  Trash2,
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
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardBody } from '@/components/ui/Card'
import { ProductImage } from '@/components/ProductImage'
import {
  botellasPorCajaDefault,
  calcTotalEnCajas,
  formatCantidad,
  formatDayTabLabel,
  formatEtiqueta,
  formatTotalCajas,
  todayIsoDate
} from '@/lib/desglose'
import { api, cn } from '@/lib/utils'
import type {
  MovimientoInternoDetalle,
  MovimientoInternoDetalleLinea,
  MovimientoInternoEstado,
  MovimientoInternoLineaDraft,
  MovimientoInternoListItem,
  MovimientoInternoProductoStock,
  MovimientoInternoSectorStock,
  MovimientoInternoTipo,
  Sector,
  SectorUbicacion
} from '@/types'
import { useAuth } from '@/context/AuthContext'
import { useEscHandler } from '@/hooks/useEscHandler'

function newTempId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function badgeTipo(tipo: MovimientoInternoTipo) {
  if (tipo === 'ENVIAR') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-800 ring-1 ring-brand-100">
        <Send className="h-3 w-3" />
        Enviar
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

function badgeEstado(estado: MovimientoInternoEstado) {
  switch (estado) {
    case 'PENDIENTE':
      return (
        <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-100">
          Pendiente
        </span>
      )
    case 'COMPLETADO':
      return (
        <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-800 ring-1 ring-green-100">
          Completado
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

export function MovimientosPage() {
  const { hasPermiso, user } = useAuth()
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list')
  const [movimientos, setMovimientos] = useState<MovimientoInternoListItem[]>([])
  const [detalle, setDetalle] = useState<MovimientoInternoDetalle | null>(null)
  const [loadingList, setLoadingList] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const [listSearch, setListSearch] = useState('')
  const [listFechaDesde, setListFechaDesde] = useState('')
  const [listFechaHasta, setListFechaHasta] = useState('')
  const [selectedDay, setSelectedDay] = useState(() => todayIsoDate())
  const [filtroEstado, setFiltroEstado] = useState<'TODOS' | MovimientoInternoEstado>('TODOS')
  const [filtroTipo, setFiltroTipo] = useState<'TODOS' | MovimientoInternoTipo>('TODOS')

  const [createTipo, setCreateTipo] = useState<MovimientoInternoTipo>('ENVIAR')
  const [createPhase, setCreatePhase] = useState<'datos' | 'carga'>('datos')
  const [fecha, setFecha] = useState(todayIsoDate())
  const [sectorContextoId, setSectorContextoId] = useState('')
  const [sectorDestinoDefaultId, setSectorDestinoDefaultId] = useState('')
  const [defaultUbicacionDestinoId, setDefaultUbicacionDestinoId] = useState('')
  const [observacion, setObservacion] = useState('')
  const [sectores, setSectores] = useState<Sector[]>([])
  const [ubicacionesDestino, setUbicacionesDestino] = useState<SectorUbicacion[]>([])
  const [ubicacionesCache, setUbicacionesCache] = useState<Record<number, SectorUbicacion[]>>({})

  const [productSearch, setProductSearch] = useState('')
  const [productResults, setProductResults] = useState<MovimientoInternoProductoStock[]>([])
  const [productHighlightIndex, setProductHighlightIndex] = useState(-1)
  const [searchingProducts, setSearchingProducts] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<MovimientoInternoProductoStock | null>(null)
  const [origenesDisponibles, setOrigenesDisponibles] = useState<MovimientoInternoSectorStock[]>([])
  const [lineOrigenId, setLineOrigenId] = useState('')
  const [tipoBulto, setTipoBulto] = useState<'PALLET' | 'CAJA'>('PALLET')
  const [cantidadBultos, setCantidadBultos] = useState('')
  const [unidadesPorBulto, setUnidadesPorBulto] = useState('')
  const [lineUbicacionDestinoId, setLineUbicacionDestinoId] = useState('')
  const [stockDisponible, setStockDisponible] = useState<number | null>(null)
  const [lineas, setLineas] = useState<MovimientoInternoLineaDraft[]>([])
  const [expandedProductos, setExpandedProductos] = useState<Set<number>>(() => new Set())
  const [showScanner, setShowScanner] = useState(false)

  const [editLineas, setEditLineas] = useState<MovimientoInternoDetalle['lineas']>([])
  const [lineasConfirmadas, setLineasConfirmadas] = useState<Set<number>>(() => new Set())
  const [expandedProductosDetalle, setExpandedProductosDetalle] = useState<Set<number>>(() => new Set())

  const fechaRef = useRef<HTMLInputElement>(null)
  const sectorContextoRef = useRef<HTMLSelectElement>(null)
  const sectorDestinoRef = useRef<HTMLSelectElement>(null)
  const productSearchRef = useRef<HTMLInputElement>(null)
  const cargaPanelRef = useRef<HTMLDivElement>(null)
  const listScrollRef = useRef<HTMLDivElement>(null)
  const productLineFormRef = useRef<HTMLDivElement>(null)
  const tipoBultoRef = useRef<HTMLSelectElement>(null)
  const cantidadBultosRef = useRef<HTMLInputElement>(null)
  const unidadesPorBultoRef = useRef<HTMLInputElement>(null)
  const lineOrigenRef = useRef<HTMLSelectElement>(null)
  const lineUbicacionDestinoRef = useRef<HTMLSelectElement>(null)
  const listSearchRef = useRef<HTMLInputElement>(null)
  const productResultsListRef = useRef<HTMLUListElement>(null)

  const totalGeneral = useMemo(
    () => lineas.reduce((s, l) => s + l.cantidad_cajas, 0),
    [lineas]
  )

  const lineasPorProducto = useMemo(() => {
    const map = new Map<number, { producto: MovimientoInternoLineaDraft; lineas: MovimientoInternoLineaDraft[] }>()
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

  const lineasPorProductoDetalle = useMemo(() => {
    const map = new Map<
      number,
      { producto: MovimientoInternoDetalle['lineas'][number]; lineas: MovimientoInternoDetalle['lineas'] }
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
    detalle?.movimiento.estado === 'PENDIENTE' &&
    hasPermiso('movimientos_internos.crear') &&
    user?.id !== detalle.movimiento.creado_por_id

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

  function resumenSectorLineas(campo: 'origen' | 'destino'): string {
    const names = [
      ...new Set(
        lineasActivasDetalle
          .map((l) => (campo === 'origen' ? l.sector_origen_nombre : l.sector_destino_nombre))
          .filter(Boolean)
      )
    ]
    if (names.length === 0) return '—'
    if (names.length === 1) return names[0]
    return campo === 'origen' ? 'Varios orígenes' : 'Varios destinos'
  }

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
      if (filtroEstado !== 'TODOS') params.set('estado', filtroEstado)
      if (filtroTipo !== 'TODOS') params.set('tipo', filtroTipo)
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
  }, [listSearch, listFechaDesde, listFechaHasta, filtroEstado, filtroTipo, selectedDay])

  useEffect(() => {
    void loadMovimientos()
  }, [loadMovimientos])

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
    if (view !== 'create') return
    const sectorId = destinoSectorIdCreate()
    if (!sectorId || !sectorUsaUbicaciones(sectorId)) {
      setUbicacionesDestino([])
      return
    }
    void loadUbicacionesSector(sectorId).then(setUbicacionesDestino)
  }, [view, createPhase, createTipo, sectorContextoId, sectorDestinoDefaultId, sectores])

  useEffect(() => {
    setDefaultUbicacionDestinoId('')
    setLineUbicacionDestinoId('')
  }, [sectorDestinoDefaultId, sectorContextoId, createTipo])

  useEffect(() => {
    if (!detalle) return
    const sectorIds = [...new Set(editLineas.map((l) => l.sector_destino_id))]
    for (const id of sectorIds) {
      if (sectorUsaUbicaciones(id)) void loadUbicacionesSector(id)
    }
  }, [detalle?.movimiento.id, editLineas])

  useEffect(() => {
    if (view !== 'create' || createPhase !== 'carga' || !sectorContextoId) {
      setProductResults([])
      return
    }
    if (!productSearch.trim()) {
      setProductResults([])
      setProductHighlightIndex(-1)
      return
    }
    const modo = createTipo === 'ENVIAR' ? 'enviar' : 'recibir'
    const t = setTimeout(async () => {
      setSearchingProducts(true)
      try {
        const params = new URLSearchParams({ modo, sector_id: sectorContextoId, q: productSearch.trim() })
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
  }, [view, createPhase, createTipo, sectorContextoId, productSearch])

  useEffect(() => {
    if (!selectedProduct || createTipo !== 'RECIBIR') {
      setOrigenesDisponibles([])
      return
    }
    void api<MovimientoInternoSectorStock[]>(
      `/api/movimientos-internos/producto/${selectedProduct.id}/sectores-stock?excluir_sector_id=${sectorContextoId}`
    )
      .then((rows) => {
        setOrigenesDisponibles(rows)
        if (rows.length > 0) setLineOrigenId(String(rows[0].sector_id))
      })
      .catch(() => setOrigenesDisponibles([]))
  }, [selectedProduct, createTipo, sectorContextoId])

  useEffect(() => {
    const sectorStockId =
      createTipo === 'ENVIAR' ? sectorContextoId : lineOrigenId
    if (!selectedProduct || !sectorStockId) {
      setStockDisponible(null)
      return
    }
    void api<{ stock_disponible_cajas: number }>(
      `/api/movimientos-internos/producto/${selectedProduct.id}/stock-sector/${sectorStockId}`
    )
      .then((r) => setStockDisponible(r.stock_disponible_cajas))
      .catch(() => setStockDisponible(null))
  }, [selectedProduct, createTipo, sectorContextoId, lineOrigenId])

  useLayoutEffect(() => {
    if (productHighlightIndex < 0) return
    const list = productResultsListRef.current
    if (!list) return
    const item = list.children[productHighlightIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [productHighlightIndex])

  useEffect(() => {
    if (detalle) {
      setEditLineas(detalle.lineas.map((l) => ({ ...l })))
      setLineasConfirmadas(new Set())
      setExpandedProductosDetalle(new Set())
    }
  }, [detalle])

  useEscHandler(view !== 'list' || createPhase === 'carga', () => {
    if (showScanner) {
      setShowScanner(false)
      return true
    }
    if (view === 'create' && createPhase === 'carga') {
      setCreatePhase('datos')
      return true
    }
    if (view !== 'list') {
      setView('list')
      setDetalle(null)
      setError('')
      return true
    }
    return false
  })

  function volverAlListado() {
    setView('list')
    setDetalle(null)
    setCreatePhase('datos')
    setLineas([])
    setExpandedProductos(new Set())
    setSelectedProduct(null)
    setProductSearch('')
    setProductResults([])
    setDefaultUbicacionDestinoId('')
    setLineUbicacionDestinoId('')
    setError('')
  }

  function iniciarCreacion(tipo: MovimientoInternoTipo) {
    setCreateTipo(tipo)
    setView('create')
    setCreatePhase('datos')
    setFecha(todayIsoDate())
    setSectorContextoId('')
    setSectorDestinoDefaultId('')
    setDefaultUbicacionDestinoId('')
    setLineUbicacionDestinoId('')
    setObservacion('')
    setLineas([])
    setError('')
  }

  async function abrirDetalle(id: number) {
    setError('')
    try {
      const data = await api<MovimientoInternoDetalle>(`/api/movimientos-internos/${id}`)
      setDetalle(data)
      setView('detail')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar detalle')
    }
  }

  function avanzarACarga() {
    if (!fecha.trim()) {
      setError('Fecha requerida')
      return
    }
    if (!sectorContextoId) {
      setError(createTipo === 'ENVIAR' ? 'Sector origen requerido' : 'Sector destino requerido')
      return
    }
    if (createTipo === 'ENVIAR' && !sectorDestinoDefaultId) {
      setError('Sector destino requerido')
      return
    }
    if (createTipo === 'ENVIAR' && sectorContextoId === sectorDestinoDefaultId) {
      setError('Origen y destino deben ser distintos')
      return
    }
    setError('')
    setCreatePhase('carga')
    setProductSearch('')
    setSelectedProduct(null)
  }

  function defaultUnidadesPorBulto(
    tipo: 'PALLET' | 'CAJA',
    p: MovimientoInternoProductoStock | null
  ): string {
    if (!p) return tipo === 'PALLET' ? '112' : '6'
    if (tipo === 'PALLET') {
      return String(p.unidades_por_pallet_default ?? 112)
    }
    return String(p.unidades_por_caja_default ?? 6)
  }

  function resetLineaForm(forProduct?: MovimientoInternoProductoStock | null) {
    const p = forProduct ?? selectedProduct
    setTipoBulto('PALLET')
    setCantidadBultos('')
    setUnidadesPorBulto(defaultUnidadesPorBulto('PALLET', p))
    setLineUbicacionDestinoId(defaultUbicacionDestinoId)
  }

  function handleTipoBultoChange(tipo: 'PALLET' | 'CAJA') {
    setTipoBulto(tipo)
    setUnidadesPorBulto(defaultUnidadesPorBulto(tipo, selectedProduct))
  }

  function selectProduct(p: MovimientoInternoProductoStock) {
    setSelectedProduct(p)
    setProductSearch(p.codigo_interno)
    setProductResults([])
    setProductHighlightIndex(-1)
    resetLineaForm(p)
    setError('')
    setTimeout(() => focusField(cantidadBultosRef), 50)
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

  function etiquetaLineaDetalle(l: MovimientoInternoDetalleLinea): string {
    if (l.etiqueta) return l.etiqueta
    if (l.tipo_bulto && l.cantidad_bultos != null && l.unidades_por_bulto != null) {
      return formatEtiqueta(
        {
          tipo_bulto: l.tipo_bulto,
          cantidad_bultos: l.cantidad_bultos,
          unidades_por_bulto: l.unidades_por_bulto
        },
        l.unidad
      )
    }
    return formatTotalCajas(l.cantidad_cajas)
  }

  function quitarLinea(tempId: string) {
    setLineas((prev) => prev.filter((l) => l.tempId !== tempId))
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

  function sectorNombre(id: number): string {
    return sectores.find((s) => s.id === id)?.nombre ?? '—'
  }

  function destinoSectorIdCreate(): number {
    return createTipo === 'ENVIAR' ? Number(sectorDestinoDefaultId) : Number(sectorContextoId)
  }

  function sectorUsaUbicaciones(sectorId: number): boolean {
    return !!sectores.find((s) => s.id === sectorId)?.usa_ubicaciones
  }

  const loadUbicacionesSector = useCallback(async (sectorId: number) => {
    if (!sectorId || !sectorUsaUbicaciones(sectorId)) {
      return [] as SectorUbicacion[]
    }
    if (ubicacionesCache[sectorId]) return ubicacionesCache[sectorId]
    try {
      const data = await api<SectorUbicacion[]>(`/api/sectores/${sectorId}/ubicaciones`)
      const activas = data.filter((u) => u.activo)
      setUbicacionesCache((prev) => ({ ...prev, [sectorId]: activas }))
      return activas
    } catch {
      return [] as SectorUbicacion[]
    }
  }, [ubicacionesCache, sectores])

  function ubicacionNombre(sectorId: number, ubicacionId: number | null): string | null {
    if (!ubicacionId) return null
    const list = ubicacionesCache[sectorId] ?? ubicacionesDestino
    return list.find((u) => u.id === ubicacionId)?.nombre ?? null
  }

  function agregarLinea(): boolean {
    if (!selectedProduct) {
      setError('Seleccioná un producto primero')
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

    const qty = calcTotalEnCajas(
      lineaInput,
      botellasPorCajaDefault(selectedProduct.unidades_por_caja_default)
    )
    if (qty <= 0) {
      setError('La cantidad debe ser mayor a cero')
      return false
    }
    if (stockDisponible !== null && qty > stockDisponible) {
      setError(`Stock insuficiente (disponible: ${formatCantidad(stockDisponible)})`)
      return false
    }

    let origenId: number
    let destinoId: number

    if (createTipo === 'ENVIAR') {
      origenId = Number(sectorContextoId)
      destinoId = Number(sectorDestinoDefaultId)
    } else {
      if (!lineOrigenId) {
        setError('Elegí sector de origen')
        return false
      }
      origenId = Number(lineOrigenId)
      destinoId = Number(sectorContextoId)
    }

    setLineas((prev) => [
      ...prev,
      {
        tempId: newTempId(),
        producto_id: selectedProduct.id,
        codigo_interno: selectedProduct.codigo_interno,
        nombre: selectedProduct.nombre,
        cantidad_cajas: qty,
        tipo_bulto: tipoBulto,
        cantidad_bultos: lineaInput.cantidad_bultos,
        unidades_por_bulto: lineaInput.unidades_por_bulto,
        etiqueta: formatEtiqueta(lineaInput, selectedProduct.unidad),
        sector_origen_id: origenId,
        sector_origen_nombre: sectorNombre(origenId),
        sector_destino_id: destinoId,
        sector_destino_nombre: sectorNombre(destinoId),
        ubicacion_destino_id: lineUbicacionDestinoId ? Number(lineUbicacionDestinoId) : null,
        ubicacion_destino_nombre: ubicacionNombre(
          destinoId,
          lineUbicacionDestinoId ? Number(lineUbicacionDestinoId) : null
        )
      }
    ])
    resetLineaForm()
    setError('')
    return true
  }

  function agregarLineaYContinuar() {
    if (!agregarLinea()) return
    setSelectedProduct(null)
    setProductSearch('')
    setProductResults([])
    setStockDisponible(null)
    setTimeout(() => productSearchRef.current?.focus(), 50)
  }

  function handleLineaEnter(e: React.KeyboardEvent) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    agregarLineaYContinuar()
  }

  async function guardarMovimiento() {
    if (lineas.length === 0) {
      setError('Agregá al menos un producto')
      return
    }
    setSaving(true)
    setError('')
    try {
      await api('/api/movimientos-internos', {
        method: 'POST',
        body: JSON.stringify({
          tipo: createTipo,
          fecha,
          sector_contexto_id: Number(sectorContextoId),
          sector_destino_default_id:
            createTipo === 'ENVIAR' ? Number(sectorDestinoDefaultId) : undefined,
          observacion: observacion.trim() || null,
          lineas: lineas.map((l) => ({
            producto_id: l.producto_id,
            cantidad_cajas: l.cantidad_cajas,
            tipo_bulto: l.tipo_bulto,
            cantidad_bultos: l.cantidad_bultos,
            unidades_por_bulto: l.unidades_por_bulto,
            etiqueta: l.etiqueta,
            sector_origen_id: l.sector_origen_id,
            sector_destino_id: l.sector_destino_id,
            ubicacion_destino_id: l.ubicacion_destino_id
          }))
        })
      })
      volverAlListado()
      void loadMovimientos()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
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
        }
        if (patch.sector_destino_id !== undefined) {
          next.sector_destino_nombre = sectorNombre(patch.sector_destino_id)
          if (patch.ubicacion_destino_id === undefined) {
            next.ubicacion_destino_id = null
            next.ubicacion_destino_nombre = null
          }
        }
        if (patch.ubicacion_destino_id !== undefined) {
          next.ubicacion_destino_id = patch.ubicacion_destino_id
          next.ubicacion_destino_nombre = ubicacionNombre(
            next.sector_destino_id,
            patch.ubicacion_destino_id
          )
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
    patch: Partial<{ sector_origen_id: number; sector_destino_id: number; ubicacion_destino_id: number | null }>
  ) {
    for (const l of lineasActivasGrupo(lineas)) {
      updateEditLinea(l.id, patch)
    }
  }

  async function completar() {
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
              ubicacion_destino_id: l.ubicacion_destino_id
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

  async function cancelarDoc() {
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
    if (view !== 'create' || createPhase !== 'datos') return
    const timer = setTimeout(() => focusField(fechaRef), 0)
    return () => clearTimeout(timer)
  }, [view, createPhase])

  useEffect(() => {
    if (view !== 'create' || createPhase !== 'carga') return
    const timer = setTimeout(focusProductSearch, 0)
    return () => clearTimeout(timer)
  }, [view, createPhase])

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

  if (view === 'detail' && detalle) {
    const m = detalle.movimiento

    const productosContent = (
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-surface-border bg-slate-50/80 px-4 py-2">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-700">Productos</h2>
          </div>
          <span className="text-xs text-slate-400">
            {formatCantidad(detalle.total_cajas)} · {lineasActivasDetalle.length} activo(s)
          </span>
        </div>
        <div className="divide-y divide-surface-border">
          {lineasPorProductoDetalle.map((grupo) => {
            const isExpanded = expandedProductosDetalle.has(grupo.producto.producto_id)
            const confirmada = grupoEstaConfirmado(grupo.lineas)
            const cancelada = grupoEstaCancelado(grupo.lineas)
            const lineaControl = lineasActivasGrupo(grupo.lineas)[0]
            const puedeEditarGrupo =
              m.estado === 'PENDIENTE' && puedeAutorizar && lineaControl != null

            const lineaRef = lineasActivasGrupo(grupo.lineas)[0] ?? grupo.lineas[0]
            const sectorId =
              lineaRef != null
                ? m.tipo === 'RECIBIR'
                  ? lineaRef.sector_origen_id
                  : lineaRef.sector_destino_id
                : null

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
                    aria-label={isExpanded ? 'Ocultar desglose' : 'Ver desglose'}
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
                  {sectorId != null && !cancelada && (
                    puedeEditarGrupo && !confirmada ? (
                      <div
                        className="flex shrink-0 items-center gap-1.5"
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <span className="text-xs text-slate-500">
                          {m.tipo === 'RECIBIR' ? 'Origen' : 'Destino'}
                        </span>
                        {m.tipo === 'RECIBIR' ? (
                          <SectorOrigenSelect
                            productoId={lineaRef.producto_id}
                            excluirSectorId={lineaRef.sector_destino_id}
                            value={lineaRef.sector_origen_id}
                            className="h-7 w-[100px] shrink-0 py-0 text-xs sm:w-[130px]"
                            onChange={(id) =>
                              updateSectorLineasGrupo(grupo.lineas, { sector_origen_id: id })
                            }
                          />
                        ) : (
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
                              .filter((s) => s.id !== lineaRef.sector_origen_id)
                              .map((s) => (
                                <option key={s.id} value={s.id}>{s.nombre}</option>
                              ))}
                          </select>
                        )}
                        {sectorUsaUbicaciones(lineaRef.sector_destino_id) && (
                          <>
                            <span className="text-xs text-slate-500">Ubic.</span>
                            <UbicacionDestinoSelect
                              sectorId={lineaRef.sector_destino_id}
                              value={lineaRef.ubicacion_destino_id}
                              className="h-7 w-[90px] shrink-0 rounded border border-surface-border px-1 py-0 text-xs sm:w-[110px]"
                              onChange={(id) =>
                                updateSectorLineasGrupo(grupo.lineas, { ubicacion_destino_id: id })
                              }
                            />
                          </>
                        )}
                      </div>
                    ) : (
                      <span className="flex shrink-0 items-center gap-1.5 text-xs">
                        <span className="text-slate-500">
                          {m.tipo === 'RECIBIR' ? 'Origen' : 'Destino'}
                        </span>
                        <span
                          className="max-w-[80px] truncate text-slate-600 sm:max-w-[120px]"
                          title={sectorNombre(sectorId)}
                        >
                          {sectorNombre(sectorId)}
                        </span>
                        {lineaRef.ubicacion_destino_nombre && (
                          <span
                            className="max-w-[72px] truncate text-slate-500"
                            title={lineaRef.ubicacion_destino_nombre}
                          >
                            · {lineaRef.ubicacion_destino_nombre}
                          </span>
                        )}
                      </span>
                    )
                  )}
                  <div className="flex shrink-0 items-center gap-2">
                    {cancelada && (
                      <span className="shrink-0 text-xs text-slate-400">Cancelada</span>
                    )}
                    <span className="inline-flex shrink-0 items-center rounded-lg bg-brand-50 px-2.5 py-1.5 text-sm font-bold tabular-nums text-brand-700 ring-1 ring-brand-100">
                      {formatCantidad(grupo.total)}
                    </span>
                    {m.estado === 'PENDIENTE' && puedeAutorizar && cancelada && (
                      <button
                        type="button"
                        className="shrink-0 text-xs text-brand-600 hover:underline"
                        onClick={() => restaurarLineasGrupo(grupo.lineas)}
                      >
                        Restaurar
                      </button>
                    )}
                    {puedeEditarGrupo && (
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
                        className={`flex items-center justify-between gap-2 py-2.5 pl-11 pr-4 text-sm ${
                          l.cancelada ? 'opacity-50' : ''
                        }`}
                      >
                        <span className="text-slate-700">
                          {etiquetaLineaDetalle(l)}
                          {l.ubicacion_destino_nombre && (
                            <span className="ml-1 text-slate-400">→ {l.ubicacion_destino_nombre}</span>
                          )}
                        </span>
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
            {badgeEstado(m.estado)}
          </>
        }
        meta={
          <>
            <RegistroDetalleMetaChip>
              <span className="font-medium text-slate-500">Origen </span>
              {resumenSectorLineas('origen')}
            </RegistroDetalleMetaChip>
            <span className="text-slate-400">→</span>
            <RegistroDetalleMetaChip>
              <span className="font-medium text-slate-500">Destino </span>
              {resumenSectorLineas('destino')}
            </RegistroDetalleMetaChip>
            <RegistroDetalleMetaChip icon={<User className="h-3.5 w-3.5 shrink-0 text-slate-400" />}>
              {m.creado_por_nombre}
            </RegistroDetalleMetaChip>
            {m.recibido_por_nombre && (
              <RegistroDetalleMetaChip>
                <span className="font-medium text-slate-500">Completado </span>
                {m.recibido_por_nombre}
              </RegistroDetalleMetaChip>
            )}
            {m.observacion && <RegistroDetalleObsChip>{m.observacion}</RegistroDetalleObsChip>}
          </>
        }
        antesProductos={
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
                    ? ' Tildá cada producto revisado; cuando todos estén confirmados podés completar.'
                    : user?.id === m.creado_por_id
                      ? ' Esperá a que otra persona lo autorice.'
                      : ''}
                </p>
              </div>
            )}
          </>
        }
        productosContent={productosContent}
        productosCount={lineasPorProductoDetalle.length}
        despuesProductos={
          <div className="flex flex-wrap gap-2">
            {puedeAutorizar && (
              <Button
                className="rounded-xl"
                disabled={saving || !listoParaCompletar}
                onClick={() => void completar()}
                title={
                  listoParaCompletar
                    ? undefined
                    : 'Tildá cada producto activo o quitá los que no van'
                }
              >
                <Check className="h-4 w-4" />
                Completar movimiento
              </Button>
            )}
            {puedeCancelarDoc && (
              <Button variant="secondary" className="rounded-xl" disabled={saving} onClick={() => void cancelarDoc()}>
                Cancelar
              </Button>
            )}
          </div>
        }
      />
    )
  }

  if (view === 'create' && createPhase === 'datos') {
    return (
      <div className="-m-4 h-[calc(100vh-5rem)] overflow-y-auto lg:-m-6">
        <div className="mx-auto flex max-w-lg flex-col gap-5 px-4 py-6 pb-16 lg:px-6">
          <Button variant="ghost" size="sm" className="-ml-2 h-9 self-start rounded-xl px-3" onClick={volverAlListado}>
            <ChevronLeft className="h-4 w-4" />
            Volver al listado
          </Button>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Alta</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
              {createTipo === 'ENVIAR' ? 'Enviar mercadería' : 'Recibir mercadería'}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {createTipo === 'ENVIAR'
                ? 'Mandás productos desde un sector hacia otro'
                : 'Pedís productos que están en otros sectores'}
            </p>
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-100">{error}</div>
          )}

          <Card className="overflow-hidden shadow-panel">
            <div className="border-b border-brand-100 bg-gradient-to-r from-brand-50/80 via-white to-white px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
                  {createTipo === 'ENVIAR' ? (
                    <Send className="h-5 w-5" />
                  ) : (
                    <ArrowLeftRight className="h-5 w-5" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Datos del movimiento</p>
                  <p className="text-xs text-slate-500">Fecha, sectores y observación</p>
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
              />
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {createTipo === 'ENVIAR' ? 'Sector origen *' : 'Sector destino (donde lo necesitás) *'}
                </label>
                <select
                  ref={sectorContextoRef}
                  value={sectorContextoId}
                  onChange={(e) => setSectorContextoId(e.target.value)}
                  className="w-full rounded-xl border border-surface-border px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                >
                  <option value="">Seleccionar...</option>
                  {sectores.map((s) => (
                    <option key={s.id} value={s.id}>{s.nombre}</option>
                  ))}
                </select>
              </div>
              {createTipo === 'ENVIAR' && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Sector destino *</label>
                  <select
                    ref={sectorDestinoRef}
                    value={sectorDestinoDefaultId}
                    onChange={(e) => setSectorDestinoDefaultId(e.target.value)}
                    className="w-full rounded-xl border border-surface-border px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  >
                    <option value="">Seleccionar...</option>
                    {sectores
                      .filter((s) => String(s.id) !== sectorContextoId)
                      .map((s) => (
                        <option key={s.id} value={s.id}>{s.nombre}</option>
                      ))}
                  </select>
                </div>
              )}
              {(() => {
                const destinoId = destinoSectorIdCreate()
                if (!destinoId || !sectorUsaUbicaciones(destinoId)) return null
                return (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Ubicación destino</label>
                    <select
                      value={defaultUbicacionDestinoId}
                      onChange={(e) => {
                        setDefaultUbicacionDestinoId(e.target.value)
                        setLineUbicacionDestinoId(e.target.value)
                      }}
                      className="w-full rounded-xl border border-surface-border px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                    >
                      <option value="">Sin ubicación</option>
                      {ubicacionesDestino.map((u) => (
                        <option key={u.id} value={u.id}>{u.nombre}</option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-slate-500">
                      Por defecto al cargar productos · podés cambiarla en cada línea
                    </p>
                  </div>
                )
              })()}
              <Input
                label="Observación"
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                placeholder="Opcional"
              />
              <Button type="button" className="w-full rounded-xl" onClick={avanzarACarga}>
                Continuar a productos
              </Button>
            </CardBody>
          </Card>
        </div>
      </div>
    )
  }

  if (view === 'create' && createPhase === 'carga') {
    const contextoNombre = sectorNombre(Number(sectorContextoId))
    const destinoNombre =
      createTipo === 'ENVIAR' ? sectorNombre(Number(sectorDestinoDefaultId)) : contextoNombre

    const lineasListContent =
      lineas.length === 0 ? (
        <div className="flex h-full min-h-[140px] flex-col items-center justify-center px-6 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <ArrowLeftRight className="h-6 w-6" />
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
                >
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => toggleProductoExpand(grupo.producto.producto_id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">
                    {grupo.producto.codigo_interno}
                  </span>
                  <p className="mt-1 truncate text-sm font-semibold text-slate-900">{grupo.producto.nombre}</p>
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
                        {createTipo === 'RECIBIR' && (
                          <span className="ml-1 text-slate-400">desde {l.sector_origen_nombre}</span>
                        )}
                        {l.ubicacion_destino_nombre && (
                          <span className="ml-1 text-slate-400">→ {l.ubicacion_destino_nombre}</span>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="rounded-md bg-slate-50 px-2 py-1 text-sm font-semibold tabular-nums text-slate-900 ring-1 ring-surface-border">
                          {formatCantidad(l.cantidad_cajas)}
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
              <Button variant="ghost" size="sm" className="-ml-2 h-8 rounded-lg px-2" onClick={volverAlListado}>
                <ChevronLeft className="h-3.5 w-3.5" />
                Salir
              </Button>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-white px-2.5 py-1 font-medium text-slate-700 ring-1 ring-surface-border">
                  {fecha}
                </span>
                {createTipo === 'ENVIAR' ? badgeTipo('ENVIAR') : badgeTipo('RECIBIR')}
                {createTipo === 'ENVIAR' ? (
                  <>
                    <span className="rounded-full bg-white px-2.5 py-1 font-medium text-slate-700 ring-1 ring-surface-border">
                      {contextoNombre} → {destinoNombre}
                    </span>
                  </>
                ) : (
                  <span className="rounded-full bg-brand-50 px-2.5 py-1 font-medium text-brand-800 ring-1 ring-brand-100">
                    Hacia {contextoNombre}
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

          <div className="space-y-3 overflow-visible p-4 sm:p-5">
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
                          <span className="ml-auto shrink-0 text-xs text-slate-400">
                            {formatCantidad(p.stock_cajas)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button type="button" variant="secondary" size="sm" className="rounded-xl" onClick={() => setShowScanner(true)}>
                  <Camera className="h-4 w-4" />
                  Escanear
                </Button>
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
                    <p className="mt-1 truncate text-sm font-semibold text-slate-900">{selectedProduct.nombre}</p>
                    {stockDisponible !== null && (
                      <p className="text-xs text-slate-500">
                        Disponible: {formatCantidad(stockDisponible)} cajas
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-600"
                    onClick={() => {
                      setSelectedProduct(null)
                      setProductSearch('')
                      resetLineaForm()
                      productSearchRef.current?.focus()
                    }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                  {createTipo === 'RECIBIR' && origenesDisponibles.length > 0 && (
                    <div>
                      <label className="mb-0.5 block text-xs font-medium text-slate-600">Traer desde</label>
                      <select
                        ref={lineOrigenRef}
                        value={lineOrigenId}
                        onChange={(e) => setLineOrigenId(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            focusField(tipoBultoRef)
                          }
                        }}
                        className="w-full rounded-lg border border-surface-border px-2 py-1.5 text-sm"
                      >
                        {origenesDisponibles.map((o) => (
                          <option key={o.sector_id} value={o.sector_id}>
                            {o.sector_nombre} ({formatCantidad(o.stock_cajas)})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {sectorUsaUbicaciones(destinoSectorIdCreate()) && (
                    <div>
                      <label className="mb-0.5 block text-xs font-medium text-slate-600">Ubicación destino</label>
                      <select
                        ref={lineUbicacionDestinoRef}
                        value={lineUbicacionDestinoId}
                        onChange={(e) => setLineUbicacionDestinoId(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            focusField(tipoBultoRef)
                          }
                        }}
                        className="w-full rounded-lg border border-surface-border px-2 py-1.5 text-sm"
                      >
                        <option value="">Sin ubicación</option>
                        {ubicacionesDestino.map((u) => (
                          <option key={u.id} value={u.id}>{u.nombre}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="mb-0.5 block text-xs font-medium text-slate-600">Tipo</label>
                    <select
                      ref={tipoBultoRef}
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
                        focusField(unidadesPorBultoRef)
                      }
                    }}
                    placeholder={tipoBulto === 'PALLET' ? '2' : '1'}
                    className="[&_label]:text-xs"
                  />
                  <Input
                    ref={unidadesPorBultoRef}
                    label={
                      tipoBulto === 'PALLET'
                        ? '× cajas por pallet'
                        : '× botellas por caja'
                    }
                    type="number"
                    min="1"
                    value={unidadesPorBulto}
                    onChange={(e) => setUnidadesPorBulto(e.target.value)}
                    onKeyDown={handleLineaEnter}
                    placeholder={tipoBulto === 'PALLET' ? '112' : '6'}
                    className="[&_label]:text-xs"
                  />

                  <div className="flex items-end">
                    <Button type="button" size="sm" className="w-full rounded-xl" onClick={agregarLineaYContinuar}>
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

        <div
          ref={listScrollRef}
          className="relative z-0 min-h-0 flex-1 overflow-y-auto bg-white"
        >
          <div className="sticky top-0 z-[2] border-b border-surface-border bg-white/95 px-4 py-3 backdrop-blur-sm sm:px-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Líneas cargadas</p>
                <p className="text-xs text-slate-500">{lineas.length} línea(s)</p>
              </div>
              {lineas.length > 0 && (
                <span className="inline-flex items-center rounded-full bg-brand-50 px-3 py-1 text-sm font-bold tabular-nums text-brand-700 ring-1 ring-brand-100">
                  {formatCantidad(totalGeneral)} total
                </span>
              )}
            </div>
          </div>
          {lineasListContent}
        </div>

        <div className="shrink-0 border-t border-surface-border bg-white px-4 py-4 shadow-[0_-4px_12px_rgba(0,0,0,0.04)] sm:px-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total general</p>
              <p className="text-2xl font-bold tabular-nums text-brand-700">{formatCantidad(totalGeneral)}</p>
            </div>
            {hasPermiso('movimientos_internos.crear') && (
              <Button
                className="rounded-xl"
                onClick={() => void guardarMovimiento()}
                disabled={lineas.length === 0 || saving}
              >
                <Check className="h-4 w-4" />
                {saving ? 'Guardando...' : 'Crear movimiento pendiente'}
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
            Traslados de mercadería entre sectores con autorización de otro usuario.
          </p>
        </div>
        {hasPermiso('movimientos_internos.crear') && (
          <div className="flex flex-wrap gap-2">
            <Button className="rounded-xl px-4" onClick={() => iniciarCreacion('ENVIAR')}>
              <Send className="h-4 w-4" />
              Enviar
            </Button>
            <Button variant="secondary" className="rounded-xl px-4" onClick={() => iniciarCreacion('RECIBIR')}>
              <ArrowLeftRight className="h-4 w-4" />
              Recibir
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

            <div className="flex flex-wrap items-center gap-2">
              {(['PENDIENTE', 'COMPLETADO', 'CANCELADO'] as const).map((e) => (
                <Button
                  key={e}
                  type="button"
                  size="sm"
                  className="rounded-xl"
                  variant={filtroEstado === e ? 'primary' : 'secondary'}
                  onClick={() => setFiltroEstado(filtroEstado === e ? 'TODOS' : e)}
                >
                  {e.charAt(0) + e.slice(1).toLowerCase()}
                </Button>
              ))}
              <span className="hidden h-5 w-px bg-surface-border sm:block" aria-hidden />
              {(['ENVIAR', 'RECIBIR'] as const).map((t) => (
                <Button
                  key={t}
                  type="button"
                  size="sm"
                  className="rounded-xl"
                  variant={filtroTipo === t ? 'primary' : 'secondary'}
                  onClick={() => setFiltroTipo(filtroTipo === t ? 'TODOS' : t)}
                >
                  {t === 'ENVIAR' ? 'Enviar' : 'Recibir'}
                </Button>
              ))}
            </div>

            <p className="text-xs text-slate-500">
              Una sola fecha filtra ese día · las dos juntas = rango
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
              {diasConMovimientos.length > 0 ? formatDayTabLabel(selectedDay) : 'Registros'}
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
            <div className="border-b border-red-100 bg-red-50 px-6 py-3 text-sm text-red-700">{error}</div>
          )}
          {loadingList ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
              Cargando movimientos...
            </div>
          ) : movimientos.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <ArrowLeftRight className="h-7 w-7" />
              </div>
              <p className="mt-4 text-sm font-medium text-slate-700">
                {listSearch || listFechaDesde || listFechaHasta || filtroEstado !== 'TODOS' || filtroTipo !== 'TODOS'
                  ? 'No hay movimientos con esos filtros'
                  : 'No hay movimientos registrados'}
              </p>
              <p className="mt-1 max-w-sm text-xs text-slate-500">
                {listSearch || listFechaDesde || listFechaHasta || filtroEstado !== 'TODOS' || filtroTipo !== 'TODOS'
                  ? 'Probá ampliar el rango de fechas o cambiar los filtros'
                  : 'Creá el primer envío o recepción para mover stock entre sectores'}
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
              {movimientosDelDia.map((m) => (
                <li
                  key={m.id}
                  className="flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-slate-50/80 sm:flex-row sm:items-center sm:gap-4 sm:px-6"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold text-slate-900">Movimiento #{m.id}</p>
                      {badgeTipo(m.tipo)}
                      {badgeEstado(m.estado)}
                    </div>
                    <p className="mt-1 text-sm text-slate-700">
                      {m.sector_origen_nombre} → {m.sector_destino_nombre}
                    </p>
                    {m.observacion?.trim() ? (
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">{m.observacion}</p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span>{m.lineas_count} línea{m.lineas_count === 1 ? '' : 's'}</span>
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
  onChange
}: {
  sectorId: number
  value: number | null
  disabled?: boolean
  className?: string
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
      <option value="">Sin ubicación</option>
      {opciones.map((u) => (
        <option key={u.id} value={u.id}>{u.nombre}</option>
      ))}
    </select>
  )
}

function SectorOrigenSelect({
  productoId,
  excluirSectorId,
  value,
  disabled = false,
  className = '',
  onChange
}: {
  productoId: number
  excluirSectorId: number
  value: number
  disabled?: boolean
  className?: string
  onChange: (id: number) => void
}) {
  const [opciones, setOpciones] = useState<MovimientoInternoSectorStock[]>([])

  useEffect(() => {
    void api<MovimientoInternoSectorStock[]>(
      `/api/movimientos-internos/producto/${productoId}/sectores-stock?excluir_sector_id=${excluirSectorId}`
    )
      .then(setOpciones)
      .catch(() => setOpciones([]))
  }, [productoId, excluirSectorId])

  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      className={`rounded border border-surface-border px-2 py-1.5 text-sm disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-70 ${className}`}
    >
      {opciones.map((o) => (
        <option key={o.sector_id} value={o.sector_id}>
          {o.sector_nombre} ({formatCantidad(o.stock_cajas)})
        </option>
      ))}
    </select>
  )
}
