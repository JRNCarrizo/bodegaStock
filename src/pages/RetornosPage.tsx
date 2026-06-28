import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Truck,
  Eye,
  X
} from 'lucide-react'
import { BarcodeScannerModal } from '@/components/BarcodeScannerModal'
import { DayTabsRow } from '@/components/DayTabsRow'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge, Card, CardBody, CardHeader } from '@/components/ui/Card'
import { ProductImage } from '@/components/ProductImage'
import { formatCantidad, formatDayTabLabel, formatTotalCajas, todayIsoDate } from '@/lib/desglose'
import { api } from '@/lib/utils'
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

const ESTADOS_CONDICION: { value: RetornoEstadoCondicion; label: string }[] = [
  { value: 'BUEN_ESTADO', label: 'Buen estado' },
  { value: 'INCOMPLETA', label: 'Incompleta' },
  { value: 'MAL_ESTADO', label: 'Mal estado' }
]

function labelEstado(condicion: RetornoEstadoCondicion): string {
  return ESTADOS_CONDICION.find((e) => e.value === condicion)?.label ?? condicion
}

function badgeEstadoRetorno(estado: 'PENDIENTE' | 'VERIFICADO') {
  if (estado === 'VERIFICADO') {
    return <Badge variant="success">Verificado</Badge>
  }
  return <Badge variant="warning">Sin verificar</Badge>
}

function badgeCondicion(condicion: RetornoEstadoCondicion) {
  if (condicion === 'BUEN_ESTADO') return <Badge variant="success">{labelEstado(condicion)}</Badge>
  if (condicion === 'INCOMPLETA') return <Badge variant="default">{labelEstado(condicion)}</Badge>
  return <Badge variant="muted">{labelEstado(condicion)}</Badge>
}

function labelCamionero(numero: string | null | undefined, nombre: string | null | undefined): string {
  if (!numero && !nombre) return 'Sin camionero'
  return `${numero ?? '—'} — ${nombre ?? '—'}`
}

function resumenSectoresLineas(lineas: { sector_nombre: string }[], fallback?: string | null): string {
  const names = [...new Set(lineas.map((l) => l.sector_nombre).filter(Boolean))]
  if (names.length === 0) return fallback ?? '—'
  if (names.length === 1) return names[0]
  return 'Varios sectores'
}

