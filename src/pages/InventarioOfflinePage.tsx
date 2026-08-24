import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Calculator,
  Check,
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Hash,
  Layers,
  Loader2,
  MapPin,
  MoreVertical,
  Package,
  Pencil,
  Plus,
  Radio,
  Search,
  Share2,
  Trash2,
  Upload,
  Wifi,
  Box,
  X,
  Eye
} from 'lucide-react'
import { BottleIcon } from '@/components/icons/BottleIcon'
import { Share } from '@capacitor/share'
import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import QRCode from 'qrcode'
import { BarcodeScannerModal } from '@/components/BarcodeScannerModal'
import { ScrollableProductName } from '@/components/ScrollableProductName'
import { CantidadExprOperators } from '@/components/CantidadExprOperators'
import { SwipeableConteoLinea } from '@/components/SwipeableConteoLinea'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { api, cn } from '@/lib/utils'
import { scrollProductoIntoListVisible } from '@/lib/scroll'
import { filterProductosBySearchQuery, textoProductoMatches } from '@/lib/productoSearch'
import {
  scrollFocusedFieldIntoSheet,
  useKeyboardLayoutShrink,
  useVisualViewportBottomInset
} from '@/hooks/useVisualViewportBottomInset'
import { botellasPorCajaDefault, cajasPorPalletDefault, formatValorLineaConteo, formatTotalesInventarioResumen, formatTotalesInventarioFisicos, sumarTotalesInventarioFisicos } from '@/lib/desglose'
import {
  cantidadExprEsCuenta,
  conteoExprPendientes,
  evalCantidadExpr,
  resolveCantidadExprField
} from '@/lib/cantidadExpr'
import {
  addLineaOffline,
  buildMiSyncPayload,
  crearPaqueteImportacionPc,
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
  reabrirMiConteoAntesDeSync,
  recibirSyncCompanero,
  recuperarComparacionLocal,
  resetOfflineLocal,
  updateLineaOffline
} from '@/lib/inventarioOffline'
import {
  loadTecladoNumericoBusqueda,
  saveTecladoNumericoBusqueda
} from '@/lib/inventarioTeclado'
import {
  writePcImportShareFile,
  writeSyncShareFile
} from '@/lib/inventarioOffline/storage'
import {
  HOTSPOT_IP_TIPICA,
  P2P_PORT,
  loadLastHostIp,
  refreshP2PHostInfo,
  resolveDeviceLanIp,
  saveLastHostIp,
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

/** Desglose Vos/Compañero plegable; cerrado por defecto. */
function DesgloseDiferenciaColapsable({
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
  const [open, setOpen] = useState(false)
  const n1 = lineas1.length
  const n2 = lineas2.length
  return (
    <div>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left transition-colors hover:bg-slate-100"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-xs font-medium text-slate-700">
          {open ? 'Ocultar detalle de líneas' : 'Ver detalle de líneas'}
          <span className="ml-1 font-normal text-slate-500">
            ({n1} / {n2})
          </span>
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-slate-500 transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div className="mt-2">
          <DesgloseParaleloOffline
            titulo1={titulo1}
            titulo2={titulo2}
            lineas1={lineas1}
            lineas2={lineas2}
          />
        </div>
      )}
    </div>
  )
}

/** Pantalla completa del main (sin padding); solo la lista scrollea. */
const PAGE_SHELL =
  'flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-surface-muted/30'

