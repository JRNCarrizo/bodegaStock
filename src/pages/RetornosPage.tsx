import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Truck,
  Eye,
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
import { formatCantidad, formatDayTabLabel, formatTotalCajas, todayIsoDate } from '@/lib/desglose'
import { downloadApiFile } from '@/lib/downloadFile'
import { api, cn } from '@/lib/utils'
import type {
  Camionero,
  CamioneroVehiculo,
  Producto,
  RetornoDetalle,
  RetornoDetalleLinea,
  RetornoEstadoCondicion,
  RetornoLineaDraft,
  RetornoListItem,
  Sector
} from '@/types'
import { useAuth } from '@/context/AuthContext'
import { useEscHandler } from '@/hooks/useEscHandler'
import { useRegistroListKeyboard } from '@/hooks/useRegistroListKeyboard'

const ESTADOS_CONDICION: { value: RetornoEstadoCondicion; label: string }[] = [
  { value: 'BUEN_ESTADO', label: 'Buen estado' },
  { value: 'INCOMPLETA', label: 'Incompleta' },
  { value: 'MAL_ESTADO', label: 'Mal estado' }
]

function labelEstado(condicion: RetornoEstadoCondicion): string {
  return ESTADOS_CONDICION.find((e) => e.value === condicion)?.label ?? condicion
}

