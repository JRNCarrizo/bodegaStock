import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  Loader2,
  Plus,
  Search,
  Ticket
} from 'lucide-react'
import { todayIsoDate } from '@/lib/desglose'
import { KB_HIGHLIGHT_ROW } from '@/lib/listKeyboardHighlight'
import { api, cn } from '@/lib/utils'
import { useAuth } from '@/context/AuthContext'
import type {
  ValeAlerta,
  ValeAplicacionItem,
  ValeCliente,
  ValeListItem,
  ValeRetiroListItem,
  ValeTipoPallet
} from '@/types'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardBody } from '@/components/ui/Card'

type TabId = 'resumen' | 'retiros' | 'clientes' | 'archivados'
type PanelId = 'none' | 'vale' | 'retiro'

function labelTipo(t: ValeTipoPallet): string {
  return t === 'NORMALIZADO' ? 'Normalizado' : 'Descartable'
}

function diasHastaVencimiento(vencimiento: string): number {
  const [y1, m1, d1] = todayIsoDate().split('-').map(Number)
  const [y2, m2, d2] = vencimiento.split('-').map(Number)
  const t1 = Date.UTC(y1, m1 - 1, d1)
  const t2 = Date.UTC(y2, m2 - 1, d2)
  return Math.round((t2 - t1) / 86_400_000)
}

function emptyClienteForm() {
  return { codigo: '', nombre: '', direccion: '', activo: true }
}