export function InventarioOfflinePage() {
  const { sectorInvId: rawId } = useParams()
  const sectorInvId = Number(rawId)
  const navigate = useNavigate()
  const productSearchRef = useRef<HTMLInputElement>(null)
  const ubicacionSelectRef = useRef<HTMLSelectElement>(null)
  const listScrollRef = useRef<HTMLDivElement>(null)
  const productLineFormRef = useRef<HTMLDivElement>(null)
  const cantidadBultosRef = useRef<HTMLInputElement>(null)
  const unidadesPorBultoRef = useRef<HTMLInputElement>(null)
  const cantidadSueltaRef = useRef<HTMLInputElement>(null)
  /** Input fantasma: abre el teclado en el mismo toque, antes de montar el modal. */
  const keyboardBridgeRef = useRef<HTMLInputElement>(null)
  const pendingFocusCantidadRef = useRef(false)
  const pendingScrollProductoIdRef = useRef<number | null>(null)

  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [paquete, setPaquete] = useState<OfflinePaquete | null>(null)
  const [estado, setEstado] = useState<OfflineEstadoLocal | null>(null)
  const [sectorServer, setSectorServer] = useState<{
    estado: string
    importado_at: string | null
    sector_nombre: string
  } | null>(null)
  const [syncText, setSyncText] = useState('')
  const [showSyncImport, setShowSyncImport] = useState(false)
  const [showSyncMasOpciones, setShowSyncMasOpciones] = useState(false)
  const [showHeaderMenu, setShowHeaderMenu] = useState(false)
  const [tecladoNumerico, setTecladoNumerico] = useState(() => loadTecladoNumericoBusqueda())
  const [p2pMode, setP2pMode] = useState<'idle' | 'host' | 'client'>('idle')
  const [hostInfo, setHostInfo] = useState<{ url: string; localIp: string; port: number } | null>(
    null
  )
  /** Última IP del host (queda en el menú ⋮ aunque se cierre el panel). */
  const [ultimaIpHost, setUltimaIpHost] = useState<{ localIp: string; port: number } | null>(null)
  const [hostQrDataUrl, setHostQrDataUrl] = useState('')
  const [clientHostInput, setClientHostInput] = useState(HOTSPOT_IP_TIPICA)
  /** true si hay IP persistida de una sync/host anterior (no el default genérico). */
  const [tieneIpGuardada, setTieneIpGuardada] = useState(false)
  const [showP2PQrScanner, setShowP2PQrScanner] = useState(false)
  const [hostSyncedOk, setHostSyncedOk] = useState(false)
  const [hostReintentosOpen, setHostReintentosOpen] = useState(false)
  const hostAutoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hostIpPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hostInfoRef = useRef<{ url: string; localIp: string; port: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [expandedProductos, setExpandedProductos] = useState<Set<number>>(new Set())
  const [revisadosProductos, setRevisadosProductos] = useState<Set<number>>(new Set())
  const [expandedDesgloseRef, setExpandedDesgloseRef] = useState<Set<number>>(new Set())
  const [swipeOpenLineId, setSwipeOpenLineId] = useState<string | null>(null)
  const [showVistaPrevia, setShowVistaPrevia] = useState(false)
  const [vistaPreviaSearch, setVistaPreviaSearch] = useState('')

  const [productSearch, setProductSearch] = useState('')
  const [selected, setSelected] = useState<OfflineProducto | null>(null)
  const [editingLocalId, setEditingLocalId] = useState<string | null>(null)
  const [tipoBulto, setTipoBulto] = useState<TipoBultoOffline>('PALLET')
  const [cantidadBultos, setCantidadBultos] = useState('')
  const [unidadesPorBulto, setUnidadesPorBulto] = useState('')
  const [cantidadSuelta, setCantidadSuelta] = useState('')
  const [ubicacionId, setUbicacionId] = useState('')
  const [cantidadExprFocus, setCantidadExprFocus] = useState<
    'bultos' | 'unidades' | 'suelta' | null
  >(null)
  const [totalVistaFisica, setTotalVistaFisica] = useState(false)
  const keyboardInset = useVisualViewportBottomInset()
  const keyboardLayoutShrink = useKeyboardLayoutShrink()
  const pinConteoFooterUnderKeyboard = keyboardLayoutShrink > 0 || Boolean(selected)

  const reload = useCallback(async () => {
    const data = await getOfflineSession(sectorInvId)
    setPaquete(data.paquete)
    setEstado(data.estado)

    if (!data.paquete) {
      try {
        const res = await api<{
          sector: {
            estado: string
            importado_at?: string | null
            sector_nombre?: string
          }
        }>(`/api/inventario/sectores/${sectorInvId}`, { timeoutMs: 12000 })
        setSectorServer({
          estado: String(res.sector.estado),
          importado_at: res.sector.importado_at ?? null,
          sector_nombre: res.sector.sector_nombre ?? `Sector #${sectorInvId}`
        })
      } catch {
        setSectorServer(null)
      }
    } else {
      setSectorServer(null)
    }
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
      if (hostIpPollRef.current) clearInterval(hostIpPollRef.current)
      void stopP2PHost()
    }
  }, [])

  useEffect(() => {
    void (async () => {
      const saved = await loadLastHostIp()
      if (saved) {
        setUltimaIpHost(saved)
        setTieneIpGuardada(true)
        setClientHostInput(saved.localIp)
      } else {
        // Mostrar algo útil de inmediato; luego se actualiza al abrir el menú.
        setUltimaIpHost({ localIp: HOTSPOT_IP_TIPICA, port: P2P_PORT })
      }
    })()
  }, [])

  useEffect(() => {
    if (!msg) return
    const t = window.setTimeout(() => setMsg(''), 4000)
    return () => window.clearTimeout(t)
  }, [msg])

  /** Atrás del celular cierra la vista previa (vuelve al sync), no sale del sector. */
  useEffect(() => {
    if (!showVistaPrevia) return

    const state = window.history.state as { bodegaVistaPrevia?: boolean } | null
    if (!state?.bodegaVistaPrevia) {
      window.history.pushState({ bodegaVistaPrevia: true }, '')
    }

    const onPopState = () => {
      setShowVistaPrevia(false)
      setVistaPreviaSearch('')
    }
    window.addEventListener('popstate', onPopState)

    let removeCap: (() => void) | undefined
    if (Capacitor.isNativePlatform()) {
      void CapApp.addListener('backButton', () => {
        window.history.back()
      }).then((handle) => {
        removeCap = () => {
          void handle.remove()
        }
      })
    }

    return () => {
      window.removeEventListener('popstate', onPopState)
      removeCap?.()
    }
  }, [showVistaPrevia])

  function closeVistaPrevia() {
    const state = window.history.state as { bodegaVistaPrevia?: boolean } | null
    if (state?.bodegaVistaPrevia) {
      window.history.back()
      return
    }
    setShowVistaPrevia(false)
    setVistaPreviaSearch('')
  }

  function clearHostAutoStop() {
    if (hostAutoStopRef.current) {
      clearTimeout(hostAutoStopRef.current)
      hostAutoStopRef.current = null
    }
  }

  function clearHostIpPoll() {
    if (hostIpPollRef.current) {
      clearInterval(hostIpPollRef.current)
      hostIpPollRef.current = null
    }
  }

  async function applyHostInfo(info: { url: string; localIp: string; port: number }) {
    hostInfoRef.current = info
    setHostInfo(info)
    setUltimaIpHost({ localIp: info.localIp, port: info.port })
    void saveLastHostIp({ localIp: info.localIp, port: info.port })
    try {
      const qr = await QRCode.toDataURL(info.url, { width: 220, margin: 1 })
      setHostQrDataUrl(qr)
    } catch {
      setHostQrDataUrl('')
    }
  }

  async function refrescarIpEnMenu() {
    try {
      const resolved = await resolveDeviceLanIp()
      setUltimaIpHost({ localIp: resolved.localIp, port: resolved.port })
    } catch {
      /* ignore */
    }
  }

  async function copiarIpHost() {
    let ip = ultimaIpHost?.localIp ?? hostInfo?.localIp
    let port = ultimaIpHost?.port ?? hostInfo?.port ?? P2P_PORT
    if (!ip) {
      try {
        const resolved = await resolveDeviceLanIp()
        ip = resolved.localIp
        port = resolved.port
        setUltimaIpHost({ localIp: ip, port })
      } catch {
        ip = HOTSPOT_IP_TIPICA
        port = P2P_PORT
      }
    }
    const text = `${ip}:${port}`
    try {
      await navigator.clipboard.writeText(text)
      setMsg(`IP copiada: ${text} — el compañero la pega en «Unirme a la conexión»`)
    } catch {
      setMsg(`IP de este celular: ${text}`)
    }
    setShowHeaderMenu(false)
  }

  function startHostIpPolling() {
    clearHostIpPoll()
    let ticks = 0
    hostIpPollRef.current = setInterval(() => {
      ticks += 1
      if (ticks > 40) {
        clearHostIpPoll()
        return
      }
      void (async () => {
        const fresh = await refreshP2PHostInfo()
        if (!fresh) return
        const prev = hostInfoRef.current
        if (prev && prev.localIp === fresh.localIp && prev.port === fresh.port) return
        await applyHostInfo(fresh)
        setMsg(`IP actualizada: ${fresh.localIp}. Mostrá este QR al compañero.`)
      })()
    }, 1500)
  }

  async function shutdownHostUi(message?: string) {
    clearHostAutoStop()
    clearHostIpPoll()
    await stopP2PHost()
    hostInfoRef.current = null
    setHostInfo(null)
    setHostQrDataUrl('')
    setHostSyncedOk(false)
    setHostReintentosOpen(false)
    setP2pMode('idle')
    if (message) setMsg(message)
  }

  function toggleTecladoNumerico() {
    const next = !tecladoNumerico
    setTecladoNumerico(next)
    saveTecladoNumericoBusqueda(next)
    setShowHeaderMenu(false)
    const el = productSearchRef.current
    if (el && document.activeElement === el) {
      el.blur()
      setTimeout(() => el.focus(), 60)
    }
  }

  async function handleBorrarEnEsteCelular() {
    if (
      !confirm(
        '¿Borrar el conteo solo en ESTE celular?\n\n' +
          'Se elimina el paquete y todo lo contado aquí. Tu compañero y el PC no se modifican.\n\n' +
          'Después cerrá sesión, entrá con la cuenta correcta y descargá el paquete de nuevo.'
      )
    ) {
      return
    }
    setBusy(true)
    setError('')
    setMsg('')
    try {
      await shutdownHostUi()
      await resetOfflineLocal(sectorInvId)
      setP2pMode('idle')
      setHostSyncedOk(false)
      setClientHostInput(HOTSPOT_IP_TIPICA)
      await reload()
      setMsg(
        'Listo en este celular. Cerrá sesión, entrá con la cuenta del contador que te corresponde y descargá el paquete.'
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo borrar el conteo local')
    } finally {
      setBusy(false)
    }
  }

  const productosFiltrados = useMemo(() => {
    if (!paquete) return []
    const q = productSearch.trim()
    if (!q || selected) return []
    return filterProductosBySearchQuery(paquete.productos, q).slice(0, 20)
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

  const lineasPorProductoVistaPrevia = useMemo(() => {
    const q = vistaPreviaSearch.trim()
    if (!q) return lineasPorProducto
    return lineasPorProducto.filter(
      (g) =>
        textoProductoMatches({ codigo_interno: g.codigo, nombre: g.nombre }, q) ||
        g.lineas.some((l) => (l.ubicacion ?? '').toLowerCase().includes(q.toLowerCase()))
    )
  }, [lineasPorProducto, vistaPreviaSearch])

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
  const resumenFisico = useMemo(
    () => formatTotalesInventarioFisicos(sumarTotalesInventarioFisicos(misLineasRonda)),
    [misLineasRonda]
  )

  const verificacionSimple =
    String(paquete?.inventario_sector.modo_verificacion ?? 'DOBLE') === 'SIMPLE'
  const puedeEditar = Boolean(paquete && estado && !estado.mi_finalizo)
  const postConteo = Boolean(estado?.mi_finalizo)
  const enReconteo = (estado?.ronda_actual ?? 1) > 1
  const miRol = paquete?.inventario_sector.mi_rol
  const miContadorLabel = useMemo(() => {
    if (!paquete || !miRol) return null
    const sectorInv = paquete.inventario_sector
    const nombre = miRol === 1 ? sectorInv.contador_1_nombre : sectorInv.contador_2_nombre
    return `C${miRol} · ${nombre}`
  }, [paquete, miRol])
  const usaUbicaciones = Boolean(
    paquete?.inventario_sector.usa_ubicaciones && paquete.ubicaciones.length > 0
  )
  const ubicacionSeleccionada = useMemo(
    () => paquete?.ubicaciones.find((u) => u.id === Number(ubicacionId)) ?? null,
    [paquete, ubicacionId]
  )

  useEffect(() => {
    setRevisadosProductos(new Set())
  }, [sectorInvId, estado?.ronda_actual])

  function markProductoRevisado(productoId: number) {
    if (!enReconteo) return
    setRevisadosProductos((prev) => {
      if (prev.has(productoId)) return prev
      return new Set(prev).add(productoId)
    })
  }

  function toggleProductoExpand(productoId: number) {
    const opening = !expandedProductos.has(productoId)
    setExpandedProductos((prev) => {
      const next = new Set(prev)
      if (next.has(productoId)) next.delete(productoId)
      else next.add(productoId)
      return next
    })
    if (opening) markProductoRevisado(productoId)
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
    if (tipo === 'PALLET') {
      return String(cajasPorPalletDefault(p?.unidades_por_pallet_default))
    }
    return String(botellasPorCajaDefault(p?.unidades_por_caja_default))
  }

  function armKeyboardForCantidadModal() {
    pendingFocusCantidadRef.current = true
    // Abrir teclado YA (gesto del usuario), antes de que React monte el modal
    keyboardBridgeRef.current?.focus({ preventScroll: true })
  }

  function focusCantidadEnModal(tipo: TipoBultoOffline = 'PALLET') {
    const el = tipo === 'SUELTO' ? cantidadSueltaRef.current : cantidadBultosRef.current
    el?.focus({ preventScroll: true })
    if (el) {
      scrollFocusedFieldIntoSheet(el, 0)
      requestAnimationFrame(() => el.select())
    }
  }

  function selectProduct(p: OfflineProducto) {
    armKeyboardForCantidadModal()
    setSelected(p)
    setProductSearch(p.codigo_interno)
    if (!editingLocalId) {
      setCantidadBultos('')
      setCantidadSuelta('')
      setUnidadesPorBulto(
        tipoBulto === 'SUELTO' ? '' : defaultUnidadesPorBulto(tipoBulto, p)
      )
    }
  }

  useEffect(() => {
    if (!selected || !pendingFocusCantidadRef.current) return
    pendingFocusCantidadRef.current = false
    const id = window.requestAnimationFrame(() => focusCantidadEnModal(tipoBulto))
    return () => window.cancelAnimationFrame(id)
  }, [selected, editingLocalId, tipoBulto])

  function handleTipoBultoChange(tipo: TipoBultoOffline) {
    const targetEl =
      tipo === 'SUELTO' ? cantidadSueltaRef.current : cantidadBultosRef.current
    // Si el input con foco se va a ocultar (Caja/Pallet → Suelto), mover el foco
    // ANTES del setState. Si no, Android cierra y reabre el teclado (salto).
    if (targetEl && document.activeElement !== targetEl) {
      targetEl.focus({ preventScroll: true })
    }

    setTipoBulto(tipo)
    if (tipo === 'SUELTO') {
      setUnidadesPorBulto('')
      setCantidadBultos('')
    } else {
      setUnidadesPorBulto(defaultUnidadesPorBulto(tipo, selected))
    }

    requestAnimationFrame(() => {
      const el =
        tipo === 'SUELTO' ? cantidadSueltaRef.current : cantidadBultosRef.current
      if (!el) return
      if (document.activeElement !== el) el.focus({ preventScroll: true })
      scrollFocusedFieldIntoSheet(el, 0)
      el.select()
    })
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
    setUbicacionId(
      l.ubicacion_id != null
        ? String(l.ubicacion_id)
        : String(paquete.ubicaciones.find((u) => u.nombre === l.ubicacion)?.id ?? '')
    )
    if (l.tipo_bulto === 'SUELTO') {
      setCantidadBultos('')
      setUnidadesPorBulto('')
      setCantidadSuelta(String(l.cantidad_suelta ?? l.total_unidades ?? ''))
    } else {
      setCantidadBultos(String(l.cantidad_bultos ?? ''))
      setUnidadesPorBulto(String(l.unidades_por_bulto ?? ''))
      setCantidadSuelta(l.cantidad_suelta != null ? String(l.cantidad_suelta) : '')
    }
    setExpandedProductos((prev) => new Set([l.producto_id]))
    markProductoRevisado(l.producto_id)
    armKeyboardForCantidadModal()
    // selected ya se setea arriba; el effect mueve el foco al campo de cantidad
  }

  function empezarAgregarLineaProducto(productoId: number) {
    if (!paquete) return
    const prod = paquete.productos.find((p) => p.id === productoId)
    if (!prod) {
      setError('Producto no está en el paquete offline')
      return
    }
    setError('')
    setEditingLocalId(null)
    setExpandedProductos(new Set([productoId]))
    markProductoRevisado(productoId)
    selectProduct(prod)
  }

  function cancelarLineaForm() {
    setEditingLocalId(null)
    setSelected(null)
    setProductSearch('')
    setCantidadBultos('')
    setCantidadSuelta('')
    setUnidadesPorBulto(
      tipoBulto === 'SUELTO' ? '' : defaultUnidadesPorBulto(tipoBulto, null)
    )
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
    if (usaUbicaciones && !ubicacionSeleccionada) {
      setError('Seleccioná la ubicación dentro del sector')
      ubicacionSelectRef.current?.focus()
      return
    }

    if (
      conteoExprPendientes({
        tipo: tipoBulto,
        cantidadBultos,
        unidadesPorBulto,
        cantidadSuelta
      })
    ) {
      aplicarCuentasConteo()
      return
    }

    setBusy(true)
    setError('')
    try {
      let unidadesValor =
        tipoBulto === 'SUELTO' ? null : Number(unidadesPorBulto) || 0
      let sueltaValor: number | null =
        tipoBulto === 'SUELTO'
          ? Number(cantidadSuelta) || 0
          : Number(cantidadSuelta) || null
      let bultosValor: number | null =
        tipoBulto === 'SUELTO' ? null : Number(cantidadBultos) || 0

      if (tipoBulto === 'PALLET') {
        const porPallet = resolveCantidadExprField(unidadesPorBulto, { min: 1 })
        if (porPallet.value == null) {
          setError(porPallet.error ?? 'Cajas por pallet inválidas')
          setBusy(false)
          return
        }
        unidadesValor = porPallet.value
        setUnidadesPorBulto(porPallet.text)

        if (cantidadSuelta.trim()) {
          const sueltas = resolveCantidadExprField(cantidadSuelta, { min: 0 })
          if (sueltas.value == null) {
            setError(sueltas.error ?? 'Cajas sueltas inválidas')
            setBusy(false)
            return
          }
          sueltaValor = sueltas.value
          setCantidadSuelta(sueltas.text)
        } else {
          sueltaValor = null
        }
      } else if (tipoBulto === 'CAJA') {
        const cajas = resolveCantidadExprField(cantidadBultos, { min: 1 })
        if (cajas.value == null) {
          setError(cajas.error ?? 'Cantidad de cajas inválida')
          setBusy(false)
          return
        }
        bultosValor = cajas.value
        setCantidadBultos(cajas.text)
        const porCaja =
          Number(unidadesPorBulto) > 0
            ? Number(unidadesPorBulto)
            : Number(defaultUnidadesPorBulto('CAJA', selected))
        if (!Number.isFinite(porCaja) || porCaja <= 0) {
          setError('No hay botellas por caja definidas para este producto')
          setBusy(false)
          return
        }
        unidadesValor = porCaja
      }

      const input = {
        producto_id: selected.id,
        tipo_bulto: tipoBulto,
        cantidad_bultos: bultosValor,
        unidades_por_bulto: unidadesValor,
        cantidad_suelta: sueltaValor,
        ubicacion: ubicacionSeleccionada?.nombre ?? null,
        ubicacion_id: ubicacionSeleccionada?.id ?? null
      }
      const linea = editingLocalId
        ? await updateLineaOffline(sectorInvId, editingLocalId, input)
        : await addLineaOffline(sectorInvId, input)
      pendingScrollProductoIdRef.current = linea.producto_id
      setExpandedProductos(new Set([linea.producto_id]))
      cancelarLineaForm()
      await reload()
      const id = pendingScrollProductoIdRef.current
      pendingScrollProductoIdRef.current = null
      scrollProductoIntoListVisible(listScrollRef.current, id, {
        marginBottom: 24,
        delayMs: 320
      })
      setTimeout(() => productSearchRef.current?.focus(), 100)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar línea')
    } finally {
      setBusy(false)
    }
  }

  function aplicarCuentasConteo(): boolean {
    const keepFocus =
      document.activeElement instanceof HTMLInputElement ? document.activeElement : null

    const restoreTeclado = () => {
      requestAnimationFrame(() => {
        const el =
          keepFocus && document.contains(keepFocus)
            ? keepFocus
            : tipoBulto === 'CAJA'
              ? cantidadBultosRef.current
              : unidadesPorBultoRef.current ?? cantidadSueltaRef.current
        el?.focus({ preventScroll: true })
      })
    }

    if (tipoBulto === 'CAJA') {
      const cajas = resolveCantidadExprField(cantidadBultos, { min: 1 })
      if (cajas.value == null) {
        setError(cajas.error ?? 'Cantidad de cajas inválida')
        restoreTeclado()
        return false
      }
      setCantidadBultos(cajas.text)
      setError('')
      restoreTeclado()
      return true
    }

    const porPallet = resolveCantidadExprField(unidadesPorBulto, { min: 1 })
    if (porPallet.value == null) {
      setError(porPallet.error ?? 'Cajas por pallet inválidas')
      restoreTeclado()
      return false
    }
    setUnidadesPorBulto(porPallet.text)

    if (cantidadSuelta.trim()) {
      const sueltas = resolveCantidadExprField(cantidadSuelta, { min: 0 })
      if (sueltas.value == null) {
        setError(sueltas.error ?? 'Cajas sueltas inválidas')
        restoreTeclado()
        return false
      }
      setCantidadSuelta(sueltas.text)
    }
    setError('')
    restoreTeclado()
    return true
  }

  const cuentasPendientes = conteoExprPendientes({
    tipo: tipoBulto,
    cantidadBultos,
    unidadesPorBulto,
    cantidadSuelta
  })

  async function handleFinalizar() {
    if (enReconteo && misLineasRonda.length === 0) {
      if (
        !confirm(
          'No cargaste líneas en esta ronda: los productos del reconteo quedan en 0. ¿Finalizar así?'
        )
      ) {
        return
      }
    } else if (!confirm('¿Finalizaste el conteo de este sector?')) {
      return
    }
    setBusy(true)
    setError('')
    try {
      await finalizarMiRonda(sectorInvId)
      await reload()
      setMsg(
        verificacionSimple
          ? 'Finalizaste. Ya podés importar el resultado al PC.'
          : 'Finalizaste. Sincronizá con el compañero.'
      )
      setP2pMode('idle')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al finalizar')
    } finally {
      setBusy(false)
    }
  }

  async function handleReabrirConteo() {
    if (
      !confirm(
        verificacionSimple
          ? '¿Volver a editar el conteo? Se desmarca tu finalización.'
          : '¿Volver a editar el conteo? Se desmarca tu finalización. Solo antes de sincronizar con el compañero.'
      )
    ) {
      return
    }
    setBusy(true)
    setError('')
    setMsg('')
    try {
      await shutdownHostUi()
      await reabrirMiConteoAntesDeSync(sectorInvId)
      await reload()
      setP2pMode('idle')
      closeVistaPrevia()
      setMsg('Podés seguir editando el conteo.')
      setTimeout(() => productSearchRef.current?.focus(), 80)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo reabrir el conteo')
    } finally {
      setBusy(false)
    }
  }

  async function onP2PSynced() {
    clearHostIpPoll()
    clearHostAutoStop()
    try {
      await reload()
      const data = await getOfflineSession(sectorInvId)
      if (data.estado && puedeRecuperarComparacionLocal(data.estado)) {
        await recuperarComparacionLocal(sectorInvId)
      }
      await reload()
      setHostSyncedOk(true)
      setHostReintentosOpen(false)
      setMsg(
        'Datos recibidos. Dejá el hotspot prendido hasta que el compañero también vea la comparación (puede reintentar).'
      )
      // No apagar el servidor ya: si al otro se le cortó la red, necesita
      // volver a pedir el resultado. Auto-cierre a los 3 minutos.
      hostAutoStopRef.current = setTimeout(() => {
        void shutdownHostUi('Host cerrado. La comparación ya está en este celular.')
      }, 3 * 60 * 1000)
    } catch {
      setHostSyncedOk(true)
      setHostReintentosOpen(false)
      setMsg('Sincronizado. Dejá el hotspot un momento por si el otro reintenta.')
    }
  }

  async function handleStartHost() {
    setBusy(true)
    setError('')
    setMsg('')
    setHostSyncedOk(false)
    setHostReintentosOpen(false)
    clearHostAutoStop()
    clearHostIpPoll()
    try {
      if (!Capacitor.isNativePlatform()) {
        throw new Error('El sync por hotspot funciona en la APK. En el navegador usá el respaldo por archivo.')
      }
      const info = await startP2PHost(sectorInvId, () => {
        void onP2PSynced()
      })
      setP2pMode('host')
      await applyHostInfo(info)
      startHostIpPolling()
      setMsg(
        'Primero activá el hotspot. La IP/QR se actualiza sola cuando la red del hotspot queda lista.'
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar el host')
      setP2pMode('idle')
      hostInfoRef.current = null
      setHostInfo(null)
    } finally {
      setBusy(false)
    }
  }

  async function handleRefreshHostIp() {
    setBusy(true)
    setError('')
    try {
      const fresh = await refreshP2PHostInfo()
      if (!fresh) {
        throw new Error('No se pudo leer la IP. Activá el hotspot e intentá de nuevo.')
      }
      await applyHostInfo(fresh)
      setMsg(`IP actual: ${fresh.localIp}. Mostrá este QR al compañero.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar la IP')
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

  function extractHostIp(raw: string): string {
    const v = raw.trim()
    if (!v) return ''
    try {
      const withProtocol = /^https?:\/\//i.test(v) ? v : `http://${v}`
      return new URL(withProtocol).hostname
    } catch {
      return v.split('/')[0]?.split(':')[0] ?? v
    }
  }

  async function handleConnectClient() {
    setBusy(true)
    setError('')
    setMsg('')
    try {
      const localIp = extractHostIp(clientHostInput)
      if (!localIp) throw new Error('Ingresá la IP del compañero')
      await syncConHost(sectorInvId, `${localIp}:${P2P_PORT}`)
      await saveLastHostIp({ localIp, port: P2P_PORT })
      setUltimaIpHost({ localIp, port: P2P_PORT })
      setTieneIpGuardada(true)
      setClientHostInput(localIp)
      setP2pMode('idle')
      await reload()
      setMsg('Sincronizado.')
    } catch (e) {
      setError(
        e instanceof Error
          ? `${e.message} Conectate al hotspot del compañero y tocá Reintentar. Si el otro ya vio la comparación, que deje el host activo.`
          : 'No se pudo sincronizar'
      )
    } finally {
      setBusy(false)
    }
  }

  function abrirModoCliente() {
    setP2pMode('client')
    if (ultimaIpHost) {
      setClientHostInput(ultimaIpHost.localIp)
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
      const localIp = url.hostname
      setClientHostInput(localIp)
      setUltimaIpHost({ localIp, port: P2P_PORT })
      setTieneIpGuardada(true)
      void saveLastHostIp({ localIp, port: P2P_PORT })
      setMsg('QR leído. IP guardada para la próxima vez.')
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

  async function handleGuardarArchivoParaPc() {
    setBusy(true)
    setError('')
    try {
      const payload = await crearPaqueteImportacionPc(sectorInvId)
      const { json, fileName, uri } = await writePcImportShareFile(payload)

      if (Capacitor.isNativePlatform() && uri) {
        await Share.share({
          title: fileName,
          text: 'Respaldo final de inventario para importar en ControlStock PC',
          url: uri,
          dialogTitle: 'Guardar o enviar archivo para la PC'
        })
      } else {
        const blob = new Blob([json], { type: 'application/json' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = fileName
        a.click()
        URL.revokeObjectURL(a.href)
      }
      setMsg(`Archivo de respaldo listo: ${fileName}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar el archivo para la PC')
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
      <div className="flex h-full min-h-0 flex-1 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    )
  }

  // Sin paquete: ya importado, o descarga (oficina)
  if (!paquete) {
    const yaImportado =
      Boolean(sectorServer?.importado_at) || sectorServer?.estado === 'CERRADO_OK'

    return (
      <div className={PAGE_SHELL}>
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
              <p className="text-xs text-slate-500">
                {sectorServer?.sector_nombre ?? `Sector #${sectorInvId}`}
              </p>
            </div>
            <span
              className={cn(
                'ml-auto rounded-full px-2.5 py-1 text-xs font-medium ring-1',
                yaImportado
                  ? 'bg-emerald-50 text-emerald-800 ring-emerald-100'
                  : 'bg-amber-50 text-amber-900 ring-amber-100'
              )}
            >
              {yaImportado ? 'Listo' : 'Offline'}
            </span>
          </div>
        </div>
        {error && (
          <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
        )}
        {msg && (
          <div className="border-b border-emerald-100 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
            {msg}
          </div>
        )}
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          {yaImportado ? (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                <Check className="h-6 w-6" />
              </div>
              <div className="max-w-sm space-y-2">
                <p className="text-sm font-medium text-slate-800">Conteo ya enviado al PC</p>
                <p className="text-xs text-slate-500">
                  Este sector está cerrado entre contadores. No hace falta volver a descargar ni
                  contar: el resultado ya quedó guardado en la computadora.
                </p>
              </div>
              <Button onClick={() => navigate('/inventario')}>Volver a inventario</Button>
            </>
          ) : (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
                <Download className="h-6 w-6" />
              </div>
              <div className="max-w-sm space-y-2">
                <p className="text-sm font-medium text-slate-800">Descargar paquete del sector</p>
                <p className="text-xs text-slate-500">
                  Con WiFi al PC (oficina): bajá catálogo y datos del sector. Cada contador entra
                  con su usuario; después contás sin red, con la misma vista que el inventario online.
                </p>
              </div>
              <Button disabled={busy} onClick={() => void handleDescargar()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Descargar paquete
              </Button>
            </>
          )}
        </div>
      </div>
    )
  }

  const sector = paquete.inventario_sector
  const ronda = estado?.ronda_actual ?? 1

  const renderGruposList = (grupos: typeof lineasPorProducto) =>
    grupos.length === 0 ? (
      <div className="flex h-full min-h-[140px] flex-col items-center justify-center px-6 py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <Package className="h-6 w-6" />
        </div>
        <p className="mt-3 text-sm font-medium text-slate-600">
          {vistaPreviaSearch.trim() ? 'Sin resultados' : 'Sin líneas cargadas'}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {vistaPreviaSearch.trim()
            ? 'Probá otro código o nombre'
            : 'Cada conteo es una línea independiente'}
        </p>
      </div>
    ) : (
      grupos.map((grupo) => {
        const isExpanded = expandedProductos.has(grupo.producto_id)
        const isRevisado = enReconteo && revisadosProductos.has(grupo.producto_id)
        const ref = grupo.referencia
        return (
          <div
            key={grupo.producto_id}
            data-producto-id={grupo.producto_id}
            className={cn(
              'border-b border-surface-border last:border-0',
              isRevisado &&
                'border-l-[5px] border-l-emerald-600 bg-emerald-100 shadow-[inset_0_0_0_1px_rgba(5,150,105,0.45)]'
            )}
          >
            <div
              className={cn(
                'flex items-center gap-3 px-4 py-3 transition-colors sm:px-5',
                isExpanded && !isRevisado && 'bg-brand-50/50',
                isRevisado && 'bg-emerald-100',
                !isExpanded && !isRevisado && 'hover:bg-slate-50/80'
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
                <ScrollableProductName className="mt-1 text-sm font-semibold text-slate-900">
                  {grupo.nombre}
                </ScrollableProductName>
                {!isExpanded && grupo.lineas.length > 1 && (
                  <p className="mt-0.5 text-xs text-slate-500">{grupo.lineas.length} líneas</p>
                )}
              </button>
              <span className="inline-flex shrink-0 items-center rounded-lg bg-brand-50 px-2.5 py-1.5 text-sm font-bold tabular-nums text-brand-700 ring-1 ring-brand-100">
                {grupo.resumen}
              </span>
            </div>
            {isExpanded && (
              <div
                className={cn(
                  'space-y-2 border-t px-4 py-3 sm:px-5',
                  isRevisado
                    ? 'border-emerald-200/80 bg-gradient-to-b from-emerald-100 to-emerald-50/90'
                    : 'border-brand-100/80 bg-gradient-to-b from-surface-muted/40 to-white'
                )}
              >
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
                  <div className="rounded-lg border border-dashed border-amber-200 bg-amber-50/40 px-3 py-4 text-center">
                    <p className="text-sm text-slate-600">
                      Sin líneas en esta ronda
                      {enReconteo ? ' (contaste cero o no lo cargaste)' : ''}
                    </p>
                    {puedeEditar && (
                      <Button
                        type="button"
                        size="sm"
                        className="mt-2 rounded-xl"
                        onClick={() => empezarAgregarLineaProducto(grupo.producto_id)}
                      >
                        <Plus className="h-4 w-4" />
                        Agregar línea
                      </Button>
                    )}
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {grupo.lineas.map((l, idx) => (
                      <SwipeableConteoLinea
                        key={l.local_id}
                        disabled={!puedeEditar}
                        open={swipeOpenLineId === l.local_id}
                        onOpenChange={(open) => setSwipeOpenLineId(open ? l.local_id : null)}
                        onEdit={() => empezarEditarLinea(l)}
                        onDelete={() => {
                          setSwipeOpenLineId(null)
                          void deleteLineaOffline(sectorInvId, l.local_id).then(reload)
                        }}
                      >
                        <div className="min-w-0 flex-1 text-slate-800">
                          <span className="text-xs text-slate-400">{idx + 1}.</span> {l.etiqueta}
                          {l.ubicacion && (
                            <span className="ml-1.5 text-xs text-slate-500">({l.ubicacion})</span>
                          )}
                        </div>
                        <span className="shrink-0 rounded-md bg-slate-50 px-2 py-1 text-sm font-semibold tabular-nums text-slate-900 ring-1 ring-surface-border">
                          {formatValorLineaConteo(l)}
                        </span>
                      </SwipeableConteoLinea>
                    ))}
                    {puedeEditar && (
                      <li>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="w-full rounded-xl"
                          onClick={() => empezarAgregarLineaProducto(grupo.producto_id)}
                        >
                          <Plus className="h-4 w-4" />
                          Agregar otra línea
                        </Button>
                      </li>
                    )}
                  </ul>
                )}
              </div>
            )}
          </div>
        )
      })
    )

  const lineasListContent = renderGruposList(lineasPorProducto)

  return (
    <div className={PAGE_SHELL}>
      <div
        className={cn(
          'relative z-20 overflow-visible border-b border-surface-border bg-white shadow-sm',
          postConteo ? 'flex min-h-0 flex-1 flex-col' : 'shrink-0'
        )}
      >
        <div className="border-b border-brand-100 bg-gradient-to-r from-brand-50/80 via-white to-white px-3 py-1.5 sm:px-4">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                <h1 className="min-w-0 shrink truncate text-sm font-semibold leading-tight text-slate-900">
                  {sector.sector_nombre}
                </h1>
                <div className="flex min-w-0 items-center gap-1 overflow-x-auto text-[10px] scrollbar-none">
                  <span className="shrink-0 rounded-full bg-white px-2 py-0.5 font-medium text-slate-700 ring-1 ring-surface-border">
                    Ronda {ronda}
                  </span>
                  {miContadorLabel && (
                    <span className="shrink-0 rounded-full bg-violet-50 px-2 py-0.5 font-medium text-violet-900 ring-1 ring-violet-100">
                      {miContadorLabel}
                    </span>
                  )}
                  <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-900 ring-1 ring-amber-100">
                    Offline
                  </span>
                  {verificacionSimple && (
                    <span className="shrink-0 rounded-full bg-sky-50 px-2 py-0.5 font-medium text-sky-800 ring-1 ring-sky-100">
                      Simple
                    </span>
                  )}
                  {estado?.mi_finalizo && (
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-800 ring-1 ring-emerald-100">
                      Finalizado
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="relative shrink-0">
              <button
                type="button"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                disabled={busy}
                aria-label="Más opciones"
                aria-expanded={showHeaderMenu}
                onClick={() => {
                  setShowHeaderMenu((v) => {
                    const next = !v
                    if (next) void refrescarIpEnMenu()
                    return next
                  })
                }}
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </button>
              {showHeaderMenu && (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-30 cursor-default"
                    aria-label="Cerrar menú"
                    onClick={() => setShowHeaderMenu(false)}
                  />
                  <div className="absolute right-0 z-40 mt-1 w-64 overflow-hidden rounded-xl border border-surface-border bg-white py-1 shadow-lg">
                    <button
                      type="button"
                      className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                      onClick={toggleTecladoNumerico}
                    >
                      <Hash className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span>
                        <span className="block font-medium">
                          {tecladoNumerico ? 'Teclado de letras' : 'Teclado numérico'}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">
                          {tecladoNumerico
                            ? 'Volver al teclado completo para buscar por nombre'
                            : 'Números y guion — útil para códigos y cosecha'}
                        </span>
                      </span>
                    </button>
                    {!verificacionSimple && (
                    <button
                      type="button"
                      className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                      onClick={() => void copiarIpHost()}
                    >
                      <Copy className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span>
                        <span className="block font-medium">IP para el compañero</span>
                        <span className="mt-0.5 block font-mono text-sm font-semibold leading-snug text-brand-700">
                          {(ultimaIpHost ?? hostInfo)
                            ? `${(ultimaIpHost ?? hostInfo)!.localIp}:${(ultimaIpHost ?? hostInfo)!.port}`
                            : `${HOTSPOT_IP_TIPICA}:${P2P_PORT}`}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">
                          Tocá para copiar · el otro celu la pega en «Unirme a la conexión»
                        </span>
                      </span>
                    </button>
                    )}
                    <button
                      type="button"
                      className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      disabled={busy}
                      onClick={() => {
                        setShowHeaderMenu(false)
                        void handleBorrarEnEsteCelular()
                      }}
                    >
                      <Trash2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span>
                        <span className="block font-medium">Reiniciar en este celular</span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">
                          {verificacionSimple
                            ? 'Borra el paquete local. No afecta al PC.'
                            : 'Borra el paquete local. No afecta al compañero ni al PC.'}
                        </span>
                      </span>
                    </button>
                  </div>
                </>
              )}
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

        <div className={cn(postConteo && 'min-h-0 flex-1 overflow-y-auto')}>
        {puedeRecuperarComparacion && !comparacion && !verificacionSimple && (
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

        {p2pMode === 'host' && hostSyncedOk && (
          <div className="border-b border-emerald-200 bg-emerald-50">
            <button
              type="button"
              className="flex w-full items-center gap-2 px-4 py-2 text-left sm:px-5"
              aria-expanded={hostReintentosOpen}
              onClick={() => setHostReintentosOpen((v) => !v)}
            >
              <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-600" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-emerald-950">
                Host activo para reintentos
              </span>
              <ChevronDown
                className={cn(
                  'h-4 w-4 shrink-0 text-emerald-700 transition-transform',
                  hostReintentosOpen && 'rotate-180'
                )}
              />
            </button>
            {hostReintentosOpen ? (
              <div className="space-y-2 border-t border-emerald-200/70 px-4 pb-3 pt-2 sm:px-5">
                <p className="text-xs leading-snug text-emerald-900/90">
                  Ya recibiste el conteo. Dejá el hotspot prendido hasta que el compañero también vea
                  la comparación (si le falló la red, puede reintentar).
                </p>
                {hostInfo && (
                  <p className="font-mono text-xs font-semibold text-emerald-950">
                    {hostInfo.localIp}:{hostInfo.port}
                  </p>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  className="rounded-xl"
                  disabled={busy}
                  onClick={() => void handleStopHost()}
                >
                  Cerrar host
                </Button>
              </div>
            ) : null}
          </div>
        )}

        {estado?.mi_finalizo &&
          !verificacionSimple &&
          (!estado.companero_finalizo || p2pMode !== 'idle') &&
          !puedeRecuperarComparacion &&
          !comparacion && (
          <div className="border-b border-sky-100 bg-sky-50 px-4 py-3 sm:px-5">
            <p className="text-sm font-medium text-sky-950">Sincronizar con el compañero</p>
            <p className="mt-1 text-xs leading-snug text-sky-900/75">
              Uno crea la red (hotspot) y el otro se une. Después sincronizan el conteo.
            </p>

            {p2pMode === 'idle' && (
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleStartHost()}
                  className="flex w-full items-center gap-3 rounded-2xl border border-sky-300 bg-gradient-to-br from-sky-600 to-sky-700 px-3.5 py-3.5 text-left text-white shadow-md shadow-sky-600/25 transition hover:from-sky-500 hover:to-sky-600 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
                    <Radio className="h-5 w-5" />
                  </div>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold tracking-tight">Crear conexión</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-sky-100">
                      Activá tu hotspot y esperá al compañero
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => abrirModoCliente()}
                  className="flex w-full items-center gap-3 rounded-2xl border border-violet-200 bg-gradient-to-br from-white to-violet-50 px-3.5 py-3.5 text-left shadow-sm ring-1 ring-violet-100 transition hover:border-violet-300 hover:from-violet-50 hover:to-violet-100/80 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm">
                    <Wifi className="h-5 w-5" />
                  </div>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold tracking-tight text-slate-900">
                      Unirme a la conexión
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">
                      Conectate a su hotspot y sincronizá
                    </span>
                  </span>
                </button>
              </div>
            )}

            {p2pMode === 'host' && hostInfo && !hostSyncedOk && (
              <div className="mt-3 space-y-3 rounded-xl border border-sky-200 bg-white p-3">
                <p className="text-sm text-slate-700">
                  Activá el hotspot primero. Si la IP cambia, el QR se actualiza solo.
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
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full rounded-xl"
                  disabled={busy}
                  onClick={() => void handleRefreshHostIp()}
                >
                  Actualizar IP / QR
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void handleStopHost()}>
                  Cancelar
                </Button>
              </div>
            )}

            {p2pMode === 'client' && (
              <div className="mt-3 space-y-3 rounded-2xl border border-violet-200 bg-white p-3.5 shadow-sm">
                {tieneIpGuardada && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                    <p className="text-xs font-semibold text-emerald-900">IP guardada de antes</p>
                    <p className="mt-0.5 font-mono text-sm font-bold text-emerald-800">
                      {ultimaIpHost
                        ? `${ultimaIpHost.localIp}:${P2P_PORT}`
                        : clientHostInput.trim() || '—'}
                    </p>
                    <p className="mt-1 text-[11px] leading-snug text-emerald-800/80">
                      Si el compañero usa el mismo hotspot, podés sincronizar directo. Si cambió,
                      escaneá el QR de nuevo.
                    </p>
                  </div>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="w-full rounded-xl"
                  disabled={busy}
                  onClick={() => setShowP2PQrScanner(true)}
                >
                  <Camera className="h-3.5 w-3.5" />
                  Escanear QR del compañero
                </Button>
                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      IP del compañero
                    </label>
                    <Input
                      value={clientHostInput}
                      onChange={(e) => setClientHostInput(e.target.value)}
                      placeholder={HOTSPOT_IP_TIPICA}
                      inputMode="decimal"
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="w-[4.75rem] shrink-0">
                    <label className="mb-1 block text-xs font-medium text-slate-600">Puerto</label>
                    <Input
                      value={String(P2P_PORT)}
                      readOnly
                      tabIndex={-1}
                      className="bg-slate-50 font-mono text-sm text-slate-600"
                      title={`El puerto de sync es siempre ${P2P_PORT}`}
                    />
                  </div>
                </div>
                <p className="text-[11px] leading-snug text-slate-500">
                  Solo cambiá la IP si hace falta. El puerto es siempre {P2P_PORT}.
                </p>
                <button
                  type="button"
                  disabled={busy || !clientHostInput.trim()}
                  onClick={() => void handleConnectClient()}
                  className="flex w-full items-center gap-3 rounded-2xl border border-violet-400/80 bg-gradient-to-r from-violet-600 to-violet-700 px-4 py-3.5 text-left text-white shadow-md shadow-violet-600/25 transition hover:from-violet-500 hover:to-violet-600 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
                    {busy ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Wifi className="h-5 w-5" />
                    )}
                  </div>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold tracking-tight">
                      {error ? 'Reintentar sincronización' : 'Sincronizar ahora'}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-violet-100">
                      {tieneIpGuardada
                        ? 'Usando la IP guardada · conectate a su hotspot primero'
                        : 'Conectate a su hotspot y tocá acá'}
                    </span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-violet-100" />
                </button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => setP2pMode('idle')}>
                  Volver
                </Button>
              </div>
            )}

            {p2pMode === 'idle' && (
              <div className="mt-3">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-medium text-sky-800/80 transition-colors hover:bg-sky-100/70 hover:text-sky-950"
                  aria-expanded={showSyncMasOpciones}
                  onClick={() => setShowSyncMasOpciones((v) => !v)}
                >
                  <ChevronDown
                    className={cn(
                      'h-3.5 w-3.5 transition-transform',
                      showSyncMasOpciones && 'rotate-180'
                    )}
                  />
                  Más opciones
                </button>
                {showSyncMasOpciones && (
                  <div className="mt-2 space-y-3 rounded-xl border border-sky-200/80 bg-white/90 p-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Respaldo por archivo
                      </p>
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
                      </div>
                      {showSyncImport && (
                        <div className="mt-2 space-y-2">
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
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {syncIncompleto && resumenSync && !verificacionSimple && (
          <div className="border-b border-red-200 bg-red-50 px-4 py-3 sm:px-5">
            <p className="text-sm font-medium text-red-900">Sync incompleto</p>
            <p className="mt-1 text-xs text-red-800">
              Vos {resumenSync.mis_productos} prod. · compañero sin datos — reintentá sync
            </p>
            {p2pMode === 'idle' && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleStartHost()}
                  className="flex w-full items-center gap-2.5 rounded-xl border border-sky-300 bg-sky-600 px-3 py-2.5 text-left text-white shadow-sm transition hover:bg-sky-500 disabled:opacity-50"
                >
                  <Radio className="h-4 w-4 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">Crear conexión</span>
                    <span className="block text-[10px] text-sky-100">Tu hotspot</span>
                  </span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => abrirModoCliente()}
                  className="flex w-full items-center gap-2.5 rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-left shadow-sm transition hover:bg-violet-50 disabled:opacity-50"
                >
                  <Wifi className="h-4 w-4 shrink-0 text-violet-600" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-900">Unirme a la conexión</span>
                    <span className="block text-[10px] text-slate-500">Su hotspot</span>
                  </span>
                </button>
              </div>
            )}
          </div>
        )}

        {resumenSync && !syncIncompleto && !verificacionSimple && (
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600 sm:px-5">
            Vos {resumenSync.mis_productos} · Compañero {resumenSync.companero_productos}
            {comparacion && !comparacion.coincide
              ? ` · ${comparacion.diferencias.length} diferencia${comparacion.diferencias.length === 1 ? '' : 's'}`
              : ''}
          </div>
        )}

        {verificacionSimple && estado?.mi_finalizo && (
          <div className="border-b border-emerald-200 bg-gradient-to-b from-emerald-50 via-emerald-50/90 to-white px-4 py-3 sm:px-5">
            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-2xl border border-emerald-300/80 bg-white/90 p-4 shadow-sm ring-1 ring-emerald-100">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-md shadow-emerald-600/30">
                  <Check className="h-7 w-7 stroke-[2.5]" />
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-lg font-bold tracking-tight text-emerald-900">Conteo listo</p>
                  <p className="mt-1 text-sm leading-snug text-emerald-800/90">
                    Verificación simple: ya podés llevar el resultado al PC. Después se compara
                    contra el sistema.
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleImportPc()}
                  className="flex w-full items-center gap-3 rounded-2xl border border-emerald-400/80 bg-gradient-to-r from-emerald-600 to-emerald-700 px-4 py-3.5 text-left text-white shadow-md shadow-emerald-600/25 transition hover:from-emerald-500 hover:to-emerald-600 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
                    <Upload className="h-5 w-5" />
                  </div>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold tracking-tight">Importar al PC</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-emerald-100">
                      Enviá el resultado por red al servidor
                    </span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-emerald-100" />
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleGuardarArchivoParaPc()}
                  className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-left shadow-sm ring-1 ring-slate-100 transition hover:border-slate-300 hover:bg-slate-50 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-white shadow-sm">
                    <Download className="h-5 w-5" />
                  </div>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold tracking-tight text-slate-900">
                      Guardar archivo para PC
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">
                      Plan B si la importación por red falla
                    </span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
                </button>
              </div>
            </div>
          </div>
        )}

        {comparacion && !verificacionSimple && (
          <div
            className={cn(
              'border-b px-4 py-3 sm:px-5',
              comparacion.coincide
                ? 'border-emerald-200 bg-gradient-to-b from-emerald-50 via-emerald-50/90 to-white'
                : 'border-amber-100 bg-amber-50/80'
            )}
          >
            {comparacion.coincide ? (
              <div className="space-y-3">
                <div className="flex items-start gap-3 rounded-2xl border border-emerald-300/80 bg-white/90 p-4 shadow-sm ring-1 ring-emerald-100">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-md shadow-emerald-600/30">
                    <Check className="h-7 w-7 stroke-[2.5]" />
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="text-lg font-bold tracking-tight text-emerald-900">¡Todo coincide!</p>
                    <p className="mt-1 text-sm leading-snug text-emerald-800/90">
                      Vos y el compañero contaron lo mismo. Ya podés llevar el resultado al PC.
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-2.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleImportPc()}
                    className="flex w-full items-center gap-3 rounded-2xl border border-emerald-400/80 bg-gradient-to-r from-emerald-600 to-emerald-700 px-4 py-3.5 text-left text-white shadow-md shadow-emerald-600/25 transition hover:from-emerald-500 hover:to-emerald-600 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
                      <Upload className="h-5 w-5" />
                    </div>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold tracking-tight">Importar al PC</span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-emerald-100">
                        Enviá el resultado por red al servidor
                      </span>
                    </span>
                    <ChevronRight className="h-5 w-5 shrink-0 text-emerald-100" />
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleGuardarArchivoParaPc()}
                    className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-left shadow-sm ring-1 ring-slate-100 transition hover:border-slate-300 hover:bg-slate-50 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-white shadow-sm">
                      <Download className="h-5 w-5" />
                    </div>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold tracking-tight text-slate-900">
                        Guardar archivo para PC
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">
                        Plan B si la importación por red falla
                      </span>
                    </span>
                    <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-slate-900">
                      Productos con diferencias ({comparacion.diferencias.length})
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-600">
                      Estos productos no coinciden entre vos y el compañero
                    </p>
                  </div>
                  {companeroYaEnReconteo && (
                    <span className="text-xs font-medium text-sky-800">El otro ya está en reconteo</span>
                  )}
                </div>
                <div className="mt-2 space-y-2">
                  {comparacion.diferencias.map((d) => {
                    const misLineas = miRol === 1 ? d.lineas_contador_1 : d.lineas_contador_2
                    const compLineas = miRol === 1 ? d.lineas_contador_2 : d.lineas_contador_1
                    const miResumen = miRol === 1 ? d.resumen_contador_1 : d.resumen_contador_2
                    const compResumen = miRol === 1 ? d.resumen_contador_2 : d.resumen_contador_1
                    return (
                      <div key={d.producto_id} className="space-y-2 rounded-lg border border-red-200 bg-white p-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="inline-flex shrink-0 rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">
                            {d.codigo_interno}
                          </span>
                          <ScrollableProductName className="min-w-0 flex-1 text-sm font-medium text-slate-900">
                            {d.nombre}
                          </ScrollableProductName>
                        </div>
                        <p className="text-xs text-slate-600">
                          Vos: {miResumen} · Compañero: {compResumen}
                        </p>
                        <DesgloseDiferenciaColapsable
                          titulo1="Vos"
                          titulo2="Compañero"
                          lineas1={misLineas}
                          lineas2={compLineas}
                        />
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}

        </div>

        {puedeEditar && (
          <div className="space-y-3 overflow-visible p-4 sm:p-5">
            {usaUbicaciones && (
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-500" />
                <select
                  ref={ubicacionSelectRef}
                  value={ubicacionId}
                  onChange={(e) => {
                    setUbicacionId(e.target.value)
                    setError('')
                    setTimeout(() => productSearchRef.current?.focus(), 50)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      productSearchRef.current?.focus()
                    }
                  }}
                  className="w-full rounded-xl border border-surface-border bg-white py-2.5 pl-9 pr-3 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                >
                  <option value="">Seleccionar ubicación…</option>
                  {paquete?.ubicaciones.map((ubicacion) => (
                    <option key={ubicacion.id} value={ubicacion.id}>
                      {ubicacion.nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="relative z-30 min-w-0">
              <div className="relative rounded-xl border border-surface-border bg-white shadow-sm focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400" />
                <input
                  ref={productSearchRef}
                  type={tecladoNumerico ? 'text' : 'search'}
                  inputMode={tecladoNumerico ? 'tel' : 'search'}
                  enterKeyHint="search"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  role="combobox"
                  aria-expanded={productosFiltrados.length > 0}
                  placeholder={
                    tecladoNumerico
                      ? 'Buscar por código (números y guion)'
                      : 'Buscar producto — código o nombre'
                  }
                  value={productSearch}
                  onChange={(e) => {
                    setProductSearch(e.target.value)
                    if (selected && e.target.value !== selected.codigo_interno) {
                      setSelected(null)
                    }
                  }}
                  className="w-full rounded-xl border-0 bg-transparent py-3 pl-10 pr-3 text-base outline-none focus:ring-0"
                />
              </div>
              {productosFiltrados.length > 0 && (
                <ul className="absolute inset-x-0 z-50 mt-1.5 max-h-[min(55vh,22rem)] divide-y divide-slate-100 overflow-auto rounded-xl border border-surface-border bg-white shadow-panel">
                  {productosFiltrados.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="flex min-h-14 w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-slate-50 active:bg-slate-100"
                        onPointerDown={armKeyboardForCantidadModal}
                        onClick={() => selectProduct(p)}
                      >
                        <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 font-mono text-sm font-semibold text-slate-700">
                          {p.codigo_interno}
                        </span>
                        <ScrollableProductName className="min-w-0 flex-1 text-base font-medium leading-snug text-slate-800">
                          {p.nombre}
                        </ScrollableProductName>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Puente: mantiene/abre teclado numérico en el mismo gesto del toque */}
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

            {selected && (
              <>
                <div
                  className="fixed inset-0 z-40 bg-slate-900/45"
                  aria-hidden
                  onClick={cancelarLineaForm}
                />
                <div
                  ref={productLineFormRef}
                  className="fixed inset-x-0 z-50 mx-auto w-full max-w-3xl overflow-y-auto overscroll-contain rounded-t-2xl border-2 border-b-0 border-brand-400 bg-white p-4 shadow-[0_-12px_40px_rgba(15,23,42,0.25)] ring-4 ring-brand-500/15 transition-[bottom,max-height] duration-200 ease-out sm:rounded-2xl sm:border sm:p-5"
                  style={{
                    bottom: keyboardInset,
                    // Usa casi todo el alto libre sobre el teclado para evitar scroll interno.
                    maxHeight: `calc(100dvh - ${keyboardInset}px - env(safe-area-inset-top, 0px) - 0.5rem)`
                  }}
                >
                <div className="mb-3 sm:mb-4">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex min-w-0 rounded-md bg-slate-50 px-2 py-0.5 font-mono text-sm font-semibold text-slate-700 ring-1 ring-surface-border">
                      {selected.codigo_interno}
                    </span>
                    <p className="ml-auto shrink-0 text-xs font-semibold uppercase tracking-wide text-brand-600">
                      {editingLocalId ? 'Editar línea' : 'Nueva línea'}
                    </p>
                  </div>
                  <ScrollableProductName className="mt-1 text-base font-semibold text-slate-900">
                    {selected.nombre}
                  </ScrollableProductName>
                </div>

                <form
                  onSubmit={(e) => void handleAddLinea(e)}
                  className="grid grid-cols-2 gap-3 sm:grid-cols-4"
                >
                  <div className="col-span-2">
                    <label className="mb-1 block text-sm font-medium text-slate-700">Tipo</label>
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
                  <div className="col-span-2 grid min-h-[12rem] grid-cols-2 content-start gap-3 sm:col-span-4 sm:grid-cols-4">
                    <div className={cn(tipoBulto === 'SUELTO' && 'hidden', tipoBulto === 'CAJA' && 'col-span-2')}>
                      <Input
                        ref={cantidadBultosRef}
                        label={tipoBulto === 'PALLET' ? 'Cant. pallets' : 'Cant. cajas'}
                        type="text"
                        inputMode="numeric"
                        value={cantidadBultos}
                        onChange={(e) => setCantidadBultos(e.target.value)}
                        onFocus={(e) => {
                          setCantidadExprFocus('bultos')
                          scrollFocusedFieldIntoSheet(e.currentTarget)
                          const el = e.currentTarget
                          requestAnimationFrame(() => el.select())
                        }}
                        className="rounded-xl px-3 py-2.5 text-base"
                        placeholder={tipoBulto === 'CAJA' ? '1 o 28×4-4' : '1'}
                        required={tipoBulto !== 'SUELTO'}
                        leading={
                          tipoBulto === 'PALLET' ? (
                            <Layers className="h-4 w-4" aria-hidden />
                          ) : (
                            <Box className="h-4 w-4" aria-hidden />
                          )
                        }
                      />
                      {tipoBulto === 'CAJA' && cantidadExprEsCuenta(cantidadBultos) && (
                        <p
                          className={cn(
                            'mt-1 text-[11px] font-medium',
                            evalCantidadExpr(cantidadBultos) != null
                              ? 'text-emerald-700'
                              : 'text-amber-700'
                          )}
                        >
                          {evalCantidadExpr(cantidadBultos) != null
                            ? `= ${evalCantidadExpr(cantidadBultos)}`
                            : 'Cuenta incompleta (ej. 28×4-4)'}
                        </p>
                      )}
                    </div>
                    <div className={cn((tipoBulto === 'SUELTO' || tipoBulto === 'CAJA') && 'hidden')}>
                      <Input
                        ref={unidadesPorBultoRef}
                        label="× cajas por pallet"
                        type="text"
                        inputMode="numeric"
                        value={unidadesPorBulto}
                        onChange={(e) => setUnidadesPorBulto(e.target.value)}
                        onFocus={(e) => {
                          setCantidadExprFocus('unidades')
                          scrollFocusedFieldIntoSheet(e.currentTarget)
                          const el = e.currentTarget
                          requestAnimationFrame(() => el.select())
                        }}
                        className="rounded-xl px-3 py-2.5 text-base"
                        placeholder="112 o 112-6"
                        required={tipoBulto === 'PALLET'}
                        leading={<Box className="h-4 w-4" aria-hidden />}
                      />
                      {tipoBulto === 'PALLET' && cantidadExprEsCuenta(unidadesPorBulto) && (
                        <p
                          className={cn(
                            'mt-1 text-[11px] font-medium',
                            evalCantidadExpr(unidadesPorBulto) != null
                              ? 'text-emerald-700'
                              : 'text-amber-700'
                          )}
                        >
                          {evalCantidadExpr(unidadesPorBulto) != null
                            ? `= ${evalCantidadExpr(unidadesPorBulto)}`
                            : 'Cuenta incompleta (ej. 112-6)'}
                        </p>
                      )}
                    </div>
                    <div className={cn(tipoBulto === 'SUELTO' && 'col-span-2')}>
                      <Input
                        ref={cantidadSueltaRef}
                        label={
                          tipoBulto === 'SUELTO'
                            ? 'Cantidad suelta'
                            : tipoBulto === 'PALLET'
                              ? 'Cajas sueltas (opc.)'
                              : 'Botellas sueltas (opc.)'
                        }
                        type="text"
                        inputMode="numeric"
                        value={cantidadSuelta}
                        onChange={(e) => setCantidadSuelta(e.target.value)}
                        onFocus={(e) => {
                          setCantidadExprFocus('suelta')
                          scrollFocusedFieldIntoSheet(e.currentTarget)
                          const el = e.currentTarget
                          requestAnimationFrame(() => el.select())
                        }}
                        className="rounded-xl px-3 py-2.5 text-base"
                        placeholder={
                          tipoBulto === 'SUELTO' ? '12' : tipoBulto === 'PALLET' ? '0 o 8-2' : '0'
                        }
                        required={tipoBulto === 'SUELTO'}
                        leading={
                          tipoBulto === 'PALLET' ? (
                            <Box className="h-4 w-4" aria-hidden />
                          ) : (
                            <BottleIcon className="h-4 w-4" />
                          )
                        }
                      />
                      {tipoBulto === 'PALLET' && cantidadExprEsCuenta(cantidadSuelta) && (
                        <p
                          className={cn(
                            'mt-1 text-[11px] font-medium',
                            evalCantidadExpr(cantidadSuelta) != null
                              ? 'text-emerald-700'
                              : 'text-amber-700'
                          )}
                        >
                          {evalCantidadExpr(cantidadSuelta) != null
                            ? `= ${evalCantidadExpr(cantidadSuelta)}`
                            : 'Cuenta incompleta (ej. 8-2)'}
                        </p>
                      )}
                    </div>
                    {(tipoBulto === 'PALLET' || tipoBulto === 'CAJA') && (
                      <div className="space-y-1.5">
                        <span className="block text-sm font-medium text-transparent select-none" aria-hidden>
                          ·
                        </span>
                        <CantidadExprOperators
                          target={
                            cantidadExprFocus === 'bultos'
                              ? {
                                  inputRef: cantidadBultosRef,
                                  value: cantidadBultos,
                                  onChange: setCantidadBultos
                                }
                              : cantidadExprFocus === 'unidades'
                                ? {
                                    inputRef: unidadesPorBultoRef,
                                    value: unidadesPorBulto,
                                    onChange: setUnidadesPorBulto
                                  }
                                : cantidadExprFocus === 'suelta'
                                  ? {
                                      inputRef: cantidadSueltaRef,
                                      value: cantidadSuelta,
                                      onChange: setCantidadSuelta
                                    }
                                  : tipoBulto === 'CAJA'
                                    ? {
                                        inputRef: cantidadBultosRef,
                                        value: cantidadBultos,
                                        onChange: setCantidadBultos
                                      }
                                    : {
                                        inputRef: unidadesPorBultoRef,
                                        value: unidadesPorBulto,
                                        onChange: setUnidadesPorBulto
                                      }
                          }
                        />
                      </div>
                    )}
                  </div>
                  <div className="col-span-2 flex items-end gap-2 sm:col-span-4">
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-[2.875rem] w-11 shrink-0 rounded-xl px-0 border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700"
                      disabled={busy}
                      onClick={cancelarLineaForm}
                      aria-label="Cerrar"
                      title="Cerrar"
                    >
                      <X className="h-5 w-5" />
                    </Button>
                    <Button
                      type="submit"
                      className={cn(
                        'w-full rounded-xl py-2.5 text-base',
                        cuentasPendientes && 'bg-amber-600 hover:bg-amber-700'
                      )}
                      disabled={busy}
                      onPointerDown={(e) => {
                        // Evita que el botón robe el foco y cierre el teclado al calcular.
                        if (cuentasPendientes) e.preventDefault()
                      }}
                    >
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : cuentasPendientes ? (
                        <Calculator className="h-4 w-4" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                      {cuentasPendientes
                        ? 'Calcular'
                        : editingLocalId
                          ? 'Guardar'
                          : 'Agregar línea'}
                    </Button>
                  </div>
                </form>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {puedeEditar ? (
        <div ref={listScrollRef} className="relative z-0 min-h-0 flex-1 overflow-y-auto bg-white">
          {lineasListContent}
        </div>
      ) : null}

      <div
        className={cn(
          'border-t border-slate-200 bg-gradient-to-t from-slate-200/90 via-slate-100 to-slate-50 px-4 pt-4 shadow-[0_-6px_16px_rgba(15,23,42,0.08)] transition-transform duration-200 ease-out sm:px-5 pb-[max(1rem,env(safe-area-inset-bottom))]',
          pinConteoFooterUnderKeyboard ? 'pointer-events-none fixed inset-x-0 z-[15]' : 'shrink-0'
        )}
        style={
          pinConteoFooterUnderKeyboard
            ? {
                bottom: 0,
                transform:
                  keyboardLayoutShrink > 0
                    ? `translateY(${keyboardLayoutShrink}px)`
                    : 'translateY(100%)'
              }
            : undefined
        }
      >
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setTotalVistaFisica((v) => !v)}
            className="min-w-0 flex-1 rounded-xl text-left active:bg-slate-200/50"
            aria-label={
              totalVistaFisica
                ? 'Mostrar total en cajas'
                : 'Mostrar total en pallets y cajas'
            }
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {totalVistaFisica ? 'Total pallets + cajas' : 'Total contado'}
            </p>
            <p className="scrollbar-none-x overflow-x-auto whitespace-nowrap text-lg font-bold tabular-nums text-brand-700 sm:text-2xl">
              {totalVistaFisica ? resumenFisico : resumenGeneral}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {misLineasRonda.length} línea{misLineasRonda.length === 1 ? '' : 's'} ·{' '}
              {lineasPorProducto.length} producto{lineasPorProducto.length === 1 ? '' : 's'}
              <span className="text-slate-400"> · tocá para cambiar</span>
            </p>
          </button>
          <div className="flex shrink-0 flex-row items-center gap-2">
            {comparacion && !comparacion.coincide && !verificacionSimple && (
              <Button className="rounded-xl" disabled={busy} onClick={() => void handleReconteo()}>
                Iniciar reconteo
              </Button>
            )}
            {puedeEditar && (misLineasRonda.length > 0 || enReconteo || verificacionSimple) && (
              <Button className="rounded-xl" disabled={busy} onClick={() => void handleFinalizar()}>
                <Check className="h-4 w-4" />
                Finalizar
              </Button>
            )}
            {estado?.mi_finalizo && !estado.companero_finalizo && !verificacionSimple && (
              <Button
                variant="secondary"
                className="rounded-xl"
                disabled={busy}
                onClick={() => void handleReabrirConteo()}
              >
                <Pencil className="h-4 w-4" />
                Editar
              </Button>
            )}
            {estado?.mi_finalizo && verificacionSimple && (
              <Button
                variant="secondary"
                className="rounded-xl"
                disabled={busy}
                onClick={() => void handleReabrirConteo()}
              >
                <Pencil className="h-4 w-4" />
                Editar
              </Button>
            )}
            {postConteo && lineasPorProducto.length > 0 && (
              <button
                type="button"
                title="Vista previa del conteo"
                aria-label="Vista previa del conteo"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-brand-200 bg-white text-brand-700 shadow-sm transition-colors hover:border-brand-300 hover:bg-brand-50 active:bg-brand-100"
                onClick={() => {
                  setVistaPreviaSearch('')
                  setShowVistaPrevia(true)
                }}
              >
                <Eye className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {showVistaPrevia && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-white">
          <div className="shrink-0 border-b border-surface-border px-4 py-3 sm:px-5">
            <h2 className="truncate text-sm font-semibold text-slate-900">Vista previa del conteo</h2>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {lineasPorProducto.length} producto
              {lineasPorProducto.length === 1 ? '' : 's'} · atrás para volver al sync · tocá para
              ver desglose
            </p>
          </div>
          <div className="shrink-0 border-b border-surface-border px-3 py-2.5 sm:px-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400" />
              <input
                type="search"
                value={vistaPreviaSearch}
                onChange={(e) => setVistaPreviaSearch(e.target.value)}
                placeholder="Buscar en lo contado — código o nombre"
                className="w-full rounded-xl border border-surface-border bg-white py-2.5 pl-10 pr-3 text-base shadow-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                autoFocus
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto bg-white">
            {renderGruposList(lineasPorProductoVistaPrevia)}
          </div>
        </div>
      )}

      <BarcodeScannerModal
        open={showP2PQrScanner}
        onClose={() => setShowP2PQrScanner(false)}
        onScan={handleP2PQrScan}
        title="Escanear QR del compañero"
        variant="qr"
      />
    </div>
  )
}
