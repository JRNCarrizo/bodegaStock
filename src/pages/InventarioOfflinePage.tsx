import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Check,
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Package,
  Pencil,
  Radio,
  Search,
  Share2,
  Trash2,
  Upload,
  Wifi,
  X
} from 'lucide-react'
import { Share } from '@capacitor/share'
import { Capacitor } from '@capacitor/core'
import QRCode from 'qrcode'
import { BarcodeScannerModal } from '@/components/BarcodeScannerModal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import { formatValorLineaConteo, formatTotalesInventarioResumen } from '@/lib/desglose'
import {
  addLineaOffline,
  buildMiSyncPayload,
  deleteLineaOffline,
  descargarPaqueteOffline,
  finalizarMiRonda,
  getComparacionActual,
  getOfflineSession,
  getReferenciaReconteo,
  getResumenSyncRonda,
  importarAlPc,
  iniciarReconteoLocal,
  isSyncCompaneroIncompleto,
  puedeRecuperarComparacionLocal,
  recibirSyncCompanero,
  recuperarComparacionLocal,
  updateLineaOffline
} from '@/lib/inventarioOffline'
import { writeSyncShareFile } from '@/lib/inventarioOffline/storage'
import {
  P2P_PORT,
  startP2PHost,
  stopP2PHost,
  syncConHost
} from '@/lib/inventarioOffline/p2pSync'
import type {
  OfflineEstadoLocal,
  OfflineLinea,
  OfflinePaquete,
  OfflineProducto,
  OfflineSyncPayload,
  TipoBultoOffline
} from '@/lib/inventarioOffline/types'

function sumarTotalesMisLineas(lineas: OfflineLinea[]) {
  return lineas.reduce(
    (acc, l) => ({
      cajas: acc.cajas + Number(l.total_cajas ?? 0),
      suelto: acc.suelto + Number(l.total_suelto ?? 0)
    }),
    { cajas: 0, suelto: 0 }
  )
}