function badgeEstadoRetorno(
  estado: 'PENDIENTE' | 'VERIFICADO',
  size: 'sm' | 'md' = 'md',
  ingresoDirecto = false
) {
  const compact = size === 'sm'
  const base = cn(
    'inline-flex items-center justify-center gap-1.5 rounded-full font-semibold',
    compact ? 'min-w-[6.5rem] px-2 py-0.5 text-[10px]' : 'min-w-[7.25rem] px-3 py-1 text-xs'
  )
  if (estado === 'VERIFICADO') {
    return (
      <span className={cn(base, 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200')}>
        <Check className={compact ? 'h-3 w-3 shrink-0' : 'h-3.5 w-3.5 shrink-0'} />
        {ingresoDirecto ? (compact ? 'Directo' : 'Ingreso directo') : 'Verificado'}
      </span>
    )
  }
  return (
    <span className={cn(base, 'bg-amber-100 text-amber-950 ring-1 ring-amber-300')}>
      <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
      Sin verificar
    </span>
  )
}

function filaRetornoClass(estado: 'PENDIENTE' | 'VERIFICADO') {
  return estado === 'PENDIENTE'
    ? 'border-l-amber-400 bg-amber-50/50 hover:bg-amber-50'
    : 'border-l-emerald-400 bg-white hover:bg-slate-50/80'
}

function badgeCondicion(condicion: RetornoEstadoCondicion) {
  if (condicion === 'BUEN_ESTADO') {
    return (
      <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-800 ring-1 ring-green-100">
        {labelEstado(condicion)}
      </span>
    )
  }
  if (condicion === 'INCOMPLETA') {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-surface-border">
        {labelEstado(condicion)}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-800 ring-1 ring-red-100">
      {labelEstado(condicion)}
    </span>
  )
}

function labelCamionero(numero: string | null | undefined, nombre: string | null | undefined): string {
  if (!numero && !nombre) return 'Sin camionero'
  return `${numero ?? '—'} — ${nombre ?? '—'}`
}

function newTempId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function notifyRetornosPendientesChanged() {
  window.dispatchEvent(new Event('retornos-pendientes-changed'))
}

export function RetornosPage() {
  const { hasPermiso, user } = useAuth()
  const [view, setView] = useState<'list' | 'create' | 'detail' | 'verify'>('list')
  const [retornos, setRetornos] = useState<RetornoListItem[]>([])
  const [detalle, setDetalle] = useState<RetornoDetalle | null>(null)
  const [loadingList, setLoadingList] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [exportingId, setExportingId] = useState<number | null>(null)

  const [listSearch, setListSearch] = useState('')
  const [listFechaDesde, setListFechaDesde] = useState('')
  const [listFechaHasta, setListFechaHasta] = useState('')
  const [selectedDay, setSelectedDay] = useState(() => todayIsoDate())
  const [filtroEstado, setFiltroEstado] = useState<'TODOS' | 'PENDIENTE' | 'VERIFICADO'>('TODOS')

  const [createPhase, setCreatePhase] = useState<'datos' | 'carga'>('datos')
  const [fecha, setFecha] = useState(todayIsoDate())
  const [numeroPlanilla, setNumeroPlanilla] = useState('')
  const [observacion, setObservacion] = useState('')
  const [camioneroId, setCamioneroId] = useState('')
  const [vehiculoId, setVehiculoId] = useState('')
  const [sectorId, setSectorId] = useState('')
  const [camioneros, setCamioneros] = useState<Camionero[]>([])
  const [vehiculos, setVehiculos] = useState<CamioneroVehiculo[]>([])
  const [sectores, setSectores] = useState<Sector[]>([])

  const [productSearch, setProductSearch] = useState('')
  const [productResults, setProductResults] = useState<Producto[]>([])
  const [productHighlightIndex, setProductHighlightIndex] = useState(-1)
  const [selectedProduct, setSelectedProduct] = useState<Producto | null>(null)
  const [cantidadCajas, setCantidadCajas] = useState('')
  const [estadoCondicion, setEstadoCondicion] = useState<RetornoEstadoCondicion>('BUEN_ESTADO')
  const [lineSectorId, setLineSectorId] = useState('')
  const [lineas, setLineas] = useState<RetornoLineaDraft[]>([])
  const [expandedProductos, setExpandedProductos] = useState<Set<number>>(new Set())
  const [showScanner, setShowScanner] = useState(false)

  const [editLineaId, setEditLineaId] = useState<number | null>(null)
  const [editCantidad, setEditCantidad] = useState('')
  const [editEstado, setEditEstado] = useState<RetornoEstadoCondicion>('BUEN_ESTADO')
  const [editSector, setEditSector] = useState('')
  const [obsVerificacion, setObsVerificacion] = useState('')
  const [dobleVerificacion, setDobleVerificacion] = useState(true)

  const fechaRef = useRef<HTMLInputElement>(null)
  const planillaRef = useRef<HTMLInputElement>(null)
  const camioneroRef = useRef<HTMLSelectElement>(null)
  const vehiculoRef = useRef<HTMLSelectElement>(null)
  const sectorRef = useRef<HTMLSelectElement>(null)
  const observacionRef = useRef<HTMLInputElement>(null)
  const productSearchRef = useRef<HTMLInputElement>(null)
  const cantidadRef = useRef<HTMLInputElement>(null)
  const estadoRef = useRef<HTMLSelectElement>(null)
  const lineSectorRef = useRef<HTMLSelectElement>(null)
  const listSearchRef = useRef<HTMLInputElement>(null)
  const productResultsListRef = useRef<HTMLUListElement>(null)
  const listScrollRef = useRef<HTMLDivElement>(null)
  const cargaPanelRef = useRef<HTMLDivElement>(null)
  const productLineFormRef = useRef<HTMLDivElement>(null)

  const camioneroSeleccionado = camioneros.find((c) => c.id === Number(camioneroId))
  const sectorDefaultSeleccionado = sectores.find((s) => s.id === Number(sectorId))

  const lineasPorProducto = useMemo(() => {
    const map = new Map<number, { producto: RetornoLineaDraft; lineas: RetornoLineaDraft[] }>()
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
      total: g.lineas.reduce((s, l) => s + l.cantidad_cajas, 0)
    }))
  }, [lineas])

  const totalGeneral = useMemo(
    () => lineas.reduce((s, l) => s + l.cantidad_cajas, 0),
    [lineas]
  )

  useEffect(() => {
    void (async () => {
      try {
        const cfg = await api<{ doble_verificacion: boolean }>('/api/configuracion/retornos')
        setDobleVerificacion(cfg.doble_verificacion)
      } catch {
        setDobleVerificacion(true)
      }
    })()
  }, [])

  function scrollListToBottom() {
    requestAnimationFrame(() => {
      const el = listScrollRef.current
      if (el) el.scrollTop = el.scrollHeight
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
    if (createPhase === 'carga' && lineas.length > 0) scrollListToBottom()
  }, [lineas.length, createPhase])

  useEffect(() => {
    if (view === 'create' && createPhase === 'carga' && selectedProduct && productLineFormRef.current) {
      productLineFormRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [view, createPhase, selectedProduct])

  function focusField(ref: React.RefObject<HTMLElement | null>) {
    requestAnimationFrame(() => {
      ref.current?.focus()
      ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
  }

  const loadRetornos = useCallback(async () => {
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

      const data = await api<RetornoListItem[]>(`/api/retornos?${params}`)
      setRetornos(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar retornos')
    } finally {
      setLoadingList(false)
    }
  }, [listSearch, listFechaDesde, listFechaHasta])

  const retornosVisibles = useMemo(() => {
    if (filtroEstado === 'TODOS') return retornos
    return retornos.filter((r) => r.estado === filtroEstado)
  }, [retornos, filtroEstado])

  const pendientesPorDia = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of retornos) {
      if (r.estado === 'PENDIENTE') {
        map.set(r.fecha, (map.get(r.fecha) ?? 0) + 1)
      }
    }
    return map
  }, [retornos])

  useEffect(() => {
    if (listFechaDesde && !listFechaHasta) {
      setSelectedDay(listFechaDesde)
    } else if (listFechaHasta && !listFechaDesde) {
      setSelectedDay(listFechaHasta)
    } else if (listFechaDesde && listFechaHasta && listFechaDesde === listFechaHasta) {
      setSelectedDay(listFechaDesde)
    }
  }, [listFechaDesde, listFechaHasta])

  const diasConRetornos = useMemo(() => {
    const dias = new Set<string>()
    for (const r of retornosVisibles) dias.add(r.fecha)
    return [...dias].sort((a, b) => b.localeCompare(a))
  }, [retornosVisibles])

  const retornosDelDia = useMemo(
    () => retornosVisibles.filter((r) => r.fecha === selectedDay),
    [retornosVisibles, selectedDay]
  )

  const retornosDelDiaOrdenados = useMemo(
    () =>
      [...retornosDelDia].sort((a, b) => {
        if (a.estado !== b.estado) {
          return a.estado === 'PENDIENTE' ? -1 : 1
        }
        return b.id - a.id
      }),
    [retornosDelDia]
  )

  const conteoEstadoFiltros = useMemo(() => {
    const source =
      diasConRetornos.length > 0 ? retornos.filter((r) => r.fecha === selectedDay) : retornos
    let pendiente = 0
    let verificado = 0
    for (const r of source) {
      if (r.estado === 'PENDIENTE') pendiente += 1
      else verificado += 1
    }
    return { pendiente, verificado }
  }, [retornos, diasConRetornos.length, selectedDay])

  const totalCajasDelDia = useMemo(
    () => retornosDelDia.reduce((s, r) => s + r.total_cajas, 0),
    [retornosDelDia]
  )

  const conteoPorDia = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of retornosVisibles) {
      map.set(r.fecha, (map.get(r.fecha) ?? 0) + 1)
    }
    return map
  }, [retornosVisibles])

  useEffect(() => {
    if (loadingList || diasConRetornos.length === 0) return
    if (!diasConRetornos.includes(selectedDay)) {
      const today = todayIsoDate()
      setSelectedDay(diasConRetornos.includes(today) ? today : diasConRetornos[0])
    }
  }, [loadingList, diasConRetornos, selectedDay])

  useEffect(() => {
    if (view !== 'list') return
    const timer = setTimeout(() => listSearchRef.current?.focus(), 80)
    return () => clearTimeout(timer)
  }, [view])

  useEffect(() => {
    if (view !== 'list') return
    const timer = setTimeout(() => loadRetornos(), 300)
    return () => clearTimeout(timer)
  }, [view, loadRetornos])

  useEffect(() => {
    api<Camionero[]>('/api/camioneros?activo=1').then(setCamioneros).catch(() => {})
    api<Sector[]>('/api/sectores?activo=1').then(setSectores).catch(() => {})
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
        setProductResults(data)
      } catch {
        setProductResults([])
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [productSearch])

  function resetCreateForm() {
    setCreatePhase('datos')
    setFecha(todayIsoDate())
    setNumeroPlanilla('')
    setObservacion('')
    setCamioneroId('')
    setVehiculoId('')
    setSectorId('')
    setProductSearch('')
    setProductResults([])
    setSelectedProduct(null)
    setCantidadCajas('')
    setEstadoCondicion('BUEN_ESTADO')
    setLineSectorId('')
    setLineas([])
    setExpandedProductos(new Set())
    setShowScanner(false)
    setProductHighlightIndex(-1)
    setError('')
  }

  function volverAlListado() {
    resetCreateForm()
    setDetalle(null)
    setEditLineaId(null)
    setShowScanner(false)
    setView('list')
    setTimeout(() => listSearchRef.current?.focus({ preventScroll: true }), 80)
  }

  function resetLineaForm() {
    setCantidadCajas('')
    setEstadoCondicion('BUEN_ESTADO')
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

  function abrirNuevoRetorno() {
    void (async () => {
      try {
        const cfg = await api<{ doble_verificacion: boolean }>('/api/configuracion/retornos')
        setDobleVerificacion(cfg.doble_verificacion)
      } catch {
        /* keep previous */
      }
    })()
    resetCreateForm()
    setView('create')
    setTimeout(() => focusField(fechaRef), 50)
  }

  useEscHandler(view === 'detail' || view === 'verify', () => {
    if (saving) return false
    volverAlListado()
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
      setSelectedProduct(null)
      setProductSearch('')
      resetLineaForm()
      focusField(productSearchRef)
      return true
    }
    volverAlListado()
    return true
  })

  function handleDatosKeyDown(
    e: React.KeyboardEvent,
    next?: React.RefObject<HTMLInputElement | HTMLSelectElement | null>
  ) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (next?.current) {
      focusField(next)
    } else {
      avanzarACarga()
    }
  }

  function handleCamioneroKeyDown(e: React.KeyboardEvent<HTMLSelectElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (camioneroId && vehiculos.length > 0) {
      focusField(vehiculoRef)
    } else {
      focusField(sectorRef)
    }
  }

  function handleSectorKeyDown(e: React.KeyboardEvent<HTMLSelectElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    focusField(observacionRef)
  }

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

  function validarDatos(): boolean {
    if (!fecha) {
      setError('Completá la fecha')
      return false
    }
    setError('')
    return true
  }

  function sectorDefaultParaLinea(): string {
    return lineSectorId || sectorId || (sectores[0] ? String(sectores[0].id) : '')
  }

  function avanzarACarga() {
    if (!validarDatos()) return
    if (!lineSectorId && sectorId) setLineSectorId(sectorId)
    setCreatePhase('carga')
    setTimeout(() => focusField(productSearchRef), 50)
  }

  function selectProduct(p: Producto) {
    setSelectedProduct(p)
    setProductSearch(p.codigo_interno)
    setProductResults([])
    setProductHighlightIndex(-1)
    if (!lineSectorId) setLineSectorId(sectorDefaultParaLinea())
    resetLineaForm()
    setError('')
    setTimeout(() => focusField(cantidadRef), 50)
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
    const sectorLinea = lineSectorId || sectorDefaultParaLinea()
    if (!sectorLinea) {
      setError('Seleccioná el sector destino de la línea')
      return
    }
    const sector = sectores.find((s) => s.id === Number(sectorLinea))
    if (!sector) {
      setError('Sector destino no válido')
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
        cantidad_cajas: qty,
        estado_condicion: estadoCondicion
      }
    ])
    setSelectedProduct(null)
    setProductSearch('')
    resetLineaForm()
    setError('')
    setTimeout(() => focusField(productSearchRef), 50)
  }

  async function confirmarRetorno() {
    if (!validarDatos()) return
    if (lineas.length === 0) {
      setError('Agregá al menos una línea de producto')
      return
    }
    setSaving(true)
    setError('')
    try {
      const result = await api<{ id: number; ingreso_directo?: boolean }>('/api/retornos', {
        method: 'POST',
        body: JSON.stringify({
          fecha,
          numero_planilla: numeroPlanilla.trim() || null,
          observacion: observacion.trim() || null,
          camionero_id: camioneroId ? Number(camioneroId) : null,
          vehiculo_id: camioneroId && vehiculoId ? Number(vehiculoId) : null,
          sector_id: sectorId ? Number(sectorId) : null,
          lineas: lineas.map((l) => ({
            producto_id: l.producto_id,
            cantidad_cajas: l.cantidad_cajas,
            estado_condicion: l.estado_condicion,
            sector_id: l.sector_id
          }))
        })
      })
      await loadRetornos()
      notifyRetornosPendientesChanged()
      await abrirRetorno(result.id)
      resetCreateForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar retorno')
    } finally {
      setSaving(false)
    }
  }

  async function abrirRetorno(id: number) {
    setError('')
    try {
      const data = await api<RetornoDetalle>(`/api/retornos/${id}`)
      setDetalle(data)
      setObsVerificacion(data.retorno.observacion_verificacion ?? '')
      if (
        data.retorno.estado === 'PENDIENTE' &&
        hasPermiso('retornos.verificar') &&
        user?.id !== data.retorno.cargado_por_id
      ) {
        setView('verify')
      } else {
        setView('detail')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar retorno')
    }
  }

  async function exportarRetorno(id: number) {
    setExportingId(id)
    setError('')
    try {
      await downloadApiFile(`/api/retornos/${id}/export`, `retorno-${id}.xlsx`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al exportar')
    } finally {
      setExportingId(null)
    }
  }

  const registroListKb = useRegistroListKeyboard({
    enabled: view === 'list',
    items: retornosDelDiaOrdenados,
    listSearchRef,
    canCreate: hasPermiso('retornos.crear'),
    onCreate: abrirNuevoRetorno,
    onOpenDetail: (r) => {
      void abrirRetorno(r.id)
    }
  })

  async function recargarDetalle() {
    if (!detalle) return
    const data = await api<RetornoDetalle>(`/api/retornos/${detalle.retorno.id}`)
    setDetalle(data)
  }

  async function confirmarLinea(linea: RetornoDetalleLinea) {
    if (!detalle) return
    const cantidad = editLineaId === linea.id ? Number(editCantidad) : linea.cantidad_efectiva
    const estado = editLineaId === linea.id ? editEstado : linea.estado_efectivo
    const sectorLinea =
      editLineaId === linea.id ? Number(editSector) : linea.sector_id
    if (!cantidad || cantidad <= 0) {
      setError('Cantidad inválida')
      return
    }
    if (!sectorLinea) {
      setError('Sector destino requerido')
      return
    }
    setSaving(true)
    setError('')
    try {
      await api(`/api/retornos/${detalle.retorno.id}/lineas/${linea.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          cantidad_cajas: cantidad,
          estado_condicion: estado,
          sector_id: sectorLinea,
          verificada: true
        })
      })
      setEditLineaId(null)
      await recargarDetalle()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al confirmar línea')
    } finally {
      setSaving(false)
    }
  }

  async function completarVerificacion() {
    if (!detalle) return
    setSaving(true)
    setError('')
    try {
      await api(`/api/retornos/${detalle.retorno.id}/verificar`, {
        method: 'POST',
        body: JSON.stringify({ observacion: obsVerificacion.trim() || null })
      })
      await loadRetornos()
      notifyRetornosPendientesChanged()
      await abrirRetorno(detalle.retorno.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al completar verificación')
    } finally {
      setSaving(false)
    }
  }

  const puedeVerificar = useMemo(() => {
    if (!detalle || !user) return false
    return (
      detalle.retorno.estado === 'PENDIENTE' &&
      hasPermiso('retornos.verificar') &&
      detalle.retorno.cargado_por_id !== user.id
    )
  }, [detalle, user, hasPermiso])

  const todasLineasVerificadas = detalle
    ? detalle.lineas.length > 0 && detalle.lineas.every((l) => l.linea_verificada)
    : false

  function renderLineasVerificacion() {
    if (!detalle) return null
    return (
      <div className="space-y-3">
        {detalle.lineas.map((linea) => {
          const editando = editLineaId === linea.id
          return (
            <div
              key={linea.id}
              className={cn(
                'rounded-xl border px-4 py-3.5 sm:px-5',
                linea.linea_verificada
                  ? 'border-l-4 border-l-emerald-400 border-emerald-200 bg-emerald-50/40'
                  : 'border-l-4 border-l-amber-400 border-amber-200 bg-amber-50/50'
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">
                    {linea.codigo_interno}
                  </span>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{linea.nombre}</p>
                  <p className="mt-1.5 text-sm text-slate-600">
                    Declarado: {formatTotalCajas(linea.cantidad_cajas)} · {labelEstado(linea.estado_condicion)} ·{' '}
                    {linea.sector_nombre}
                  </p>
                  {linea.linea_verificada && (
                    <p className="mt-1 text-sm font-medium text-green-800">
                      Verificado: {formatTotalCajas(linea.cantidad_efectiva)} ·{' '}
                      {labelEstado(linea.estado_efectivo)} · {linea.sector_nombre}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {linea.linea_verificada ? (
                    <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-800 ring-1 ring-green-100">
                      Confirmada
                    </span>
                  ) : (
                    <>
                      {!editando && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="rounded-lg"
                          onClick={() => {
                            setEditLineaId(linea.id)
                            setEditCantidad(String(linea.cantidad_efectiva))
                            setEditEstado(linea.estado_efectivo)
                            setEditSector(String(linea.sector_id))
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                          Corregir
                        </Button>
                      )}
                      {!editando && (
                        <Button
                          type="button"
                          size="sm"
                          className="rounded-xl"
                          disabled={saving}
                          onClick={() => void confirmarLinea(linea)}
                        >
                          <Check className="h-4 w-4" />
                          Confirmar línea
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
              {editando && (
                <div className="mt-3 grid gap-3 border-t border-surface-border pt-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Input
                    label="Cantidad (cajas)"
                    type="number"
                    min="1"
                    value={editCantidad}
                    onChange={(e) => setEditCantidad(e.target.value)}
                  />
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Estado</label>
                    <select
                      value={editEstado}
                      onChange={(e) => setEditEstado(e.target.value as RetornoEstadoCondicion)}
                      className="w-full rounded-xl border border-surface-border px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                    >
                      {ESTADOS_CONDICION.map((e) => (
                        <option key={e.value} value={e.value}>
                          {e.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Sector destino</label>
                    <select
                      value={editSector}
                      onChange={(e) => setEditSector(e.target.value)}
                      className="w-full rounded-xl border border-surface-border px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                    >
                      {sectores.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-1">
                    <Button
                      type="button"
                      size="sm"
                      className="rounded-xl"
                      disabled={saving}
                      onClick={() => void confirmarLinea(linea)}
                    >
                      Confirmar
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="rounded-xl"
                      onClick={() => setEditLineaId(null)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  if (view === 'verify' && detalle) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 lg:px-0">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 h-9 rounded-xl px-3"
          onClick={volverAlListado}
        >
          <ChevronLeft className="h-4 w-4" />
          Volver
        </Button>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Verificación</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Verificar retorno</h1>
          <p className="mt-1 text-sm text-slate-500">
            Confirmá línea por línea — solo &quot;Buen estado&quot; suma al stock · Esc vuelve al listado
          </p>
        </div>
        {error && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-100">
            {error}
          </div>
        )}
        <Card className="overflow-hidden shadow-panel">
          <div className="border-b border-brand-100 bg-gradient-to-r from-brand-50/80 via-white to-white px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              {badgeEstadoRetorno(detalle.retorno.estado, 'md', !!detalle.retorno.ingreso_directo)}
            </div>
          </div>
          <CardBody className="space-y-2 text-sm">
            <p>
              <span className="text-slate-500">Camionero:</span>{' '}
              <strong>{labelCamionero(detalle.retorno.camionero_numero, detalle.retorno.camionero_nombre)}</strong>
            </p>
            {detalle.retorno.numero_planilla && (
              <p>
                <span className="text-slate-500">Planilla:</span>{' '}
                <strong>{detalle.retorno.numero_planilla}</strong>
              </p>
            )}
            <p>
              <span className="text-slate-500">Cargado por:</span>{' '}
              <strong>{detalle.retorno.cargado_por_nombre}</strong>
            </p>
          </CardBody>
        </Card>
        <Card className="overflow-hidden shadow-panel">
          <div className="border-b border-surface-border bg-slate-50/80 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-slate-900">Líneas a verificar</h2>
            <p className="text-xs text-slate-500">
              {detalle.lineas_verificadas} de {detalle.lineas.length} confirmadas
            </p>
          </div>
          <CardBody>{renderLineasVerificacion()}</CardBody>
        </Card>
        {puedeVerificar && (
          <Card className="shadow-panel">
            <CardBody className="space-y-4">
              <Input
                label="Observación de verificación"
                value={obsVerificacion}
                onChange={(e) => setObsVerificacion(e.target.value)}
                placeholder="Opcional"
              />
              <Button
                className="rounded-xl"
                disabled={saving || !todasLineasVerificadas}
                onClick={() => void completarVerificacion()}
              >
                {saving ? 'Procesando...' : 'Completar verificación y sumar stock'}
              </Button>
              {!todasLineasVerificadas && (
                <p className="text-xs text-slate-500">Confirmá todas las líneas para continuar.</p>
              )}
            </CardBody>
          </Card>
        )}
      </div>
    )
  }

  if (view === 'detail' && detalle) {
    const r = detalle.retorno
    const vehiculoTexto =
      r.vehiculo_marca || r.vehiculo_modelo
        ? [r.vehiculo_marca, r.vehiculo_modelo].filter(Boolean).join(' ')
        : null

    return (
      <RegistroDetallePanel
        onVolver={volverAlListado}
        titulo={`Retorno #${r.id}`}
        fecha={r.fecha}
        totalEtiqueta="Total"
        total={detalle.total_cajas}
        encabezadoExtra={badgeEstadoRetorno(r.estado, 'md', !!r.ingreso_directo)}
        meta={
          <>
            {(r.camionero_numero || r.camionero_nombre) && (
              <RegistroDetalleMetaChip icon={<Truck className="h-3.5 w-3.5 shrink-0 text-slate-400" />}>
                {labelCamionero(r.camionero_numero, r.camionero_nombre)}
              </RegistroDetalleMetaChip>
            )}
            {vehiculoTexto && (
              <RegistroDetalleMetaChip>
                <span className="font-medium text-slate-500">Vehículo </span>
                {vehiculoTexto}
                {r.vehiculo_patente && (
                  <span className="text-slate-400"> ({r.vehiculo_patente})</span>
                )}
              </RegistroDetalleMetaChip>
            )}
            {r.numero_planilla && (
              <RegistroDetalleMetaChip>
                <span className="font-medium text-slate-500">Planilla </span>
                {r.numero_planilla}
              </RegistroDetalleMetaChip>
            )}
            <RegistroDetalleMetaChip icon={<User className="h-3.5 w-3.5 shrink-0 text-slate-400" />}>
              {r.cargado_por_nombre}
            </RegistroDetalleMetaChip>
            {r.verificado_por_nombre && (
              <RegistroDetalleMetaChip>
                <span className="font-medium text-slate-500">
                  {r.ingreso_directo ? 'Ingresado ' : 'Verificado '}
                </span>
                {r.verificado_por_nombre}
              </RegistroDetalleMetaChip>
            )}
            {r.observacion && <RegistroDetalleObsChip>{r.observacion}</RegistroDetalleObsChip>}
            {r.ingreso_directo && r.observacion_verificacion && (
              <RegistroDetalleObsChip>{r.observacion_verificacion}</RegistroDetalleObsChip>
            )}
          </>
        }
        antesProductos={
          <>
            {error && (
              <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
            )}
            {r.estado === 'PENDIENTE' && (
              <div
                className={`rounded-lg border px-4 py-3 text-sm ${
                  puedeVerificar
                    ? 'border-amber-200 bg-amber-50 text-amber-950'
                    : 'border-slate-200 bg-slate-50 text-slate-700'
                }`}
              >
                {user?.id === r.cargado_por_id ? (
                  <>
                    <p className="font-medium">Pendiente de verificación</p>
                    <p className="mt-1 text-slate-600">
                      Lo cargaste con tu usuario ({r.cargado_por_nombre}). Por control interno, la
                      verificación la debe hacer <strong>otro usuario</strong> con permiso de verificar
                      retornos.
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      Creá un usuario con rol <strong>Supervisor</strong> o{' '}
                      <strong>Administrador</strong> en Administración → Usuarios, cerrá sesión e ingresá
                      con ese usuario para confirmar las líneas.
                    </p>
                  </>
                ) : !hasPermiso('retornos.verificar') ? (
                  <>
                    <p className="font-medium">Pendiente de verificación</p>
                    <p className="mt-1 text-slate-600">
                      Este retorno aún no suma stock. Tu usuario no tiene permiso para verificar retornos.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-medium">Pendiente de verificación</p>
                    <p className="mt-1 text-slate-600">
                      Confirmá cada línea (podés corregir cantidad, estado o sector) y luego completá la
                      verificación para sumar al stock solo lo que esté en buen estado.
                    </p>
                  </>
                )}
              </div>
            )}
          </>
        }
        lineas={detalle.lineas.map((l) => ({
          id: l.id,
          producto_id: l.producto_id,
          codigo_interno: l.codigo_interno,
          nombre: l.nombre,
          etiqueta: l.etiqueta,
          cantidad: l.cantidad_efectiva,
          extra: badgeCondicion(l.estado_efectivo),
          extraKey: l.estado_efectivo
        }))}
        despuesProductos={
          puedeVerificar ? (
            <Card className="overflow-hidden shadow-panel">
              <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-slate-900">Listo para verificar</p>
                  <p className="text-sm text-slate-600">
                    {detalle.lineas_verificadas} de {detalle.lineas.length} líneas confirmadas en sesiones
                    anteriores
                  </p>
                </div>
                <Button className="rounded-xl" onClick={() => setView('verify')}>
                  Iniciar verificación
                </Button>
              </CardBody>
            </Card>
          ) : undefined
        }
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
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Nuevo retorno</h1>
            <p className="mt-1 text-sm text-slate-500">
              Mercadería que vuelve a bodega — Enter avanza · Esc vuelve al listado
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
                  <RotateCcw className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Datos del retorno</p>
                  <p className="text-xs text-slate-500">Fecha, planilla, camionero y sector default</p>
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
                onKeyDown={(e) => handleDatosKeyDown(e, planillaRef)}
              />
              <Input
                ref={planillaRef}
                label="Número de planilla"
                value={numeroPlanilla}
                onChange={(e) => setNumeroPlanilla(e.target.value)}
                onKeyDown={(e) => handleDatosKeyDown(e, camioneroRef)}
                placeholder="Opcional"
              />
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Camionero</label>
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
                  <option value="">Opcional</option>
                  {camioneros.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.numero_interno} — {c.nombre}
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
                  onKeyDown={(e) => handleDatosKeyDown(e, sectorRef)}
                  disabled={!camioneroId}
                  className="w-full rounded-xl border border-surface-border px-3 py-2.5 text-sm shadow-sm disabled:bg-slate-50 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                >
                  <option value="">Opcional</option>
                  {vehiculos.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.patente} — {v.marca} {v.modelo}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Sector default (opcional)
                </label>
                <select
                  ref={sectorRef}
                  value={sectorId}
                  onChange={(e) => {
                    setSectorId(e.target.value)
                    if (e.target.value) setLineSectorId(e.target.value)
                  }}
                  onKeyDown={handleSectorKeyDown}
                  className="w-full rounded-xl border border-surface-border px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                >
                  <option value="">Sin default — elegís por línea</option>
                  {sectores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <Input
                ref={observacionRef}
                label="Observación"
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                onKeyDown={(e) => handleDatosKeyDown(e)}
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
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <RotateCcw className="h-6 w-6" />
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
                  {formatTotalCajas(grupo.total)}
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
                        {formatTotalCajas(l.cantidad_cajas)} · {labelEstado(l.estado_condicion)} ·{' '}
                        {l.sector_nombre}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {badgeCondicion(l.estado_condicion)}
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
                onClick={volverAlListado}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Salir
              </Button>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-white px-2.5 py-1 font-medium text-slate-700 ring-1 ring-surface-border">
                  {fecha}
                </span>
                {numeroPlanilla.trim() && (
                  <span className="rounded-full bg-white px-2.5 py-1 font-medium text-slate-700 ring-1 ring-surface-border">
                    Planilla {numeroPlanilla.trim()}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 font-medium text-brand-800 ring-1 ring-brand-100">
                  <Truck className="h-3 w-3" />
                  {labelCamionero(camioneroSeleccionado?.numero_interno, camioneroSeleccionado?.nombre)}
                </span>
                {sectorDefaultSeleccionado && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 font-medium text-slate-700 ring-1 ring-surface-border">
                    <Warehouse className="h-3 w-3" />
                    {sectorDefaultSeleccionado.nombre}
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
                      resetLineaForm()
                      productSearchRef.current?.focus()
                    }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
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
                        focusField(estadoRef)
                      }
                    }}
                    className="[&_label]:text-xs"
                  />
                  <div>
                    <label className="mb-0.5 block text-xs font-medium text-slate-600">Estado</label>
                    <select
                      ref={estadoRef}
                      value={estadoCondicion}
                      onChange={(e) => setEstadoCondicion(e.target.value as RetornoEstadoCondicion)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          focusField(lineSectorRef)
                        }
                      }}
                      className="w-full rounded-lg border border-surface-border px-2 py-1.5 text-sm"
                    >
                      {ESTADOS_CONDICION.map((e) => (
                        <option key={e.value} value={e.value}>
                          {e.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-0.5 block text-xs font-medium text-slate-600">Sector destino</label>
                    <select
                      ref={lineSectorRef}
                      value={lineSectorId || sectorDefaultParaLinea()}
                      onChange={(e) => setLineSectorId(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          agregarLineaYContinuar()
                        }
                      }}
                      className="w-full rounded-lg border border-surface-border px-2 py-1.5 text-sm"
                    >
                      {sectores.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2 flex items-end sm:col-span-1">
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
                  Enter en el último campo agrega la línea y vuelve al buscador. Solo mercadería en{' '}
                  <span className="font-medium text-slate-600">buen estado</span>{' '}
                  {dobleVerificacion
                    ? 'suma stock al verificar.'
                    : 'suma stock al confirmar el retorno.'}
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
                {formatTotalCajas(totalGeneral)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {lineas.length} línea{lineas.length === 1 ? '' : 's'} cargada
                {lineas.length === 1 ? '' : 's'}
              </p>
            </div>
            {hasPermiso('retornos.crear') && (
              <Button
                className="rounded-xl"
                onClick={() => void confirmarRetorno()}
                disabled={lineas.length === 0 || saving}
              >
                <Check className="h-4 w-4" />
                {saving
                  ? 'Registrando...'
                  : dobleVerificacion
                    ? 'Confirmar retorno'
                    : 'Confirmar y sumar stock'}
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
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Movimientos
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Retornos
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-500">
            {dobleVerificacion
              ? 'Mercadería que vuelve a bodega — sin verificar hasta segunda revisión por otro usuario.'
              : 'Mercadería que vuelve a bodega — ingreso directo: al confirmar ya suma stock (control en hoja).'}
          </p>
        </div>
        {hasPermiso('retornos.crear') && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="hidden rounded-full border border-surface-border bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 shadow-card sm:inline-flex">
              Enter = nuevo retorno
            </span>
            <Button className="rounded-xl px-4" onClick={abrirNuevoRetorno}>
              <Plus className="h-4 w-4" />
              Nuevo retorno
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
                  placeholder="Buscar por camionero o planilla..."
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
              {hasPermiso('retornos.crear') && ' · Enter = nuevo retorno'}
            </p>

            <DayTabsRow
              days={diasConRetornos}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
              getCount={(dia) => conteoPorDia.get(dia) ?? 0}
              getPendingCount={(dia) => pendientesPorDia.get(dia) ?? 0}
              hidePendingDotOnDay={todayIsoDate()}
            />

            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['TODOS', 'Todos', conteoEstadoFiltros.pendiente + conteoEstadoFiltros.verificado],
                  ['PENDIENTE', 'Sin verificar', conteoEstadoFiltros.pendiente],
                  ['VERIFICADO', 'Verificados', conteoEstadoFiltros.verificado]
                ] as const
              ).map(([e, label, count]) => (
                <Button
                  key={e}
                  type="button"
                  size="sm"
                  className={cn(
                    'rounded-xl',
                    e === 'PENDIENTE' &&
                      filtroEstado !== 'PENDIENTE' &&
                      count > 0 &&
                      'ring-1 ring-amber-300'
                  )}
                  variant={filtroEstado === e ? 'primary' : 'secondary'}
                  onClick={() => setFiltroEstado(e)}
                >
                  {label}
                  {count > 0 && (
                    <span
                      className={cn(
                        'ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
                        filtroEstado === e
                          ? 'bg-white/20 text-white'
                          : e === 'PENDIENTE'
                            ? 'bg-amber-100 text-amber-900'
                            : e === 'VERIFICADO'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-200 text-slate-700'
                      )}
                    >
                      {count}
                    </span>
                  )}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-surface-border bg-slate-50/80 px-5 py-3.5 sm:px-6">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              {diasConRetornos.length > 0 ? formatDayTabLabel(selectedDay) : 'Registros'}
            </h2>
            <p className="text-xs text-slate-500">
              {diasConRetornos.length > 0
                ? `${retornosDelDia.length} retorno(s) · ${formatCantidad(totalCajasDelDia)} cajas en el día`
                : `${retornosVisibles.length} retorno(s)`}
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
              Cargando retornos...
            </div>
          ) : retornosVisibles.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <RotateCcw className="h-7 w-7" />
              </div>
              <p className="mt-4 text-sm font-medium text-slate-700">
                {listSearch || listFechaDesde || listFechaHasta || filtroEstado !== 'TODOS'
                  ? 'No hay retornos con esos filtros'
                  : 'No hay retornos registrados'}
              </p>
              <p className="mt-1 max-w-sm text-xs text-slate-500">
                {listSearch || listFechaDesde || listFechaHasta || filtroEstado !== 'TODOS'
                  ? 'Probá ampliar el rango de fechas o cambiar la búsqueda'
                  : 'Registrá el primer retorno de mercadería que vuelve a bodega'}
              </p>
              {!(listSearch || listFechaDesde || listFechaHasta || filtroEstado !== 'TODOS') &&
                hasPermiso('retornos.crear') && (
                  <Button className="mt-4 rounded-xl" size="sm" onClick={abrirNuevoRetorno}>
                    <Plus className="h-4 w-4" />
                    Nuevo retorno
                  </Button>
                )}
            </div>
          ) : retornosDelDia.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <RotateCcw className="h-7 w-7" />
              </div>
              <p className="mt-4 text-sm font-medium text-slate-700">Sin resultados para este día</p>
              <p className="mt-1 text-xs text-slate-500">Probá otra fecha o ajustá la búsqueda</p>
            </div>
          ) : (
            <ul className="divide-y divide-surface-border/80">
              {retornosDelDiaOrdenados.map((r, index) => {
                const esPendiente = r.estado === 'PENDIENTE'
                return (
                <li
                  key={r.id}
                  {...registroListKb.listItemProps(
                    index,
                    cn(
                      'flex flex-col gap-3 border-l-4 px-4 py-4 transition-colors sm:flex-row sm:items-center sm:gap-4 sm:px-6',
                      filaRetornoClass(r.estado)
                    )
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p
                        className={cn(
                          'w-[12ch] shrink-0 truncate text-base font-semibold tabular-nums',
                          esPendiente ? 'text-amber-950' : 'text-slate-900'
                        )}
                        title={r.numero_planilla ?? `Retorno #${r.id}`}
                      >
                        {r.numero_planilla ?? `Retorno #${r.id}`}
                      </p>
                      {badgeEstadoRetorno(r.estado, 'md', !!r.ingreso_directo)}
                    </div>
                    {r.observacion?.trim() ? (
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">{r.observacion}</p>
                    ) : (
                      <p className="mt-1 text-xs text-slate-500">
                        {r.camionero_nombre
                          ? `${r.camionero_numero ?? ''} — ${r.camionero_nombre}`.trim()
                          : 'Sin camionero asignado'}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span>{r.lineas_count} línea{r.lineas_count === 1 ? '' : 's'}</span>
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {r.usuario_nombre}
                      </span>
                      {r.verificado_por_nombre && (
                        <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                          <Check className="h-3 w-3" />
                          {r.verificado_por_nombre}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2 sm:justify-end">
                    <span
                      className={cn(
                        'inline-flex min-w-[3rem] items-center justify-center rounded-lg px-2.5 py-1.5 text-sm font-bold tabular-nums ring-1',
                        esPendiente
                          ? 'bg-amber-100 text-amber-900 ring-amber-200'
                          : 'bg-brand-50 text-brand-700 ring-brand-100'
                      )}
                    >
                      {formatCantidad(r.total_cajas)}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="rounded-lg"
                      disabled={exportingId === r.id}
                      onClick={() => void exportarRetorno(r.id)}
                      title="Exportar Excel del registro"
                    >
                      {exportingId === r.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                      Exportar
                    </Button>
                    <Button
                      variant={esPendiente ? 'primary' : 'secondary'}
                      size="sm"
                      className="rounded-lg"
                      onClick={() => void abrirRetorno(r.id)}
                    >
                      {esPendiente && hasPermiso('retornos.verificar') ? (
                        <>
                          <Check className="h-4 w-4" />
                          Verificar
                        </>
                      ) : (
                        <>
                          <Eye className="h-4 w-4" />
                          Ver
                        </>
                      )}
                    </Button>
                  </div>
                </li>
              )})}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