export function ValesPage() {
  const { hasPermiso } = useAuth()
  const canCreate = hasPermiso('vales.crear')
  const canEdit = hasPermiso('vales.editar')

  const [tab, setTab] = useState<TabId>('resumen')
  const [panel, setPanel] = useState<PanelId>('none')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [alertas, setAlertas] = useState<ValeAlerta[]>([])
  const [clientes, setClientes] = useState<ValeCliente[]>([])
  const [vales, setVales] = useState<ValeListItem[]>([])
  const [valesArchivados, setValesArchivados] = useState<ValeListItem[]>([])
  const [retiros, setRetiros] = useState<ValeRetiroListItem[]>([])
  const [aplicaciones, setAplicaciones] = useState<ValeAplicacionItem[]>([])
  const [valeExpandidoId, setValeExpandidoId] = useState<number | null>(null)
  const [clienteSearch, setClienteSearch] = useState('')
  const [mercadoQuery, setMercadoQuery] = useState('')
  const [mercadoSeleccionado, setMercadoSeleccionado] = useState<ValeCliente | null>(null)
  const [mercadoHighlightIndex, setMercadoHighlightIndex] = useState(-1)

  const [clienteForm, setClienteForm] = useState(emptyClienteForm)
  const [editingClienteId, setEditingClienteId] = useState<number | null>(null)
  const [showClienteForm, setShowClienteForm] = useState(false)

  const [valeForm, setValeForm] = useState({
    cliente_id: '',
    fecha: todayIsoDate(),
    vencimiento: '',
    cantidad: '',
    tipo_pallet: 'NORMALIZADO' as ValeTipoPallet,
    observacion: ''
  })

  const [retiroForm, setRetiroForm] = useState({
    cliente_id: '',
    fecha: todayIsoDate(),
    cantidad: '',
    tipo_pallet: 'NORMALIZADO' as ValeTipoPallet,
    observacion: ''
  })

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [a, c, v, r] = await Promise.all([
        api<ValeAlerta[]>('/api/vales/alertas?dias=5'),
        api<ValeCliente[]>('/api/vales/clientes'),
        api<ValeListItem[]>('/api/vales?solo_activos=1'),
        api<ValeRetiroListItem[]>('/api/vales/retiros')
      ])
      setAlertas(a)
      setClientes(c)
      setVales(v)
      setRetiros(r)
      try {
        const va = await api<ValeListItem[]>('/api/vales?archivados=1')
        setValesArchivados(va)
      } catch {
        setValesArchivados([])
      }
      try {
        const apps = await api<ValeAplicacionItem[]>('/api/vales/aplicaciones')
        setAplicaciones(apps)
      } catch {
        setAplicaciones([])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const clientesFiltrados = useMemo(() => {
    const q = clienteSearch.trim().toLowerCase()
    if (!q) return clientes
    return clientes.filter(
      (c) =>
        c.codigo.toLowerCase().includes(q) ||
        c.nombre.toLowerCase().includes(q) ||
        c.direccion.toLowerCase().includes(q)
    )
  }, [clientes, clienteSearch])

  const clientesActivos = useMemo(() => clientes.filter((c) => c.activo === 1), [clientes])

  const alertasById = useMemo(() => {
    const m = new Map<number, ValeAlerta>()
    for (const a of alertas) m.set(a.id, a)
    return m
  }, [alertas])

  const clientesById = useMemo(() => {
    const m = new Map<number, ValeCliente>()
    for (const c of clientes) m.set(c.id, c)
    return m
  }, [clientes])

  const aplicacionesByVale = useMemo(() => {
    const m = new Map<number, ValeAplicacionItem[]>()
    for (const a of aplicaciones) {
      const list = m.get(a.vale_id)
      if (list) list.push(a)
      else m.set(a.vale_id, [a])
    }
    return m
  }, [aplicaciones])

  const mercadosSugeridos = useMemo(() => {
    if (mercadoSeleccionado) return []
    const q = mercadoQuery.trim().toLowerCase()
    if (!q) return []
    return clientes
      .filter(
        (c) =>
          c.codigo.toLowerCase().includes(q) ||
          c.nombre.toLowerCase().includes(q) ||
          c.direccion.toLowerCase().includes(q)
      )
      .slice(0, 8)
  }, [clientes, mercadoQuery, mercadoSeleccionado])

  useEffect(() => {
    setMercadoHighlightIndex(mercadosSugeridos.length > 0 ? 0 : -1)
  }, [mercadosSugeridos])

  const valesMercado = useMemo(() => {
    if (!mercadoSeleccionado) return vales
    return vales.filter((v) => v.cliente_id === mercadoSeleccionado.id)
  }, [vales, mercadoSeleccionado])

  const valesArchivadosMercado = useMemo(() => {
    if (!mercadoSeleccionado) return valesArchivados
    return valesArchivados.filter((v) => v.cliente_id === mercadoSeleccionado.id)
  }, [valesArchivados, mercadoSeleccionado])

  const totalVales = valesMercado.length
  const totalPallets = useMemo(
    () => valesMercado.reduce((acc, v) => acc + v.cantidad_restante, 0),
    [valesMercado]
  )

  function elegirMercado(c: ValeCliente) {
    setMercadoSeleccionado(c)
    setMercadoQuery(`#${c.codigo} — ${c.nombre}`)
    setMercadoHighlightIndex(-1)
  }

  function limpiarMercado() {
    setMercadoSeleccionado(null)
    setMercadoQuery('')
    setMercadoHighlightIndex(-1)
  }

  function handleMercadoKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (mercadoSeleccionado) return
    const hasDropdown = mercadosSugeridos.length > 0

    if (e.key === 'ArrowDown' && hasDropdown) {
      e.preventDefault()
      setMercadoHighlightIndex((i) => (i < mercadosSugeridos.length - 1 ? i + 1 : 0))
      return
    }
    if (e.key === 'ArrowUp' && hasDropdown) {
      e.preventDefault()
      setMercadoHighlightIndex((i) => (i > 0 ? i - 1 : mercadosSugeridos.length - 1))
      return
    }
    if (e.key === 'Escape' && hasDropdown) {
      e.preventDefault()
      setMercadoQuery('')
      setMercadoHighlightIndex(-1)
      return
    }
    if (e.key === 'Enter' && hasDropdown) {
      e.preventDefault()
      const pick =
        mercadoHighlightIndex >= 0
          ? mercadosSugeridos[mercadoHighlightIndex]
          : mercadosSugeridos[0]
      if (pick) elegirMercado(pick)
    }
  }

  async function guardarCliente() {
    if (!clienteForm.codigo.trim() || !clienteForm.nombre.trim()) {
      setError('Completá código y nombre del mercado')
      return
    }
    setSaving(true)
    setError('')
    try {
      if (editingClienteId) {
        await api(`/api/vales/clientes/${editingClienteId}`, {
          method: 'PUT',
          body: JSON.stringify(clienteForm)
        })
      } else {
        await api('/api/vales/clientes', {
          method: 'POST',
          body: JSON.stringify(clienteForm)
        })
      }
      setClienteForm(emptyClienteForm())
      setEditingClienteId(null)
      setShowClienteForm(false)
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar cliente')
    } finally {
      setSaving(false)
    }
  }

  function abrirNuevoCliente() {
    setEditingClienteId(null)
    setClienteForm(emptyClienteForm())
    setError('')
    setShowClienteForm(true)
  }

  function cerrarFormCliente() {
    setShowClienteForm(false)
    setEditingClienteId(null)
    setClienteForm(emptyClienteForm())
    setError('')
  }

  async function guardarVale() {
    setSaving(true)
    setError('')
    try {
      await api('/api/vales', {
        method: 'POST',
        body: JSON.stringify({
          cliente_id: Number(valeForm.cliente_id),
          fecha: valeForm.fecha,
          vencimiento: valeForm.vencimiento,
          cantidad: Number(valeForm.cantidad),
          tipo_pallet: valeForm.tipo_pallet,
          observacion: valeForm.observacion.trim() || null
        })
      })
      setValeForm({
        cliente_id: '',
        fecha: todayIsoDate(),
        vencimiento: '',
        cantidad: '',
        tipo_pallet: 'NORMALIZADO',
        observacion: ''
      })
      setPanel('none')
      setTab('resumen')
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al registrar vale')
    } finally {
      setSaving(false)
    }
  }

  async function guardarRetiro() {
    setSaving(true)
    setError('')
    try {
      await api('/api/vales/retiros', {
        method: 'POST',
        body: JSON.stringify({
          cliente_id: Number(retiroForm.cliente_id),
          fecha: retiroForm.fecha,
          cantidad: Number(retiroForm.cantidad),
          tipo_pallet: retiroForm.tipo_pallet,
          observacion: retiroForm.observacion.trim() || null
        })
      })
      setRetiroForm({
        cliente_id: '',
        fecha: todayIsoDate(),
        cantidad: '',
        tipo_pallet: 'NORMALIZADO',
        observacion: ''
      })
      setPanel('none')
      setTab('retiros')
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al registrar retiro')
    } finally {
      setSaving(false)
    }
  }

  function editarCliente(c: ValeCliente) {
    setEditingClienteId(c.id)
    setClienteForm({
      codigo: c.codigo,
      nombre: c.nombre,
      direccion: c.direccion,
      activo: c.activo === 1
    })
    setError('')
    setShowClienteForm(true)
    setTab('clientes')
  }

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'resumen', label: 'Resumen' },
    { id: 'retiros', label: 'Retiros realizados' },
    { id: 'clientes', label: 'Clientes' },
    { id: 'archivados', label: 'Archivados' }
  ]

  function irATab(next: TabId) {
    setError('')
    setPanel('none')
    setShowClienteForm(false)
    setEditingClienteId(null)
    setClienteForm(emptyClienteForm())
    setTab(next)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Administración</p>
          <div className="mt-1 flex items-center gap-1.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Vales de pallets
            </h1>
          </div>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-500">
            Control de vales que entregan los mercados en lugar de devolver pallets. No afecta el stock de
            productos.
          </p>
        </div>
        {canCreate && panel === 'none' && (
          <div className="flex flex-wrap gap-2">
            <Button
              className="rounded-xl"
              onClick={() => {
                setError('')
                setShowClienteForm(false)
                setPanel('vale')
              }}
            >
              <Plus className="h-4 w-4" />
              Nuevo vale
            </Button>
            <Button
              variant="secondary"
              className="rounded-xl"
              onClick={() => {
                setError('')
                setShowClienteForm(false)
                setPanel('retiro')
              }}
            >
              Registrar retiro
            </Button>
          </div>
        )}
      </section>

      {panel === 'none' && (
        <div className="flex flex-wrap gap-1 rounded-xl border border-surface-border bg-white p-1 shadow-sm">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => irATab(t.id)}
              className={cn(
                'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                t.id === 'archivados' && 'ml-auto',
                tab === t.id ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-50'
              )}
            >
              {t.label}
              {t.id === 'resumen' && alertas.length > 0 && (
                <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1 text-[11px] font-bold text-amber-950">
                  {alertas.length}
                </span>
              )}
              {t.id === 'archivados' && valesArchivados.length > 0 && (
                <span
                  className={cn(
                    'ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold',
                    tab === t.id ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                  )}
                >
                  {valesArchivados.length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-100">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-16 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : panel === 'vale' ? (
        <Card className="mx-auto max-w-lg shadow-panel">
          <CardBody className="space-y-3">
            <button
              type="button"
              className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
              onClick={() => {
                setPanel('none')
                setError('')
              }}
            >
              <ChevronLeft className="h-4 w-4" />
              Volver
            </button>
            <h2 className="text-lg font-semibold text-slate-900">Registrar vale</h2>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Cliente</span>
              <select
                className="w-full rounded-xl border border-surface-border bg-white px-3 py-2.5 text-sm"
                value={valeForm.cliente_id}
                onChange={(e) => setValeForm((f) => ({ ...f, cliente_id: e.target.value }))}
              >
                <option value="">Seleccionar…</option>
                {clientesActivos.map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.codigo} — {c.nombre}
                  </option>
                ))}
              </select>
            </label>
            <Input
              label="Fecha del vale"
              type="date"
              value={valeForm.fecha}
              onChange={(e) => setValeForm((f) => ({ ...f, fecha: e.target.value }))}
            />
            <Input
              label="Vencimiento"
              type="date"
              value={valeForm.vencimiento}
              onChange={(e) => setValeForm((f) => ({ ...f, vencimiento: e.target.value }))}
            />
            <Input
              label="Cantidad de pallets"
              type="number"
              min={1}
              value={valeForm.cantidad}
              onChange={(e) => setValeForm((f) => ({ ...f, cantidad: e.target.value }))}
            />
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Tipo de pallet</span>
              <select
                className="w-full rounded-xl border border-surface-border bg-white px-3 py-2.5 text-sm"
                value={valeForm.tipo_pallet}
                onChange={(e) =>
                  setValeForm((f) => ({ ...f, tipo_pallet: e.target.value as ValeTipoPallet }))
                }
              >
                <option value="NORMALIZADO">Normalizado</option>
                <option value="DESCARTABLE">Descartable</option>
              </select>
            </label>
            <Input
              label="Observación (opcional)"
              value={valeForm.observacion}
              onChange={(e) => setValeForm((f) => ({ ...f, observacion: e.target.value }))}
            />
            <Button className="w-full rounded-xl" disabled={saving} onClick={() => void guardarVale()}>
              <Ticket className="h-4 w-4" />
              {saving ? 'Guardando…' : 'Guardar vale'}
            </Button>
          </CardBody>
        </Card>
      ) : panel === 'retiro' ? (
        <Card className="mx-auto max-w-lg shadow-panel">
          <CardBody className="space-y-3">
            <button
              type="button"
              className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
              onClick={() => {
                setPanel('none')
                setError('')
              }}
            >
              <ChevronLeft className="h-4 w-4" />
              Volver
            </button>
            <h2 className="text-lg font-semibold text-slate-900">Retiro de pallets</h2>
            <p className="text-xs text-slate-500">
              Descuenta del saldo y consume primero el vale que vence antes.
            </p>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Cliente</span>
              <select
                className="w-full rounded-xl border border-surface-border bg-white px-3 py-2.5 text-sm"
                value={retiroForm.cliente_id}
                onChange={(e) => setRetiroForm((f) => ({ ...f, cliente_id: e.target.value }))}
              >
                <option value="">Seleccionar…</option>
                {clientesActivos.map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.codigo} — {c.nombre} (saldo {c.saldo_pallets})
                  </option>
                ))}
              </select>
            </label>
            <Input
              label="Fecha"
              type="date"
              value={retiroForm.fecha}
              onChange={(e) => setRetiroForm((f) => ({ ...f, fecha: e.target.value }))}
            />
            <Input
              label="Cantidad a retirar"
              type="number"
              min={1}
              value={retiroForm.cantidad}
              onChange={(e) => setRetiroForm((f) => ({ ...f, cantidad: e.target.value }))}
            />
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Tipo de pallet</span>
              <select
                className="w-full rounded-xl border border-surface-border bg-white px-3 py-2.5 text-sm"
                value={retiroForm.tipo_pallet}
                onChange={(e) =>
                  setRetiroForm((f) => ({ ...f, tipo_pallet: e.target.value as ValeTipoPallet }))
                }
              >
                <option value="NORMALIZADO">Normalizado</option>
                <option value="DESCARTABLE">Descartable</option>
              </select>
            </label>
            <Input
              label="Observación (opcional)"
              value={retiroForm.observacion}
              onChange={(e) => setRetiroForm((f) => ({ ...f, observacion: e.target.value }))}
            />
            <Button className="w-full rounded-xl" disabled={saving} onClick={() => void guardarRetiro()}>
              {saving ? 'Guardando…' : 'Confirmar retiro'}
            </Button>
          </CardBody>
        </Card>
      ) : tab === 'resumen' ? (
        <Card className="overflow-hidden shadow-panel">
          <div className="border-b border-surface-border bg-gradient-to-r from-brand-50/60 via-white to-white px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Vales con saldo</h2>
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400" />
              <input
                type="text"
                placeholder="Buscar mercado por código o nombre…"
                value={mercadoQuery}
                onChange={(e) => {
                  setMercadoQuery(e.target.value)
                  setMercadoSeleccionado(null)
                }}
                onKeyDown={handleMercadoKeyDown}
                className={cn(
                  'w-full rounded-xl border border-surface-border bg-white py-2.5 pl-9 text-sm',
                  mercadoSeleccionado ? 'pr-20' : 'pr-3'
                )}
              />
              {mercadoSeleccionado && (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  onClick={limpiarMercado}
                >
                  Limpiar
                </button>
              )}
              {mercadosSugeridos.length > 0 && (
                <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-surface-border bg-white py-1 shadow-lg">
                  {mercadosSugeridos.map((c, idx) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className={cn(
                          'flex w-full items-start justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-brand-50',
                          idx === mercadoHighlightIndex && KB_HIGHLIGHT_ROW
                        )}
                        onMouseEnter={() => setMercadoHighlightIndex(idx)}
                        onClick={() => elegirMercado(c)}
                      >
                        <span className="min-w-0">
                          <span className="font-semibold text-slate-900">
                            <span className="mr-1.5 font-mono text-xs text-slate-500">#{c.codigo}</span>
                            {c.nombre}
                          </span>
                          {c.direccion ? (
                            <span className="mt-0.5 block truncate text-xs text-slate-500">{c.direccion}</span>
                          ) : null}
                        </span>
                        <span className="shrink-0 tabular-nums text-xs text-slate-400">
                          saldo {c.saldo_pallets}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <CardBody className="p-0">
            {valesMercado.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-slate-500">
                {mercadoSeleccionado
                  ? 'Este mercado no tiene vales con saldo'
                  : 'No hay vales con saldo'}
              </p>
            ) : (
              <ul className="divide-y divide-surface-border">
                {valesMercado.map((v) => {
                  const alerta = alertasById.get(v.id)
                  const abierto = valeExpandidoId === v.id
                  const apps = aplicacionesByVale.get(v.id) ?? []
                  const direccion =
                    v.cliente_direccion || clientesById.get(v.cliente_id)?.direccion || ''
                  const diasRestantes = alerta ? diasHastaVencimiento(v.vencimiento) : null
                  return (
                    <li
                      key={v.id}
                      className={cn(alerta && 'bg-amber-50/60')}
                    >
                      <button
                        type="button"
                        className="flex w-full flex-wrap items-center justify-between gap-2 px-5 py-3 text-left text-sm hover:bg-slate-50/80"
                        onClick={() => setValeExpandidoId(abierto ? null : v.id)}
                        aria-expanded={abierto}
                      >
                        <div className="flex min-w-0 items-start gap-2">
                          <ChevronDown
                            className={cn(
                              'mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform',
                              abierto && 'rotate-180 text-brand-600'
                            )}
                          />
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900">
                              {v.cliente_nombre}{' '}
                              <span className="font-mono text-xs text-slate-500">#{v.cliente_codigo}</span>
                            </p>
                            <p className="truncate text-xs text-slate-500">
                              {direccion || 'Sin dirección'}
                            </p>
                            <p className="text-xs text-slate-500">
                              {labelTipo(v.tipo_pallet)} · {v.cantidad_restante}/{v.cantidad_inicial} · vence{' '}
                              {v.vencimiento}
                              {v.observacion ? ` · ${v.observacion}` : ''}
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {alerta && diasRestantes != null ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900">
                              <AlertTriangle className="h-3 w-3" />
                              Por vencer
                              <span className="tabular-nums">
                                · {diasRestantes === 0
                                  ? 'hoy'
                                  : diasRestantes === 1
                                    ? '1 día'
                                    : `${diasRestantes} días`}
                              </span>
                            </span>
                          ) : null}
                          <span className="text-lg font-bold tabular-nums text-brand-700">{v.cantidad_restante}</span>
                        </div>
                      </button>
                      {abierto && (
                        <div className="border-t border-surface-border/80 bg-white/70 px-5 py-3 pl-11">
                          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                            Retiros de este vale
                          </p>
                          {apps.length === 0 ? (
                            <p className="text-sm text-slate-500">Todavía no hay retiros aplicados</p>
                          ) : (
                            <ul className="space-y-1.5">
                              {apps.map((a) => (
                                <li
                                  key={a.id}
                                  className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"
                                >
                                  <div className="min-w-0">
                                    <p className="font-medium text-slate-800">{a.fecha}</p>
                                    {a.observacion ? (
                                      <p className="truncate text-xs text-slate-500">{a.observacion}</p>
                                    ) : null}
                                  </div>
                                  <span className="shrink-0 font-bold tabular-nums text-slate-800">
                                    −{a.cantidad}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-border bg-slate-50/80 px-5 py-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Total de vales
                </p>
                <p className="text-xl font-bold tabular-nums text-slate-900">{totalVales}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Total de pallets
                </p>
                <p className="text-xl font-bold tabular-nums text-brand-700">{totalPallets}</p>
              </div>
            </div>
          </CardBody>
        </Card>
      ) : tab === 'retiros' ? (
        <Card className="overflow-hidden shadow-panel">
          <div className="border-b border-surface-border px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Retiros realizados</h2>
          </div>
          {retiros.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">Todavía no hay retiros</p>
          ) : (
            <ul className="divide-y divide-surface-border">
              {retiros.map((r) => {
                const direccion =
                  r.cliente_direccion || clientesById.get(r.cliente_id)?.direccion || ''
                return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">
                      {r.cliente_nombre}{' '}
                      <span className="font-mono text-xs text-slate-500">#{r.cliente_codigo}</span>
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {direccion || 'Sin dirección'}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {r.fecha} · {labelTipo(r.tipo_pallet)}
                      {r.observacion ? ` · ${r.observacion}` : ''}
                    </p>
                  </div>
                  <span className="text-lg font-bold tabular-nums text-slate-800">{r.cantidad}</span>
                </li>
                )
              })}
            </ul>
          )}
        </Card>
      ) : tab === 'clientes' ? (
        showClienteForm ? (
          <Card className="mx-auto max-w-lg shadow-panel">
            <CardBody className="space-y-3">
              <button
                type="button"
                className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
                onClick={cerrarFormCliente}
              >
                <ChevronLeft className="h-4 w-4" />
                Volver al listado
              </button>
              <h2 className="text-lg font-semibold text-slate-900">
                {editingClienteId ? 'Editar cliente / sucursal' : 'Nuevo cliente / sucursal'}
              </h2>
              <Input
                label="Código / ID empresa"
                value={clienteForm.codigo}
                onChange={(e) => setClienteForm((f) => ({ ...f, codigo: e.target.value }))}
              />
              <Input
                label="Nombre"
                value={clienteForm.nombre}
                onChange={(e) => setClienteForm((f) => ({ ...f, nombre: e.target.value }))}
              />
              <Input
                label="Dirección"
                value={clienteForm.direccion}
                onChange={(e) => setClienteForm((f) => ({ ...f, direccion: e.target.value }))}
              />
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={clienteForm.activo}
                  onChange={(e) => setClienteForm((f) => ({ ...f, activo: e.target.checked }))}
                />
                Activo
              </label>
              <Button className="w-full rounded-xl" disabled={saving} onClick={() => void guardarCliente()}>
                {saving ? '…' : editingClienteId ? 'Guardar cambios' : 'Crear cliente'}
              </Button>
            </CardBody>
          </Card>
        ) : (
          <Card className="overflow-hidden shadow-panel">
            <div className="flex flex-wrap items-center gap-2 border-b border-surface-border p-3">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400" />
                <input
                  type="search"
                  placeholder="Buscar cliente…"
                  value={clienteSearch}
                  onChange={(e) => setClienteSearch(e.target.value)}
                  className="w-full rounded-xl border border-surface-border bg-white py-2 pl-9 pr-3 text-sm"
                />
              </div>
              {canCreate && (
                <Button className="shrink-0 rounded-xl" onClick={abrirNuevoCliente}>
                  <Plus className="h-4 w-4" />
                  Crear
                </Button>
              )}
            </div>
            {clientesFiltrados.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <p className="text-sm text-slate-500">
                  {clienteSearch.trim() ? 'No hay clientes con esa búsqueda' : 'Todavía no hay clientes'}
                </p>
                {canCreate && !clienteSearch.trim() && (
                  <Button className="mt-4 rounded-xl" size="sm" onClick={abrirNuevoCliente}>
                    <Plus className="h-4 w-4" />
                    Crear cliente
                  </Button>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-surface-border">
                {clientesFiltrados.map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-2 px-4 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">
                        <span className="mr-1.5 font-mono text-xs text-slate-500">#{c.codigo}</span>
                        {c.nombre}
                      </p>
                      <p className="truncate text-xs text-slate-500">{c.direccion || 'Sin dirección'}</p>
                      <p className="mt-0.5 text-xs text-slate-400">Saldo vales: {c.saldo_pallets}</p>
                    </div>
                    {canEdit && (
                      <Button variant="ghost" size="sm" className="shrink-0" onClick={() => editarCliente(c)}>
                        Editar
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )
      ) : tab === 'archivados' ? (
        <Card className="overflow-hidden shadow-panel">
          <div className="border-b border-surface-border bg-slate-50/80 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Archivados</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Vales completados (sin saldo) y vencidos
            </p>
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400" />
              <input
                type="text"
                placeholder="Buscar mercado por código o nombre…"
                value={mercadoQuery}
                onChange={(e) => {
                  setMercadoQuery(e.target.value)
                  setMercadoSeleccionado(null)
                }}
                onKeyDown={handleMercadoKeyDown}
                className={cn(
                  'w-full rounded-xl border border-surface-border bg-white py-2.5 pl-9 text-sm',
                  mercadoSeleccionado ? 'pr-20' : 'pr-3'
                )}
              />
              {mercadoSeleccionado && (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  onClick={limpiarMercado}
                >
                  Limpiar
                </button>
              )}
              {mercadosSugeridos.length > 0 && (
                <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-surface-border bg-white py-1 shadow-lg">
                  {mercadosSugeridos.map((c, idx) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className={cn(
                          'flex w-full items-start justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-brand-50',
                          idx === mercadoHighlightIndex && KB_HIGHLIGHT_ROW
                        )}
                        onMouseEnter={() => setMercadoHighlightIndex(idx)}
                        onClick={() => elegirMercado(c)}
                      >
                        <span className="min-w-0">
                          <span className="font-semibold text-slate-900">
                            <span className="mr-1.5 font-mono text-xs text-slate-500">#{c.codigo}</span>
                            {c.nombre}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <CardBody className="p-0">
            {valesArchivadosMercado.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-slate-500">
                {mercadoSeleccionado
                  ? 'Este mercado no tiene vales archivados'
                  : 'No hay vales archivados'}
              </p>
            ) : (
              <ul className="divide-y divide-surface-border">
                {valesArchivadosMercado.map((v) => {
                  const hoy = todayIsoDate()
                  const vencido = v.vencimiento < hoy
                  const completado = v.cantidad_restante === 0
                  const abierto = valeExpandidoId === v.id
                  const apps = aplicacionesByVale.get(v.id) ?? []
                  return (
                    <li
                      key={v.id}
                      className={cn(
                        completado ? 'bg-slate-50/80' : vencido ? 'bg-red-50/50' : undefined
                      )}
                    >
                      <button
                        type="button"
                        className="flex w-full flex-wrap items-center justify-between gap-2 px-5 py-3 text-left text-sm hover:bg-slate-50/80"
                        onClick={() => setValeExpandidoId(abierto ? null : v.id)}
                        aria-expanded={abierto}
                      >
                        <div className="flex min-w-0 items-start gap-2">
                          <ChevronDown
                            className={cn(
                              'mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform',
                              abierto && 'rotate-180 text-brand-600'
                            )}
                          />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-slate-900">
                                {v.cliente_nombre}{' '}
                                <span className="font-mono text-xs text-slate-500">#{v.cliente_codigo}</span>
                              </p>
                              {completado ? (
                                <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                                  Completado
                                </span>
                              ) : null}
                              {vencido ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
                                  <AlertTriangle className="h-3 w-3" />
                                  Vencido
                                </span>
                              ) : null}
                            </div>
                            <p className="text-xs text-slate-500">
                              {labelTipo(v.tipo_pallet)} · {v.cantidad_restante}/{v.cantidad_inicial} ·
                              vence {v.vencimiento}
                              {v.observacion ? ` · ${v.observacion}` : ''}
                            </p>
                          </div>
                        </div>
                        <span className="text-lg font-bold tabular-nums text-slate-700">
                          {v.cantidad_restante}
                        </span>
                      </button>
                      {abierto && (
                        <div className="border-t border-surface-border/80 bg-white/70 px-5 py-3 pl-11">
                          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                            Retiros de este vale
                          </p>
                          {apps.length === 0 ? (
                            <p className="text-sm text-slate-500">Sin retiros registrados</p>
                          ) : (
                            <ul className="space-y-1.5">
                              {apps.map((a) => (
                                <li
                                  key={a.id}
                                  className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"
                                >
                                  <div className="min-w-0">
                                    <p className="font-medium text-slate-800">{a.fecha}</p>
                                    {a.observacion ? (
                                      <p className="truncate text-xs text-slate-500">{a.observacion}</p>
                                    ) : null}
                                  </div>
                                  <span className="shrink-0 font-bold tabular-nums text-slate-800">
                                    −{a.cantidad}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      ) : null}
    </div>
  )
}