function DesgloseParaleloOffline({
  lineas1,
  lineas2,
  titulo1,
  titulo2
}: {
  lineas1: OfflineLinea[]
  lineas2: OfflineLinea[]
  titulo1: string
  titulo2: string
}) {
  const filas = Math.max(lineas1.length, lineas2.length, 1)
  return (
    <div className="overflow-hidden rounded-xl border border-surface-border bg-white">
      <div className="grid grid-cols-2 divide-x border-b bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <div className="px-3 py-2">{titulo1}</div>
        <div className="px-3 py-2 text-brand-700">{titulo2}</div>
      </div>
      <div className="divide-y">
        {Array.from({ length: filas }).map((_, i) => {
          const a = lineas1[i]
          const b = lineas2[i]
          return (
            <div key={i} className="grid grid-cols-2 divide-x text-sm">
              <div className="px-3 py-2 text-slate-700">{a ? a.etiqueta : '—'}</div>
              <div className="bg-brand-50/30 px-3 py-2 text-slate-800">{b ? b.etiqueta : '—'}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function InventarioOfflinePage() {
  const { sectorInvId: rawId } = useParams()
  const sectorInvId = Number(rawId)
  const navigate = useNavigate()
  const productSearchRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [paquete, setPaquete] = useState<OfflinePaquete | null>(null)
  const [estado, setEstado] = useState<OfflineEstadoLocal | null>(null)
  const [syncText, setSyncText] = useState('')
  const [showSyncImport, setShowSyncImport] = useState(false)
  const [showFileFallback, setShowFileFallback] = useState(false)
  const [p2pMode, setP2pMode] = useState<'idle' | 'host' | 'client'>('idle')
  const [hostInfo, setHostInfo] = useState<{ url: string; localIp: string; port: number } | null>(
    null
  )
  const [hostQrDataUrl, setHostQrDataUrl] = useState('')
  const [clientHostInput, setClientHostInput] = useState('192.168.43.1')
  const [showP2PQrScanner, setShowP2PQrScanner] = useState(false)
  const [hostSyncedOk, setHostSyncedOk] = useState(false)
  const hostAutoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [expandedProductos, setExpandedProductos] = useState<Set<number>>(new Set())
  const [expandedDesgloseRef, setExpandedDesgloseRef] = useState<Set<number>>(new Set())

  const [productSearch, setProductSearch] = useState('')
  const [selected, setSelected] = useState<OfflineProducto | null>(null)
  const [editingLocalId, setEditingLocalId] = useState<string | null>(null)
  const [showScanner, setShowScanner] = useState(false)
  const [tipoBulto, setTipoBulto] = useState<TipoBultoOffline>('PALLET')
  const [cantidadBultos, setCantidadBultos] = useState('')
  const [unidadesPorBulto, setUnidadesPorBulto] = useState('')
  const [cantidadSuelta, setCantidadSuelta] = useState('')

  const reload = useCallback(async () => {
    const data = await getOfflineSession(sectorInvId)
    setPaquete(data.paquete)
    setEstado(data.estado)
  }, [sectorInvId])

  useEffect(() => {
    void (async () => {
      setLoading(true)
      setError('')
      try {
        await reload()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al cargar offline')
      } finally {
        setLoading(false)
      }
    })()
  }, [reload])

  useEffect(() => {
    return () => {
      if (hostAutoStopRef.current) clearTimeout(hostAutoStopRef.current)
      void stopP2PHost()
    }
  }, [])

  function clearHostAutoStop() {
    if (hostAutoStopRef.current) {
      clearTimeout(hostAutoStopRef.current)
      hostAutoStopRef.current = null
    }
  }

  async function shutdownHostUi(message?: string) {
    clearHostAutoStop()
    await stopP2PHost()
    setHostInfo(null)
    setHostQrDataUrl('')
    setHostSyncedOk(false)
    setP2pMode('idle')
    if (message) setMsg(message)
  }

  const productosFiltrados = useMemo(() => {
    if (!paquete) return []
    const q = productSearch.trim().toLowerCase()
    if (!q || selected) return []
    return paquete.productos
      .filter(
        (p) =>
          p.nombre.toLowerCase().includes(q) ||
          p.codigo_interno.toLowerCase().includes(q) ||
          (p.codigo_barras ?? '').toLowerCase().includes(q)
      )
      .slice(0, 20)
  }, [paquete, productSearch, selected])

  const misLineasRonda = useMemo(() => {
    if (!estado) return []
    return estado.mis_lineas.filter((l) => l.ronda === estado.ronda_actual)
  }, [estado])

  const lineasPorProducto = useMemo(() => {
    if (!estado || !paquete) return []
    const map = new Map<number, OfflineLinea[]>()
    for (const l of misLineasRonda) {
      const arr = map.get(l.producto_id) ?? []
      arr.push(l)
      map.set(l.producto_id, arr)
    }

    const referencia = getReferenciaReconteo(paquete, estado)
    const refMap = new Map(referencia?.diferencias.map((d) => [d.producto_id, d]) ?? [])
    const enReconteo = estado.ronda_actual > 1

    let ids = [...map.keys()]
    if (enReconteo && referencia) {
      const diffIds = referencia.diferencias.map((d) => d.producto_id)
      ids = [
        ...diffIds,
        ...ids.filter((id) => !diffIds.includes(id))
      ]
    }

    return ids.map((producto_id) => {
      const lineas = map.get(producto_id) ?? []
      const ref = refMap.get(producto_id)
      const prod = paquete.productos.find((p) => p.id === producto_id)
      const totales = sumarTotalesMisLineas(lineas)
      return {
        producto_id,
        nombre: lineas[0]?.nombre ?? ref?.nombre ?? prod?.nombre ?? '',
        codigo: lineas[0]?.codigo_interno ?? ref?.codigo_interno ?? prod?.codigo_interno ?? '',
        lineas,
        resumen: formatTotalesInventarioResumen(totales, prod?.unidad),
        referencia: ref
      }
    })
  }, [estado, paquete, misLineasRonda])

  const comparacion = useMemo(() => {
    if (!paquete || !estado) return null
    return getComparacionActual(paquete, estado)
  }, [paquete, estado])

  const resumenSync = useMemo(() => {
    if (!estado?.mi_finalizo || !estado.companero_finalizo) return null
    return getResumenSyncRonda(estado)
  }, [estado])

  const syncIncompleto = useMemo(() => {
    if (!estado) return false
    return isSyncCompaneroIncompleto(estado)
  }, [estado])

  const companeroYaEnReconteo = Boolean(
    estado &&
      estado.mi_finalizo &&
      (estado.companero_ronda_actual ?? estado.ronda_actual) > estado.ronda_actual
  )

  const puedeRecuperarComparacion = Boolean(estado && puedeRecuperarComparacionLocal(estado))

  const totalGeneral = useMemo(() => sumarTotalesMisLineas(misLineasRonda), [misLineasRonda])
  const resumenGeneral = useMemo(
    () => formatTotalesInventarioResumen(totalGeneral),
    [totalGeneral]
  )

  const puedeEditar = Boolean(paquete && estado && !estado.mi_finalizo)
  const enReconteo = (estado?.ronda_actual ?? 1) > 1
  const miRol = paquete?.inventario_sector.mi_rol

  function toggleProductoExpand(productoId: number) {
    setExpandedProductos((prev) => {
      const next = new Set(prev)
      if (next.has(productoId)) next.delete(productoId)
      else next.add(productoId)
      return next
    })
  }

  function toggleDesgloseRef(productoId: number) {
    setExpandedDesgloseRef((prev) => {
      const next = new Set(prev)
      if (next.has(productoId)) next.delete(productoId)
      else next.add(productoId)
      return next
    })
  }

  function defaultUnidadesPorBulto(tipo: 'PALLET' | 'CAJA', p: OfflineProducto | null): string {
    if (!p) return tipo === 'PALLET' ? '112' : '6'
    if (tipo === 'PALLET') {
      return String(p.unidades_por_pallet_default ?? 112)
    }
    return String(p.unidades_por_caja_default ?? 6)
  }

  function selectProduct(p: OfflineProducto) {
    setSelected(p)
    setProductSearch(p.codigo_interno)
    if (!editingLocalId) {
      setTipoBulto('PALLET')
      setUnidadesPorBulto(defaultUnidadesPorBulto('PALLET', p))
    }
  }

  function handleTipoBultoChange(tipo: TipoBultoOffline) {
    setTipoBulto(tipo)
    if (tipo === 'SUELTO') {
      setUnidadesPorBulto('')
      setCantidadBultos('')
    } else {
      setUnidadesPorBulto(defaultUnidadesPorBulto(tipo, selected))
    }
  }

  function empezarEditarLinea(l: OfflineLinea) {
    if (!paquete) return
    const prod = paquete.productos.find((p) => p.id === l.producto_id)
    if (!prod) {
      setError('Producto no está en el paquete offline')
      return
    }
    setError('')
    setEditingLocalId(l.local_id)
    setSelected(prod)
    setProductSearch(prod.codigo_interno)
    setTipoBulto(l.tipo_bulto)
    if (l.tipo_bulto === 'SUELTO') {
      setCantidadBultos('')
      setUnidadesPorBulto('')
      setCantidadSuelta(String(l.cantidad_suelta ?? l.total_unidades ?? ''))
    } else {
      setCantidadBultos(String(l.cantidad_bultos ?? ''))
      setUnidadesPorBulto(String(l.unidades_por_bulto ?? ''))
      setCantidadSuelta(l.cantidad_suelta != null ? String(l.cantidad_suelta) : '')
    }
    setExpandedProductos((prev) => new Set(prev).add(l.producto_id))
  }

  function handleScan(code: string) {
    setShowScanner(false)
    const normalized = code.trim().toLowerCase()
    if (!paquete || !normalized) {
      setProductSearch(code.trim())
      return
    }
    const match = paquete.productos.find(
      (p) =>
        (p.codigo_barras ?? '').toLowerCase() === normalized ||
        p.codigo_interno.toLowerCase() === normalized
    )
    if (match) {
      selectProduct(match)
      return
    }
    setSelected(null)
    setProductSearch(code.trim())
    setError(`No se encontró el código "${code.trim()}" en el paquete offline`)
    setTimeout(() => productSearchRef.current?.focus(), 50)
  }

  function cancelarLineaForm() {
    setEditingLocalId(null)
    setSelected(null)
    setProductSearch('')
    setCantidadBultos('')
    setUnidadesPorBulto('')
    setCantidadSuelta('')
    setTipoBulto('PALLET')
    setTimeout(() => productSearchRef.current?.focus(), 50)
  }

  async function handleDescargar() {
    setBusy(true)
    setError('')
    setMsg('')
    try {
      await descargarPaqueteOffline(sectorInvId)
      await reload()
      setMsg('Paquete listo. Ya podés contar sin red al PC.')
      setTimeout(() => productSearchRef.current?.focus(), 100)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo descargar el paquete')
    } finally {
      setBusy(false)
    }
  }

  async function handleAddLinea(e?: React.FormEvent) {
    e?.preventDefault()
    if (!selected || !estado) return
    setBusy(true)
    setError('')
    try {
      const input = {
        producto_id: selected.id,
        tipo_bulto: tipoBulto,
        cantidad_bultos: tipoBulto === 'SUELTO' ? null : Number(cantidadBultos) || 0,
        unidades_por_bulto: tipoBulto === 'SUELTO' ? null : Number(unidadesPorBulto) || 0,
        cantidad_suelta:
          tipoBulto === 'SUELTO'
            ? Number(cantidadSuelta) || 0
            : Number(cantidadSuelta) || null
      }
      const linea = editingLocalId
        ? await updateLineaOffline(sectorInvId, editingLocalId, input)
        : await addLineaOffline(sectorInvId, input)
      setExpandedProductos((prev) => new Set(prev).add(linea.producto_id))
      cancelarLineaForm()
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar línea')
    } finally {
      setBusy(false)
    }
  }

  async function handleFinalizar() {
    if (!confirm('¿Finalizaste el conteo de este sector?')) return
    setBusy(true)
    setError('')
    try {
      await finalizarMiRonda(sectorInvId)
      await reload()
      setMsg('Finalizaste. Sincronizá con el compañero.')
      setP2pMode('idle')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al finalizar')
    } finally {
      setBusy(false)
    }
  }

  async function onP2PSynced() {
    // Primero cargar estado (companero_finalizo). Recién después habilitar
    // "Ver comparación": si no, al tocar Listo muy rápido volvías al hotspot vacío.
    await reload()
    setHostSyncedOk(true)
    setMsg('Sincronizado.')
    clearHostAutoStop()
    hostAutoStopRef.current = setTimeout(() => {
      void shutdownHostUi()
    }, 60000)
  }

  async function handleStartHost() {
    setBusy(true)
    setError('')
    setMsg('')
    setHostSyncedOk(false)
    clearHostAutoStop()
    try {
      if (!Capacitor.isNativePlatform()) {
        throw new Error('El sync por hotspot funciona en la APK. En el navegador usá el respaldo por archivo.')
      }
      const info = await startP2PHost(sectorInvId, () => {
        void onP2PSynced()
      })
      setHostInfo(info)
      setP2pMode('host')
      try {
        const qr = await QRCode.toDataURL(info.url, { width: 220, margin: 1 })
        setHostQrDataUrl(qr)
      } catch {
        setHostQrDataUrl('')
      }
      setMsg('Activá el hotspot y pedile al otro que se conecte.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar el host')
      setP2pMode('idle')
      setHostInfo(null)
    } finally {
      setBusy(false)
    }
  }

  async function handleStopHost() {
    setBusy(true)
    try {
      if (hostSyncedOk) {
        const data = await getOfflineSession(sectorInvId)
        if (data.estado && puedeRecuperarComparacionLocal(data.estado)) {
          await recuperarComparacionLocal(sectorInvId)
        }
        await reload()
        await shutdownHostUi('Revisá la comparación.')
      } else {
        await shutdownHostUi('Espera cancelada.')
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleRecuperarComparacion() {
    setBusy(true)
    setError('')
    setMsg('')
    try {
      await shutdownHostUi()
      await recuperarComparacionLocal(sectorInvId)
      await reload()
      setMsg('Comparación lista. Si hay diferencias, iniciá reconteo.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo recuperar la comparación')
    } finally {
      setBusy(false)
    }
  }

  async function handleConnectClient() {
    setBusy(true)
    setError('')
    setMsg('')
    try {
      await syncConHost(sectorInvId, clientHostInput)
      setP2pMode('idle')
      await reload()
      setMsg('Sincronizado.')
    } catch (e) {
      setError(
        e instanceof Error
          ? `${e.message} Si el otro ya recibió tu conteo, que deje el host activo y reintentá.`
          : 'No se pudo sincronizar'
      )
    } finally {
      setBusy(false)
    }
  }

  function handleP2PQrScan(code: string) {
    setShowP2PQrScanner(false)
    setError('')
    const trimmed = code.trim()
    if (!trimmed) {
      setError('El QR no tiene una IP/URL válida')
      return
    }
    try {
      const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
      const url = new URL(withProtocol)
      if (!url.hostname) throw new Error('sin host')
      setClientHostInput(trimmed)
      setMsg('QR leído.')
    } catch {
      setError('El QR no contiene una IP/URL válida del compañero')
    }
  }

  async function handleCompartir() {
    setBusy(true)
    setError('')
    try {
      const payload = await buildMiSyncPayload(sectorInvId)
      const { json, fileName, uri } = await writeSyncShareFile(payload)
      setSyncText(json)

      if (Capacitor.isNativePlatform() && uri) {
        await Share.share({
          title: fileName,
          text: `Conteo inventario — ${fileName}`,
          url: uri,
          dialogTitle: 'Enviar conteo al compañero'
        })
        setMsg(`Archivo listo: ${fileName}`)
      } else if (Capacitor.isNativePlatform()) {
        await Share.share({
          title: fileName,
          text: json,
          dialogTitle: 'Enviar conteo al compañero'
        })
      } else {
        // Web / emulador sin share de archivo: descarga local
        const blob = new Blob([json], { type: 'application/json' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = fileName
        a.click()
        URL.revokeObjectURL(a.href)
        setMsg(`Descargado ${fileName}`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo compartir')
    } finally {
      setBusy(false)
    }
  }

  async function applyCompaneroPayload(parsed: OfflineSyncPayload) {
    await recibirSyncCompanero(sectorInvId, parsed)
    await reload()
    setShowSyncImport(false)
    setSyncText('')
    setMsg('Conteo del compañero importado.')
  }

  async function handleImportarCompanero() {
    setBusy(true)
    setError('')
    setMsg('')
    try {
      const parsed = JSON.parse(syncText) as OfflineSyncPayload
      await applyCompaneroPayload(parsed)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'JSON inválido')
    } finally {
      setBusy(false)
    }
  }

  async function handleFileSelected(file: File | null) {
    if (!file) return
    setBusy(true)
    setError('')
    setMsg('')
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as OfflineSyncPayload
      await applyCompaneroPayload(parsed)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el archivo')
    } finally {
      setBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleReconteo() {
    setBusy(true)
    setError('')
    try {
      await shutdownHostUi()
      await iniciarReconteoLocal(sectorInvId)
      await reload()
      setMsg('Reconteo iniciado.')
      setTimeout(() => productSearchRef.current?.focus(), 100)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error en reconteo')
    } finally {
      setBusy(false)
    }
  }

  async function handleImportPc() {
    setBusy(true)
    setError('')
    setMsg('Enviando y confirmando en el PC…')
    try {
      await shutdownHostUi()
      const res = await importarAlPc(sectorInvId)
      const n = (res as { lineas_enviadas?: number }).lineas_enviadas
      setMsg(
        n != null
          ? `Confirmado en el PC (${n} líneas). Ya está guardado ahí; si tarda en verse, refrescá inventario en la compu.`
          : 'Confirmado en el PC. Ya está guardado ahí; si tarda en verse, refrescá inventario en la compu.'
      )
      await reload()
      navigate('/inventario')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al importar al PC')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-5rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    )
  }

  // Sin paquete: solo descarga (oficina)
  if (!paquete) {
    return (
      <div className="-m-4 flex h-[calc(100vh-5rem)] flex-col bg-surface-muted/30 lg:-m-6">
        <div className="border-b border-brand-100 bg-gradient-to-r from-brand-50/80 via-white to-white px-4 py-3 sm:px-5">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 h-8 rounded-lg px-2"
              onClick={() => navigate('/inventario')}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Salir
            </Button>
            <div>
              <h1 className="text-sm font-semibold text-slate-900">Inventario offline</h1>
              <p className="text-xs text-slate-500">Sector #{sectorInvId}</p>
            </div>
            <span className="ml-auto rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 ring-1 ring-amber-100">
              Offline
            </span>
          </div>
        </div>
        {error && (
          <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
        )}
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
            <Download className="h-6 w-6" />
          </div>
          <div className="max-w-sm space-y-2">
            <p className="text-sm font-medium text-slate-800">Descargar paquete del sector</p>
            <p className="text-xs text-slate-500">
              Con WiFi al PC (oficina): bajá catálogo y datos del sector. Después contás sin red,
              con la misma vista que el inventario online.
            </p>
          </div>
          <Button disabled={busy} onClick={() => void handleDescargar()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Descargar paquete
          </Button>
        </div>
      </div>
    )
  }

  const sector = paquete.inventario_sector
  const ronda = estado?.ronda_actual ?? 1

  const lineasListContent =
    lineasPorProducto.length === 0 ? (
      <div className="flex h-full min-h-[140px] flex-col items-center justify-center px-6 py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <Package className="h-6 w-6" />
        </div>
        <p className="mt-3 text-sm font-medium text-slate-600">Sin líneas cargadas</p>
        <p className="mt-1 text-xs text-slate-500">Cada conteo es una línea independiente</p>
      </div>
    ) : (
      lineasPorProducto.map((grupo) => {
        const isExpanded = expandedProductos.has(grupo.producto_id)
        const ref = grupo.referencia
        return (
          <div key={grupo.producto_id} className="border-b border-surface-border last:border-0">
            <div
              className={cn(
                'flex items-center gap-3 px-4 py-3 transition-colors sm:px-5',
                isExpanded ? 'bg-brand-50/50' : 'hover:bg-slate-50/80'
              )}
            >
              <button
                type="button"
                onClick={() => toggleProductoExpand(grupo.producto_id)}
                className={cn(
                  'shrink-0 rounded-lg p-1.5 transition-colors',
                  isExpanded
                    ? 'bg-brand-100 text-brand-700'
                    : 'text-slate-400 hover:bg-slate-200 hover:text-slate-700'
                )}
              >
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => toggleProductoExpand(grupo.producto_id)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">
                  {grupo.codigo}
                </span>
                <p className="mt-1 truncate text-sm font-semibold text-slate-900">{grupo.nombre}</p>
                {!isExpanded && grupo.lineas.length > 1 && (
                  <p className="mt-0.5 text-xs text-slate-500">{grupo.lineas.length} líneas</p>
                )}
              </button>
              <span className="inline-flex shrink-0 items-center rounded-lg bg-brand-50 px-2.5 py-1.5 text-sm font-bold tabular-nums text-brand-700 ring-1 ring-brand-100">
                {grupo.resumen}
              </span>
            </div>
            {isExpanded && (
              <div className="space-y-2 border-t border-brand-100/80 bg-gradient-to-b from-surface-muted/40 to-white px-4 py-3 sm:px-5">
                {ref && miRol && enReconteo && (
                  <div className="space-y-2 border-b border-slate-200/90 pb-2">
                    <button
                      type="button"
                      onClick={() => toggleDesgloseRef(grupo.producto_id)}
                      className="flex w-full items-center gap-1.5 text-left text-[10px] leading-snug text-slate-500"
                    >
                      <ChevronRight
                        className={cn(
                          'h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform',
                          expandedDesgloseRef.has(grupo.producto_id) && 'rotate-90'
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="text-slate-400">Ronda anterior ·</span>{' '}
                        <span className="font-medium text-slate-600">
                          Vos {miRol === 1 ? ref.resumen_contador_1 : ref.resumen_contador_2}
                        </span>
                        <span className="mx-1 text-slate-300">vs</span>
                        <span className="font-medium text-slate-600">
                          Compañero {miRol === 1 ? ref.resumen_contador_2 : ref.resumen_contador_1}
                        </span>
                      </span>
                      <span className="shrink-0 text-slate-400">
                        {expandedDesgloseRef.has(grupo.producto_id) ? 'Ocultar' : 'Detalle'}
                      </span>
                    </button>
                    {expandedDesgloseRef.has(grupo.producto_id) && (
                      <DesgloseParaleloOffline
                        titulo1="Vos"
                        titulo2="Compañero"
                        lineas1={miRol === 1 ? ref.lineas_contador_1 : ref.lineas_contador_2}
                        lineas2={miRol === 1 ? ref.lineas_contador_2 : ref.lineas_contador_1}
                      />
                    )}
                  </div>
                )}
                {grupo.lineas.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-surface-border bg-white px-3 py-4 text-center text-sm text-slate-500">
                    Sin líneas — buscá el producto arriba para cargar
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {grupo.lineas.map((l, idx) => (
                      <li
                        key={l.local_id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-surface-border bg-white px-3 py-2.5 text-sm"
                      >
                        <div className="min-w-0 text-slate-800">
                          <span className="text-xs text-slate-400">{idx + 1}.</span> {l.etiqueta}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <span className="rounded-md bg-slate-50 px-2 py-1 text-sm font-semibold tabular-nums text-slate-900 ring-1 ring-surface-border">
                            {formatValorLineaConteo(l)}
                          </span>
                          {puedeEditar && (
                            <>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="rounded-lg"
                                onClick={() => empezarEditarLinea(l)}
                              >
                                <Pencil className="h-4 w-4 text-brand-600" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="rounded-lg"
                                onClick={() =>
                                  void deleteLineaOffline(sectorInvId, l.local_id).then(reload)
                                }
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
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
              onClick={() => navigate('/inventario')}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Salir
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-sm font-semibold text-slate-900">{sector.sector_nombre}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-white px-2.5 py-1 font-medium text-slate-700 ring-1 ring-surface-border">
                  Ronda {ronda}
                </span>
                <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-900 ring-1 ring-amber-100">
                  Offline
                </span>
                {estado?.mi_finalizo && (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-800 ring-1 ring-emerald-100">
                    Finalizado
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700 sm:px-5">
            {error}
          </div>
        )}
        {msg && (
          <div className="border-b border-emerald-100 bg-emerald-50 px-4 py-2 text-sm text-emerald-800 sm:px-5">
            {msg}
          </div>
        )}

        {puedeRecuperarComparacion && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 sm:px-5">
            <p className="text-sm font-medium text-amber-950">Datos del compañero ya están acá</p>
            <Button
              size="sm"
              className="mt-2 rounded-xl"
              disabled={busy}
              onClick={() => void handleRecuperarComparacion()}
            >
              <Check className="h-3.5 w-3.5" />
              Ver comparación
            </Button>
          </div>
        )}

        {estado?.mi_finalizo &&
          (!estado.companero_finalizo || p2pMode !== 'idle') &&
          !puedeRecuperarComparacion && (
          <div className="border-b border-sky-100 bg-sky-50 px-4 py-3 sm:px-5">
            <p className="text-sm font-medium text-sky-950">Sincronizar con el compañero</p>

            {p2pMode === 'idle' && (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Button size="sm" className="rounded-xl" disabled={busy} onClick={() => void handleStartHost()}>
                  <Radio className="h-3.5 w-3.5" />
                  Yo espero (hotspot)
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="rounded-xl"
                  disabled={busy}
                  onClick={() => setP2pMode('client')}
                >
                  <Wifi className="h-3.5 w-3.5" />
                  Me conecto
                </Button>
              </div>
            )}

            {p2pMode === 'host' && hostInfo && (
              <div className="mt-3 space-y-3 rounded-xl border border-sky-200 bg-white p-3">
                {hostSyncedOk ? (
                  <p className="text-sm font-medium text-emerald-800">Listo — datos recibidos</p>
                ) : (
                  <>
                    <p className="text-sm text-slate-700">
                      Activá el hotspot y mostrá este QR
                    </p>
                    <p className="font-mono text-xs font-semibold text-slate-800">
                      {hostInfo.localIp}:{hostInfo.port}
                    </p>
                    {hostQrDataUrl && (
                      <div className="flex justify-center">
                        <img
                          src={hostQrDataUrl}
                          alt="QR sync"
                          className="h-40 w-40 rounded-lg border border-slate-200 bg-white p-1"
                        />
                      </div>
                    )}
                  </>
                )}
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void handleStopHost()}>
                  {hostSyncedOk ? 'Ver comparación' : 'Cancelar'}
                </Button>
              </div>
            )}

            {p2pMode === 'client' && (
              <div className="mt-3 space-y-2 rounded-xl border border-sky-200 bg-white p-3">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="w-full rounded-xl"
                  disabled={busy}
                  onClick={() => setShowP2PQrScanner(true)}
                >
                  <Camera className="h-3.5 w-3.5" />
                  Escanear QR
                </Button>
                <Input
                  value={clientHostInput}
                  onChange={(e) => setClientHostInput(e.target.value)}
                  placeholder={`IP o http://IP:${P2P_PORT}`}
                  className="font-mono text-sm"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className="rounded-xl"
                    disabled={busy || !clientHostInput.trim()}
                    onClick={() => void handleConnectClient()}
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wifi className="h-3.5 w-3.5" />}
                    Sincronizar
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => setP2pMode('idle')}>
                    Volver
                  </Button>
                </div>
              </div>
            )}

            {p2pMode === 'idle' && (
              <div className="mt-3">
                <button
                  type="button"
                  className="text-xs text-sky-800 underline-offset-2 hover:underline"
                  onClick={() => setShowFileFallback((v) => !v)}
                >
                  {showFileFallback ? 'Ocultar respaldo' : 'Respaldo por archivo'}
                </button>
                {showFileFallback && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => void handleCompartir()}>
                      <Share2 className="h-3.5 w-3.5" />
                      Enviar mi archivo
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Abrir archivo
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowSyncImport((v) => !v)}>
                      Pegar JSON
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="application/json,.json"
                      className="hidden"
                      onChange={(e) => void handleFileSelected(e.target.files?.[0] ?? null)}
                    />
                    {showSyncImport && (
                      <div className="w-full space-y-2">
                        <textarea
                          className="h-24 w-full rounded-lg border border-sky-200 bg-white p-2 font-mono text-xs"
                          value={syncText}
                          onChange={(e) => setSyncText(e.target.value)}
                          placeholder="JSON del compañero"
                        />
                        <Button
                          size="sm"
                          disabled={busy || !syncText.trim()}
                          onClick={() => void handleImportarCompanero()}
                        >
                          Importar
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {syncIncompleto && resumenSync && (
          <div className="border-b border-red-200 bg-red-50 px-4 py-3 sm:px-5">
            <p className="text-sm font-medium text-red-900">Sync incompleto</p>
            <p className="mt-1 text-xs text-red-800">
              Vos {resumenSync.mis_productos} prod. · compañero sin datos — reintentá sync
            </p>
            {p2pMode === 'idle' && (
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" disabled={busy} onClick={() => void handleStartHost()}>
                  Yo espero
                </Button>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => setP2pMode('client')}>
                  Me conecto
                </Button>
              </div>
            )}
          </div>
        )}

        {resumenSync && !syncIncompleto && (
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600 sm:px-5">
            Vos {resumenSync.mis_productos} · Compañero {resumenSync.companero_productos}
            {comparacion && !comparacion.coincide
              ? ` · ${comparacion.diferencias.length} diferencia${comparacion.diferencias.length === 1 ? '' : 's'}`
              : ''}
          </div>
        )}

        {comparacion && (
          <div className="border-b border-amber-100 bg-amber-50/80 px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-medium text-slate-800">Comparación</h2>
              {companeroYaEnReconteo && (
                <span className="text-xs font-medium text-sky-800">El otro ya está en reconteo</span>
              )}
            </div>
            {comparacion.coincide ? (
              <div className="mt-2 space-y-2">
                <p className="flex items-center gap-2 text-sm text-emerald-700">
                  <Check className="h-4 w-4" />
                  Todo coincide
                </p>
                <Button size="sm" className="rounded-xl" disabled={busy} onClick={() => void handleImportPc()}>
                  <Upload className="h-3.5 w-3.5" />
                  Importar al PC
                </Button>
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                {comparacion.diferencias.map((d) => {
                  const misLineas = miRol === 1 ? d.lineas_contador_1 : d.lineas_contador_2
                  const compLineas = miRol === 1 ? d.lineas_contador_2 : d.lineas_contador_1
                  const miResumen = miRol === 1 ? d.resumen_contador_1 : d.resumen_contador_2
                  const compResumen = miRol === 1 ? d.resumen_contador_2 : d.resumen_contador_1
                  return (
                    <div key={d.producto_id} className="space-y-2 rounded-lg border border-red-200 bg-white p-2">
                      <p className="text-sm font-medium">{d.nombre}</p>
                      <p className="text-xs text-slate-600">
                        Vos: {miResumen} · Compañero: {compResumen}
                      </p>
                      <DesgloseParaleloOffline
                        titulo1="Vos"
                        titulo2="Compañero"
                        lineas1={misLineas}
                        lineas2={compLineas}
                      />
                    </div>
                  )
                })}
                <Button size="sm" className="rounded-xl" disabled={busy} onClick={() => void handleReconteo()}>
                  Iniciar reconteo
                </Button>
              </div>
            )}
          </div>
        )}

        {puedeEditar && (
          <div className="space-y-3 overflow-visible p-4 sm:p-5">
            <div className="flex items-start gap-2">
              <div className="relative z-30 min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400" />
                <input
                  ref={productSearchRef}
                  type="search"
                  role="combobox"
                  aria-expanded={productosFiltrados.length > 0}
                  placeholder="Buscar producto — código o nombre"
                  value={productSearch}
                  onChange={(e) => {
                    setProductSearch(e.target.value)
                    if (selected && e.target.value !== selected.codigo_interno) {
                      setSelected(null)
                    }
                  }}
                  className="w-full rounded-xl border border-surface-border bg-white py-2.5 pl-10 pr-3 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
                {productosFiltrados.length > 0 && (
                  <ul className="absolute z-50 mt-1 max-h-52 w-full overflow-auto rounded-xl border border-surface-border bg-white py-1 shadow-panel">
                    {productosFiltrados.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-slate-50"
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
                className="h-[42px] shrink-0 rounded-xl px-3"
                onClick={() => {
                  setError('')
                  setShowScanner(true)
                }}
                aria-label="Escanear código"
                title="Escanear código"
              >
                <Camera className="h-4 w-4" />
              </Button>
            </div>

            {selected && (
              <div className="overflow-hidden rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50/80 to-white p-4 shadow-card">
                <div className="mb-4 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-600">
                      {editingLocalId ? 'Editar línea' : 'Nueva línea'}
                    </p>
                    <span className="inline-flex rounded-md bg-white px-2 py-0.5 font-mono text-xs font-semibold text-slate-700 ring-1 ring-surface-border">
                      {selected.codigo_interno}
                    </span>
                    <p className="mt-1 truncate text-sm font-semibold text-slate-900">{selected.nombre}</p>
                  </div>
                  <button
                    type="button"
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-600"
                    onClick={cancelarLineaForm}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <form
                  onSubmit={(e) => void handleAddLinea(e)}
                  className="grid grid-cols-2 gap-2 sm:grid-cols-4"
                >
                  <div>
                    <label className="mb-0.5 block text-xs font-medium text-slate-600">Tipo</label>
                    <select
                      value={tipoBulto}
                      onChange={(e) => handleTipoBultoChange(e.target.value as TipoBultoOffline)}
                      className="w-full rounded-lg border border-surface-border px-2 py-1.5 text-sm"
                    >
                      <option value="PALLET">Pallet</option>
                      <option value="CAJA">Caja</option>
                      <option value="SUELTO">Suelto</option>
                    </select>
                  </div>
                  {tipoBulto === 'SUELTO' ? (
                    <Input
                      label="Cantidad suelta"
                      type="number"
                      min="1"
                      value={cantidadSuelta}
                      onChange={(e) => setCantidadSuelta(e.target.value)}
                      className="col-span-2 [&_label]:text-xs"
                      required
                    />
                  ) : (
                    <>
                      <Input
                        label={tipoBulto === 'PALLET' ? 'Cant. pallets' : 'Cant. cajas'}
                        type="number"
                        min="1"
                        value={cantidadBultos}
                        onChange={(e) => setCantidadBultos(e.target.value)}
                        className="[&_label]:text-xs"
                        required
                      />
                      <Input
                        label={
                          tipoBulto === 'PALLET' ? '× cajas por pallet' : '× botellas por caja'
                        }
                        type="number"
                        min="1"
                        value={unidadesPorBulto}
                        onChange={(e) => setUnidadesPorBulto(e.target.value)}
                        className="[&_label]:text-xs"
                        placeholder={tipoBulto === 'PALLET' ? '112' : '6'}
                        required
                      />
                      <Input
                        label={
                          tipoBulto === 'PALLET'
                            ? 'Cajas sueltas (opc.)'
                            : 'Botellas sueltas (opc.)'
                        }
                        type="number"
                        min="0"
                        value={cantidadSuelta}
                        onChange={(e) => setCantidadSuelta(e.target.value)}
                        className="[&_label]:text-xs"
                      />
                    </>
                  )}
                  <div className="col-span-2 flex items-end gap-2 sm:col-span-4">
                    {editingLocalId && (
                      <Button
                        type="button"
                        variant="secondary"
                        className="rounded-xl"
                        disabled={busy}
                        onClick={cancelarLineaForm}
                      >
                        Cancelar
                      </Button>
                    )}
                    <Button type="submit" className="w-full rounded-xl" disabled={busy}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      {editingLocalId ? 'Guardar' : 'Agregar línea'}
                    </Button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="relative z-0 min-h-0 flex-1 overflow-y-auto bg-white">{lineasListContent}</div>

      <div className="shrink-0 border-t border-surface-border bg-white px-4 py-4 shadow-[0_-4px_12px_rgba(0,0,0,0.04)] sm:px-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Total contado
            </p>
            <p className="text-lg font-bold tabular-nums text-brand-700 sm:text-2xl">{resumenGeneral}</p>
            <p className="mt-1 text-xs text-slate-500">
              {misLineasRonda.length} línea{misLineasRonda.length === 1 ? '' : 's'} ·{' '}
              {lineasPorProducto.length} producto{lineasPorProducto.length === 1 ? '' : 's'}
            </p>
          </div>
          {puedeEditar && misLineasRonda.length > 0 && (
            <Button className="shrink-0 rounded-xl" disabled={busy} onClick={() => void handleFinalizar()}>
              <Check className="h-4 w-4" />
              Finalicé este sector
            </Button>
          )}
        </div>
      </div>

      <BarcodeScannerModal
        open={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={handleScan}
        title="Escanear producto"
      />
      <BarcodeScannerModal
        open={showP2PQrScanner}
        onClose={() => setShowP2PQrScanner(false)}
        onScan={handleP2PQrScan}
        title="Escanear QR del compañero"
      />
    </div>
  )
}