function newTempId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function RetornosPage() {
  const { hasPermiso, user } = useAuth()
  const [view, setView] = useState<'list' | 'create' | 'detail' | 'verify'>('list')
  const [retornos, setRetornos] = useState<RetornoListItem[]>([])
  const [detalle, setDetalle] = useState<RetornoDetalle | null>(null)
  const [loadingList, setLoadingList] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

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
      if (filtroEstado !== 'TODOS') params.set('estado', filtroEstado)

      const data = await api<RetornoListItem[]>(`/api/retornos?${params}`)
      setRetornos(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar retornos')
    } finally {
      setLoadingList(false)
    }
  }, [listSearch, listFechaDesde, listFechaHasta, filtroEstado])

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
    for (const r of retornos) dias.add(r.fecha)
    return [...dias].sort((a, b) => b.localeCompare(a))
  }, [retornos])

  const retornosDelDia = useMemo(
    () => retornos.filter((r) => r.fecha === selectedDay),
    [retornos, selectedDay]
  )

  const totalCajasDelDia = useMemo(
    () => retornosDelDia.reduce((s, r) => s + r.total_cajas, 0),
    [retornosDelDia]
  )

  const conteoPorDia = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of retornos) {
      map.set(r.fecha, (map.get(r.fecha) ?? 0) + 1)
    }
    return map
  }, [retornos])

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
    resetCreateForm()
    setView('create')
    setTimeout(() => focusField(fechaRef), 50)
  }

  function shouldAbrirFormularioConEnter(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return true
    if (target.closest('button, a, textarea, [contenteditable="true"]')) return false
    if (target instanceof HTMLInputElement && target.type === 'date') return false
    if (target instanceof HTMLSelectElement) return false
    return true
  }

  function handleListSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' || !hasPermiso('retornos.crear')) return
    e.preventDefault()
    abrirNuevoRetorno()
  }

  useEffect(() => {
    if (view !== 'list' || !hasPermiso('retornos.crear')) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat) return
      if (!shouldAbrirFormularioConEnter(e.target)) return
      e.preventDefault()
      abrirNuevoRetorno()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [view, hasPermiso])

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
    setExpandedProductos((prev) => new Set(prev).add(selectedProduct.id))
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
      const result = await api<{ id: number }>('/api/retornos', {
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
              className={`rounded-lg border px-4 py-3 ${
                linea.linea_verificada
                  ? 'border-green-200 bg-green-50/50'
                  : 'border-surface-border bg-white'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-sm font-semibold text-slate-900">{linea.codigo_interno}</p>
                  <p className="text-sm text-slate-700">{linea.nombre}</p>
                  <p className="mt-1 text-sm text-slate-600">
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
                <div className="flex items-center gap-2">
                  {linea.linea_verificada ? (
                    <Badge variant="success">Confirmada</Badge>
                  ) : (
                    <>
                      {!editando && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
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
                      className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm"
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
                      className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm"
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
                      disabled={saving}
                      onClick={() => void confirmarLinea(linea)}
                    >
                      Guardar y confirmar
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={() => setEditLineaId(null)}>
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
      <div className="mx-auto max-w-4xl space-y-6">
        <Button variant="ghost" size="sm" onClick={volverAlListado}>
          <ChevronLeft className="h-4 w-4" />
          Volver
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Verificar retorno</h1>
          <p className="mt-1 text-slate-500">
            Confirmá línea por línea — solo &quot;Buen estado&quot; suma al stock · Esc vuelve al listado
          </p>
        </div>
        {error && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}
        <Card>
          <CardBody className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-2">
              {badgeEstadoRetorno(detalle.retorno.estado)}
              <Badge variant="default">
                {resumenSectoresLineas(detalle.lineas, detalle.retorno.sector_nombre)}
              </Badge>
            </div>
            <p>
              <span className="text-slate-500">Camionero:</span>{' '}
              {labelCamionero(detalle.retorno.camionero_numero, detalle.retorno.camionero_nombre)}
            </p>
            {detalle.retorno.numero_planilla && (
              <p>
                <span className="text-slate-500">Planilla:</span> {detalle.retorno.numero_planilla}
              </p>
            )}
            <p>
              <span className="text-slate-500">Cargado por:</span> {detalle.retorno.cargado_por_nombre}
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title="Líneas a verificar"
            description={`${detalle.lineas_verificadas} de ${detalle.lineas.length} confirmadas`}
          />
          <CardBody>{renderLineasVerificacion()}</CardBody>
        </Card>
        {puedeVerificar && (
          <Card>
            <CardBody className="space-y-4">
              <Input
                label="Observación de verificación"
                value={obsVerificacion}
                onChange={(e) => setObsVerificacion(e.target.value)}
                placeholder="Opcional"
              />
              <Button
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
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <Button variant="ghost" size="sm" onClick={volverAlListado}>
          <ChevronLeft className="h-4 w-4" />
          Volver al listado
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">Retorno #{detalle.retorno.id}</h1>
          {badgeEstadoRetorno(detalle.retorno.estado)}
        </div>
        {error && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}
        {detalle.retorno.estado === 'PENDIENTE' && (
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              puedeVerificar
                ? 'border-amber-200 bg-amber-50 text-amber-950'
                : 'border-slate-200 bg-slate-50 text-slate-700'
            }`}
          >
            {user?.id === detalle.retorno.cargado_por_id ? (
              <>
                <p className="font-medium">Pendiente de verificación</p>
                <p className="mt-1 text-slate-600">
                  Lo cargaste con tu usuario ({detalle.retorno.cargado_por_nombre}). Por control interno,
                  la verificación la debe hacer <strong>otro usuario</strong> con permiso de verificar retornos.
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  Creá un usuario con rol <strong>Supervisor</strong> o <strong>Administrador</strong> en
                  Administración → Usuarios, cerrá sesión e ingresá con ese usuario para confirmar las líneas.
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
        <Card>
          <CardBody className="grid gap-4 sm:grid-cols-2 text-sm">
            <div>
              <p className="text-slate-500">Fecha</p>
              <p className="font-medium">{detalle.retorno.fecha}</p>
            </div>
            <div>
              <p className="text-slate-500">Sectores destino</p>
              <p className="font-medium">
                {resumenSectoresLineas(detalle.lineas, detalle.retorno.sector_nombre)}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Camionero</p>
              <p className="font-medium">
                {labelCamionero(detalle.retorno.camionero_numero, detalle.retorno.camionero_nombre)}
              </p>
            </div>
            {detalle.retorno.numero_planilla && (
              <div>
                <p className="text-slate-500">Nº planilla</p>
                <p className="font-medium">{detalle.retorno.numero_planilla}</p>
              </div>
            )}
            <div>
              <p className="text-slate-500">Cargado por</p>
              <p className="font-medium">{detalle.retorno.cargado_por_nombre}</p>
            </div>
            {detalle.retorno.verificado_por_nombre && (
              <div>
                <p className="text-slate-500">Verificado por</p>
                <p className="font-medium">{detalle.retorno.verificado_por_nombre}</p>
              </div>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Productos" />
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
                <div className="text-right">
                  <p className="font-semibold">{formatTotalCajas(l.cantidad_efectiva)}</p>
                  {badgeCondicion(l.estado_efectivo)}
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
        {puedeVerificar && (
          <Card>
            <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-slate-900">Listo para verificar</p>
                <p className="text-sm text-slate-600">
                  {detalle.lineas_verificadas} de {detalle.lineas.length} líneas confirmadas en sesiones
                  anteriores
                </p>
              </div>
              <Button onClick={() => setView('verify')}>Iniciar verificación</Button>
            </CardBody>
          </Card>
        )}
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
          <h1 className="text-2xl font-bold text-slate-900">Nuevo retorno</h1>
          <p className="mt-1 mb-6 text-slate-500">
            Mercadería que vuelve a bodega — Enter avanza · Esc vuelve al listado
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
                  className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm"
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
                  className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm disabled:bg-slate-50"
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
                  className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm"
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
                      <div className="text-slate-700">
                        {formatTotalCajas(l.cantidad_cajas)} · {labelEstado(l.estado_condicion)} ·{' '}
                        {l.sector_nombre}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {badgeCondicion(l.estado_condicion)}
                        <Button type="button" variant="ghost" size="sm" onClick={() => quitarLinea(l.tempId)}>
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
            <Button variant="ghost" size="sm" className="-ml-2 h-7" onClick={volverAlListado}>
              <ChevronLeft className="h-3.5 w-3.5" />
              Salir
            </Button>
            <span>
              <strong className="text-slate-800">{fecha}</strong>
            </span>
            {numeroPlanilla.trim() && (
              <span>
                Planilla <strong className="text-slate-800">{numeroPlanilla.trim()}</strong>
              </span>
            )}
            <span>
              <Truck className="mr-0.5 inline h-3 w-3" />
              {labelCamionero(camioneroSeleccionado?.numero_interno, camioneroSeleccionado?.nombre)}
            </span>
            {sectorDefaultSeleccionado && (
              <span>
                Default <strong className="text-slate-800">{sectorDefaultSeleccionado.nombre}</strong>
              </span>
            )}
            <button
              type="button"
              className="text-brand-600 hover:underline"
              onClick={() => setCreatePhase('datos')}
            >
              Editar datos
            </button>
          </div>

          {error && (
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
                    <Button type="button" size="sm" className="w-full" onClick={agregarLineaYContinuar}>
                      <Plus className="h-4 w-4" />
                      Enter ↵
                    </Button>
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Enter en el último campo agrega la línea y vuelve al buscador
                </p>
              </div>
            )}
          </div>
        </div>

        <div ref={listScrollRef} className="relative z-0 min-h-0 flex-1 overflow-y-auto bg-white">
          <div className="sticky top-0 z-[2] border-b border-surface-border bg-white/95 px-4 py-2 backdrop-blur-sm">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-700">
                Líneas cargadas ({lineas.length})
              </span>
              {lineas.length > 0 && (
                <span className="font-semibold text-brand-700">{formatTotalCajas(totalGeneral)} total</span>
              )}
            </div>
          </div>
          {lineasListContent}
        </div>

        <div className="shrink-0 border-t border-surface-border bg-white px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs text-slate-500">Total general</p>
              <p className="text-xl font-bold text-brand-700">{formatTotalCajas(totalGeneral)}</p>
            </div>
            {hasPermiso('retornos.crear') && (
              <Button
                onClick={() => void confirmarRetorno()}
                disabled={lineas.length === 0 || saving}
              >
                <Check className="h-4 w-4" />
                {saving ? 'Registrando...' : 'Confirmar retorno'}
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
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Retornos</h1>
          <p className="mt-1 text-slate-500">
            Mercadería que vuelve a bodega — sin verificar hasta segunda revisión
            {hasPermiso('retornos.crear') && ' · Enter = nuevo retorno'}
          </p>
        </div>
        {hasPermiso('retornos.crear') && (
          <Button onClick={abrirNuevoRetorno}>
            <Plus className="h-4 w-4" />
            Nuevo retorno
          </Button>
        )}
      </div>
      <Card>
        <CardBody className="space-y-3 border-b border-surface-border py-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[10rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={listSearchRef}
                type="search"
                placeholder="Buscar por camionero o planilla... · Enter = nuevo retorno"
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
                onKeyDown={handleListSearchKeyDown}
                className="w-full rounded-lg border border-surface-border py-2 pl-10 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>

            <div className="flex shrink-0 items-center gap-1.5 rounded-lg border border-surface-border bg-slate-50/60 px-2 py-1">
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
            {hasPermiso('retornos.crear') && ' · Enter = nuevo retorno'}
          </p>

          <div className="flex flex-wrap gap-2">
            {(['TODOS', 'PENDIENTE', 'VERIFICADO'] as const).map((e) => (
              <Button
                key={e}
                type="button"
                size="sm"
                variant={filtroEstado === e ? 'primary' : 'secondary'}
                onClick={() => setFiltroEstado(e)}
              >
                {e === 'TODOS' ? 'Todos' : e === 'PENDIENTE' ? 'Sin verificar' : 'Verificados'}
              </Button>
            ))}
          </div>

          <DayTabsRow
            days={diasConRetornos}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
            getCount={(dia) => conteoPorDia.get(dia) ?? 0}
          />
        </CardBody>

        <CardHeader
          title={diasConRetornos.length > 0 ? formatDayTabLabel(selectedDay) : 'Registros'}
          description={
            diasConRetornos.length > 0
              ? `${retornosDelDia.length} retorno(s) · ${formatCantidad(totalCajasDelDia)} en el día`
              : `${retornos.length} retorno(s)`
          }
        />
        <CardBody className="p-0">
          {error && (
            <div className="border-b border-red-100 bg-red-50 px-6 py-3 text-sm text-red-700">{error}</div>
          )}
          {loadingList ? (
            <p className="p-6 text-sm text-slate-500">Cargando...</p>
          ) : retornos.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <RotateCcw className="h-12 w-12 text-slate-300" />
              <p className="mt-3 font-medium text-slate-700">
                {listSearch || listFechaDesde || listFechaHasta || filtroEstado !== 'TODOS'
                  ? 'No hay retornos con esos filtros'
                  : 'No hay retornos registrados'}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {listSearch || listFechaDesde || listFechaHasta || filtroEstado !== 'TODOS'
                  ? 'Probá ampliar el rango de fechas o cambiar la búsqueda'
                  : 'Registrá el primer retorno de mercadería que vuelve a bodega'}
              </p>
            </div>
          ) : retornosDelDia.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <RotateCcw className="h-12 w-12 text-slate-300" />
              <p className="mt-3 font-medium text-slate-700">Sin resultados para este día</p>
              <p className="mt-1 text-sm text-slate-500">Probá otra fecha o ajustá la búsqueda</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-border bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-6 py-3">Planilla</th>
                    <th className="px-6 py-3">Camionero</th>
                    <th className="max-w-[14rem] px-6 py-3">Observación</th>
                    <th className="px-6 py-3">Estado</th>
                    <th className="px-6 py-3">Total</th>
                    <th className="px-6 py-3">Usuario</th>
                    <th className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {retornosDelDia.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/50">
                      <td className="px-6 py-3 font-medium text-slate-900">
                        {r.numero_planilla ?? '—'}
                      </td>
                      <td className="px-6 py-3">
                        <p>{r.camionero_nombre ?? '—'}</p>
                        {r.camionero_numero && (
                          <p className="text-xs text-slate-500">{r.camionero_numero}</p>
                        )}
                      </td>
                      <td className="max-w-[14rem] px-6 py-3 text-slate-600">
                        <div className="overflow-x-auto whitespace-nowrap [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                          {r.observacion?.trim() || '—'}
                        </div>
                      </td>
                      <td className="px-6 py-3">{badgeEstadoRetorno(r.estado)}</td>
                      <td className="px-6 py-3 font-semibold text-brand-700">
                        {formatCantidad(r.total_cajas)}
                      </td>
                      <td className="px-6 py-3 text-slate-500">{r.usuario_nombre}</td>
                      <td className="px-6 py-3 text-right">
                        <Button variant="ghost" size="sm" onClick={() => void abrirRetorno(r.id)}>
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
