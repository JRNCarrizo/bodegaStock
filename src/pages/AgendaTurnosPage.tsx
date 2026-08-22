import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  History,
  Loader2,
  Plus,
  Settings,
  Truck,
  X
} from 'lucide-react'
import { api, cn } from '@/lib/utils'
import { useAuth } from '@/context/AuthContext'
import { useEscHandler } from '@/hooks/useEscHandler'
import type {
  AgendaTurno,
  AgendaTurnoEstado,
  AgendaTurnoForm,
  AgendaTurnoUnidad,
  InsumoTransportista
} from '@/types'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardBody } from '@/components/ui/Card'
import { PaginationControls } from '@/components/PaginationControls'

const HISTORIAL_ROW_PX = 58
/** Espacio reservado (header app, título, filtros, paginación, márgenes). */
const HISTORIAL_CHROME_PX = 360

function historialPageSizeFromViewport(): number {
  if (typeof window === 'undefined') return 10
  const available = Math.max(200, window.innerHeight - HISTORIAL_CHROME_PX)
  return Math.max(5, Math.min(40, Math.floor(available / HISTORIAL_ROW_PX)))
}

/** Celdas Lun–Dom del mes (null = vacío). */
function monthGridCells(year: number, monthIndex: number): (string | null)[] {
  const first = new Date(year, monthIndex, 1)
  const pad = (first.getDay() + 6) % 7
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const cells: (string | null)[] = []
  for (let i = 0; i < pad; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(toIsoDate(new Date(year, monthIndex, d)))
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

function monthTitle(year: number, monthIndex: number): string {
  const label = new Date(year, monthIndex, 1).toLocaleDateString('es-AR', {
    month: 'long',
    year: 'numeric'
  })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const
const DIAS_LARGOS = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo'
] as const

const UNIDADES: { value: AgendaTurnoUnidad; label: string }[] = [
  { value: 'PALLETS', label: 'Pallets' },
  { value: 'CAJAS', label: 'Cajas' },
  { value: 'BULTOS', label: 'Bultos' }
]

const ESTADO_STYLE: Record<AgendaTurnoEstado, string> = {
  SOLICITADO: 'bg-amber-50 text-amber-950 ring-amber-300',
  CONFIRMADO: 'bg-emerald-50 text-emerald-950 ring-emerald-300',
  CANCELADO: 'bg-slate-100 text-slate-600 ring-slate-300'
}

const ESTADO_LABEL: Record<AgendaTurnoEstado, string> = {
  SOLICITADO: 'Solicitado',
  CONFIRMADO: 'Confirmado',
  CANCELADO: 'Cancelado'
}

function notifyAgendaPendientesChanged() {
  window.dispatchEvent(new Event('agenda-turnos-pendientes-changed'))
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y!, m! - 1, d!)
}

/** Índice Lun=0 … Dom=6. */
function mondayIndexFromIso(iso: string): number {
  return (parseIso(iso).getDay() + 6) % 7
}

function startOfWeekMonday(ref: Date): Date {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate())
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

function formatDayLong(iso: string): string {
  return parseIso(iso).toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'short'
  })
}

function unidadLabel(u: AgendaTurnoUnidad): string {
  return UNIDADES.find((x) => x.value === u)?.label.toLowerCase() ?? u.toLowerCase()
}

function lineaEnvioTexto(turno: Pick<AgendaTurno, 'descripcion' | 'cantidad' | 'unidad'>): string {
  if (turno.cantidad == null) return turno.descripcion
  return `${turno.descripcion} · ${turno.cantidad} ${unidadLabel(turno.unidad)}`
}

function emptyForm(fecha = toIsoDate(new Date())): AgendaTurnoForm {
  return {
    fecha,
    descripcion: '',
    cantidad: '',
    unidad: 'PALLETS',
    transportista_id: '',
    notas: '',
    estado: 'SOLICITADO'
  }
}

function pickPrimaryTurno(items: AgendaTurno[]): AgendaTurno | null {
  if (items.length === 0) return null
  return (
    items.find((t) => t.estado === 'SOLICITADO') ??
    items.find((t) => t.estado === 'CONFIRMADO') ??
    items[0]!
  )
}

function TurnoCard({
  turno,
  canEdit,
  busyId,
  onOpen,
  onEstado
}: {
  turno: AgendaTurno
  canEdit: boolean
  busyId: number | null
  onOpen: () => void
  onEstado: (estado: 'CONFIRMADO' | 'CANCELADO') => void
}) {
  const busy = busyId === turno.id
  const showActions = canEdit && turno.estado === 'SOLICITADO'
  const editable = turno.estado === 'SOLICITADO'
  const lineaEnvio = lineaEnvioTexto(turno)

  return (
    <div
      className={cn(
        'flex h-[6.75rem] flex-col rounded-lg px-2 py-2 ring-2',
        ESTADO_STYLE[turno.estado],
        turno.estado === 'CANCELADO' && 'opacity-75'
      )}
    >
      <p className="shrink-0 text-[10px] font-semibold uppercase tracking-wide opacity-70">
        {ESTADO_LABEL[turno.estado]}
      </p>
      <button
        type="button"
        onClick={() => {
          if (editable) onOpen()
        }}
        disabled={!editable}
        title={editable ? 'Editar' : 'Confirmado: no se puede editar'}
        className={cn(
          'mt-1 w-full min-w-0 space-y-0.5 text-left',
          editable ? 'cursor-pointer' : 'cursor-default'
        )}
      >
        <div
          className={cn(
            'scrollbar-none-x overflow-x-auto whitespace-nowrap text-xs font-semibold text-slate-900',
            turno.estado === 'CANCELADO' && 'line-through text-slate-500'
          )}
        >
          {lineaEnvio}
        </div>
        <p
          className={cn(
            'truncate text-[11px] text-slate-600',
            turno.estado === 'CANCELADO' && 'line-through'
          )}
        >
          {turno.transportista_nombre}
        </p>
      </button>
      {/* Altura fija de acciones: con o sin botones, el día no cambia de tamaño */}
      <div className="mt-auto flex h-7 shrink-0 items-center justify-end gap-1.5">
        {showActions ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => onEstado('CONFIRMADO')}
              title="Confirmar"
              aria-label="Confirmar"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onEstado('CANCELADO')}
              title="Cancelar"
              aria-label="Cancelar"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-slate-500 text-white hover:bg-slate-600 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
            </button>
          </>
        ) : null}
      </div>
    </div>
  )
}

export function AgendaTurnosPage() {
  const { hasPermiso } = useAuth()
  const canCreate = hasPermiso('agenda_turnos.crear')
  const canEdit = hasPermiso('agenda_turnos.editar')

  const [tab, setTab] = useState<'semana' | 'historial'>('semana')
  const [anchorMonday, setAnchorMonday] = useState(() => startOfWeekMonday(new Date()))
  const [turnos, setTurnos] = useState<AgendaTurno[]>([])
  const [historial, setHistorial] = useState<AgendaTurno[]>([])
  const [transportistas, setTransportistas] = useState<InsumoTransportista[]>([])
  const [diasInhabiles, setDiasInhabiles] = useState<number[]>([5, 6])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [historialQ, setHistorialQ] = useState('')
  const [historialEstado, setHistorialEstado] = useState<'' | AgendaTurnoEstado>('')
  const [historialFecha, setHistorialFecha] = useState('')
  const [historialPage, setHistorialPage] = useState(1)
  const [historialPageSize, setHistorialPageSize] = useState(() => historialPageSizeFromViewport())
  const [calModal, setCalModal] = useState(false)
  const [calMonth, setCalMonth] = useState(() => {
    const n = new Date()
    return { year: n.getFullYear(), month: n.getMonth() }
  })
  const [estadoBusyId, setEstadoBusyId] = useState<number | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<AgendaTurno | null>(null)
  const [form, setForm] = useState<AgendaTurnoForm>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const [trModal, setTrModal] = useState(false)
  const [trNombre, setTrNombre] = useState('')
  const [trSaving, setTrSaving] = useState(false)

  const [cfgModal, setCfgModal] = useState(false)
  const [cfgDias, setCfgDias] = useState<number[]>([5, 6])
  const [cfgSaving, setCfgSaving] = useState(false)
  const [cfgError, setCfgError] = useState('')
  /** Día con varios turnos: panel “ver todos”. */
  const [diaPanelIso, setDiaPanelIso] = useState<string | null>(null)

  useEscHandler(modalOpen || trModal || cfgModal || !!diaPanelIso || calModal, () => {
    if (trModal) {
      setTrModal(false)
      return true
    }
    if (cfgModal) {
      setCfgModal(false)
      return true
    }
    if (calModal) {
      setCalModal(false)
      return true
    }
    if (diaPanelIso) {
      setDiaPanelIso(null)
      return true
    }
    if (modalOpen) {
      setModalOpen(false)
      return true
    }
    return false
  })

  const week1 = useMemo(
    () => Array.from({ length: 7 }, (_, i) => toIsoDate(addDays(anchorMonday, i))),
    [anchorMonday]
  )
  const week2 = useMemo(
    () => Array.from({ length: 7 }, (_, i) => toIsoDate(addDays(anchorMonday, 7 + i))),
    [anchorMonday]
  )
  const rangeDesde = week1[0]!
  const rangeHasta = week2[6]!

  const inhabilSet = useMemo(() => new Set(diasInhabiles), [diasInhabiles])

  const loadConfig = useCallback(async () => {
    const cfg = await api<{ dias_inhabiles: number[] }>('/api/agenda-turnos/config')
    setDiasInhabiles(cfg.dias_inhabiles)
  }, [])

  const loadTransportistas = useCallback(async () => {
    const rows = await api<InsumoTransportista[]>('/api/insumos-transportistas')
    setTransportistas(rows)
  }, [])

  const loadSemana = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const rows = await api<AgendaTurno[]>(
        `/api/agenda-turnos?desde=${rangeDesde}&hasta=${rangeHasta}`
      )
      setTurnos(rows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la agenda')
    } finally {
      setLoading(false)
    }
  }, [rangeDesde, rangeHasta])

  const loadHistorial = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (historialEstado) params.set('estado', historialEstado)
      const qs = params.toString()
      const rows = await api<AgendaTurno[]>(`/api/agenda-turnos${qs ? `?${qs}` : ''}`)
      setHistorial([...rows].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el historial')
    } finally {
      setLoading(false)
    }
  }, [historialEstado])

  const historialFiltrado = useMemo(() => {
    const q = historialQ.trim().toLowerCase()
    return historial.filter((t) => {
      if (historialEstado && t.estado !== historialEstado) return false
      if (historialFecha && t.fecha !== historialFecha) return false
      if (!q) return true
      return (
        t.descripcion.toLowerCase().includes(q) ||
        t.transportista_nombre.toLowerCase().includes(q) ||
        (t.notas ?? '').toLowerCase().includes(q)
      )
    })
  }, [historial, historialQ, historialEstado, historialFecha])

  const historialCountsByFecha = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of historial) {
      if (historialEstado && t.estado !== historialEstado) continue
      map.set(t.fecha, (map.get(t.fecha) ?? 0) + 1)
    }
    return map
  }, [historial, historialEstado])

  const calCells = useMemo(
    () => monthGridCells(calMonth.year, calMonth.month),
    [calMonth.year, calMonth.month]
  )

  const historialTotalPages = Math.max(1, Math.ceil(historialFiltrado.length / historialPageSize))
  const historialPageSafe = Math.min(historialPage, historialTotalPages)
  const historialPageItems = useMemo(() => {
    const start = (historialPageSafe - 1) * historialPageSize
    return historialFiltrado.slice(start, start + historialPageSize)
  }, [historialFiltrado, historialPageSafe, historialPageSize])

  useEffect(() => {
    function syncPageSize() {
      setHistorialPageSize(historialPageSizeFromViewport())
    }
    syncPageSize()
    window.addEventListener('resize', syncPageSize)
    return () => window.removeEventListener('resize', syncPageSize)
  }, [])

  useEffect(() => {
    setHistorialPage(1)
  }, [historialQ, historialEstado, historialFecha, historialPageSize])

  useEffect(() => {
    void loadTransportistas()
    void loadConfig()
  }, [loadTransportistas, loadConfig])

  useEffect(() => {
    if (tab === 'semana') void loadSemana()
    else void loadHistorial()
  }, [tab, loadSemana, loadHistorial])

  useEffect(() => {
    if (tab === 'historial') setHistorialPage(1)
  }, [tab])

  const byFecha = useMemo(() => {
    const map = new Map<string, AgendaTurno[]>()
    for (const t of turnos) {
      const list = map.get(t.fecha) ?? []
      list.push(t)
      map.set(t.fecha, list)
    }
    return map
  }, [turnos])

  function openCreate(fecha?: string) {
    const f = fecha ?? toIsoDate(new Date())
    if (inhabilSet.has(mondayIndexFromIso(f))) {
      setError('Ese día está anulado (no laborable).')
      return
    }
    setEditing(null)
    setForm(emptyForm(f))
    setFormError('')
    setModalOpen(true)
  }

  function openEdit(turno: AgendaTurno) {
    // Solo se edita si sigue solicitado; confirmado/cancelado no abren el modal.
    if (turno.estado !== 'SOLICITADO') return
    setEditing(turno)
    setForm({
      fecha: turno.fecha,
      descripcion: turno.descripcion,
      cantidad: turno.cantidad != null ? String(turno.cantidad) : '',
      unidad: turno.unidad,
      transportista_id: turno.transportista_id,
      notas: turno.notas ?? '',
      estado: turno.estado
    })
    setFormError('')
    setModalOpen(true)
  }

  function openConfig() {
    setCfgDias([...diasInhabiles])
    setCfgError('')
    setCfgModal(true)
  }

  async function saveConfig(e: React.FormEvent) {
    e.preventDefault()
    setCfgSaving(true)
    setCfgError('')
    try {
      const cfg = await api<{ dias_inhabiles: number[] }>('/api/agenda-turnos/config', {
        method: 'PUT',
        body: JSON.stringify({ dias_inhabiles: cfgDias })
      })
      setDiasInhabiles(cfg.dias_inhabiles)
      setCfgModal(false)
    } catch (err) {
      setCfgError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setCfgSaving(false)
    }
  }

  async function cambiarEstado(turno: AgendaTurno, estado: 'CONFIRMADO' | 'CANCELADO') {
    if (!canEdit) return
    setEstadoBusyId(turno.id)
    setError('')
    try {
      const updated = await api<AgendaTurno>(`/api/agenda-turnos/${turno.id}`, {
        method: 'PUT',
        body: JSON.stringify({ estado })
      })
      setTurnos((list) => list.map((t) => (t.id === updated.id ? updated : t)))
      setHistorial((list) => list.map((t) => (t.id === updated.id ? updated : t)))
      notifyAgendaPendientesChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el estado')
    } finally {
      setEstadoBusyId(null)
    }
  }

  async function saveTurno(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!form.descripcion.trim()) {
      setFormError('Indicá qué se envía')
      return
    }
    const cantidadRaw = form.cantidad.trim()
    let cantidad: number | null = null
    if (cantidadRaw) {
      cantidad = Number(cantidadRaw)
      if (!Number.isFinite(cantidad) || cantidad <= 0) {
        setFormError('Cantidad inválida')
        return
      }
    }
    if (!form.transportista_id) {
      setFormError('Elegí un transportista')
      return
    }
    if (inhabilSet.has(mondayIndexFromIso(form.fecha))) {
      setFormError('Ese día está anulado (no laborable).')
      return
    }

    setSaving(true)
    try {
      const payload = {
        fecha: form.fecha,
        descripcion: form.descripcion.trim(),
        cantidad,
        unidad: form.unidad,
        transportista_id: Number(form.transportista_id),
        notas: form.notas.trim() || null
      }
      if (editing) {
        await api(`/api/agenda-turnos/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        })
      } else {
        await api('/api/agenda-turnos', {
          method: 'POST',
          body: JSON.stringify(payload)
        })
      }
      setModalOpen(false)
      notifyAgendaPendientesChanged()
      if (tab === 'semana') await loadSemana()
      else await loadHistorial()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  async function saveTransportista(e: React.FormEvent) {
    e.preventDefault()
    if (!trNombre.trim()) return
    setTrSaving(true)
    try {
      const created = await api<InsumoTransportista>('/api/insumos-transportistas', {
        method: 'POST',
        body: JSON.stringify({ nombre: trNombre.trim() })
      })
      await loadTransportistas()
      setForm((f) => ({ ...f, transportista_id: created.id }))
      setTrNombre('')
      setTrModal(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo crear el transportista')
    } finally {
      setTrSaving(false)
    }
  }

  const hoyIso = toIsoDate(new Date())
  const activos = transportistas.filter((t) => t.activo)

  function renderWeek(dias: string[], titulo: string) {
    const visibles = dias
      .map((iso, weekdayIndex) => ({ iso, weekdayIndex }))
      .filter(({ weekdayIndex }) => !inhabilSet.has(weekdayIndex))

    if (visibles.length === 0) {
      return (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">{titulo}</h2>
          <p className="rounded-xl border border-dashed border-surface-border bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
            Todos los días de esta semana están anulados.
          </p>
        </div>
      )
    }

    return (
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">{titulo}</h2>
        <div
          className="grid gap-2.5"
          style={{
            gridTemplateColumns: `repeat(${Math.min(visibles.length, 5)}, minmax(0, 1fr))`
          }}
        >
          {visibles.map(({ iso, weekdayIndex }) => {
            const items = byFecha.get(iso) ?? []
            const primary = pickPrimaryTurno(items)
            const extra = Math.max(0, items.length - (primary ? 1 : 0))
            const isToday = iso === hoyIso
            return (
              <div
                key={iso}
                className={cn(
                  'flex h-[13.5rem] flex-col overflow-hidden rounded-xl border-2 bg-white p-2.5 shadow-md',
                  isToday
                    ? 'border-brand-500 shadow-brand-100/80 ring-2 ring-brand-200'
                    : 'border-slate-300 shadow-slate-200/70'
                )}
              >
                <div className="mb-2 flex shrink-0 items-start justify-between gap-1">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      {DIAS[weekdayIndex]}
                    </p>
                    <p
                      className={cn(
                        'text-base font-bold leading-none',
                        isToday ? 'text-brand-700' : 'text-slate-900'
                      )}
                    >
                      {parseIso(iso).getDate()}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    {items.length > 0 && (
                      <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                        {items.length}
                      </span>
                    )}
                    {canCreate && (
                      <button
                        type="button"
                        onClick={() => openCreate(iso)}
                        className="rounded-md p-1 text-slate-500 hover:bg-brand-50 hover:text-brand-700"
                        title="Agendar"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {!primary ? (
                  <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50/80">
                    <p className="text-[11px] font-medium text-slate-400">Sin turnos</p>
                  </div>
                ) : (
                  <div className="flex min-h-0 flex-1 flex-col gap-1.5">
                    <TurnoCard
                      turno={primary}
                      canEdit={canEdit}
                      busyId={estadoBusyId}
                      onOpen={() => openEdit(primary)}
                      onEstado={(estado) => void cambiarEstado(primary, estado)}
                    />
                    <div className="mt-auto h-[26px] shrink-0">
                      {extra > 0 ? (
                        <button
                          type="button"
                          onClick={() => setDiaPanelIso(iso)}
                          className="h-full w-full rounded-md border border-dashed border-slate-400 bg-slate-100 px-1.5 text-[11px] font-semibold text-slate-700 hover:border-brand-400 hover:bg-brand-50 hover:text-brand-800"
                        >
                          +{extra} más
                        </button>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
            <CalendarDays className="h-7 w-7 text-brand-600" />
            Agenda de turnos
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Envíos de insumos a Mendoza · transportistas propios (no flota de reparto)
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <Button type="button" variant="secondary" className="rounded-xl" onClick={openConfig}>
              <Settings className="h-4 w-4" />
              Días
            </Button>
          )}
          {canCreate && (
            <Button className="rounded-xl" onClick={() => openCreate()}>
              <Plus className="h-4 w-4" />
              Nuevo turno
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-surface-border pb-px">
        <button
          type="button"
          onClick={() => setTab('semana')}
          className={cn(
            'rounded-t-lg px-4 py-2 text-sm font-medium',
            tab === 'semana'
              ? 'bg-white text-brand-800 ring-1 ring-surface-border ring-b-white'
              : 'text-slate-500 hover:text-slate-800'
          )}
        >
          Semanas
        </button>
        <button
          type="button"
          onClick={() => setTab('historial')}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-t-lg px-4 py-2 text-sm font-medium',
            tab === 'historial'
              ? 'bg-white text-brand-800 ring-1 ring-surface-border ring-b-white'
              : 'text-slate-500 hover:text-slate-800'
          )}
        >
          <History className="h-3.5 w-3.5" />
          Historial
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-100">
          {error}
        </div>
      )}

      {tab === 'semana' && (
        <Card className="border-slate-300 bg-slate-100/90 shadow-sm ring-1 ring-slate-200/80">
          <CardBody className="space-y-8">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="rounded-xl"
                onClick={() => setAnchorMonday((d) => addDays(d, -7))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="rounded-xl"
                onClick={() => setAnchorMonday(startOfWeekMonday(new Date()))}
              >
                Hoy
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="rounded-xl"
                onClick={() => setAnchorMonday((d) => addDays(d, 7))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 py-12 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando agenda…
              </div>
            ) : (
              <>
                {renderWeek(week1, 'Semana actual')}
                {renderWeek(week2, 'Semana siguiente')}
              </>
            )}
          </CardBody>
        </Card>
      )}

      {tab === 'historial' && (
        <Card>
          <CardBody className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <Input
                label="Buscar"
                value={historialQ}
                onChange={(e) => setHistorialQ(e.target.value)}
                placeholder="Descripción, transportista…"
                className="min-w-[200px] flex-1"
              />
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium text-slate-700">Estado</span>
                <select
                  value={historialEstado}
                  onChange={(e) => setHistorialEstado(e.target.value as '' | AgendaTurnoEstado)}
                  className="w-full rounded-xl border border-surface-border bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                >
                  <option value="">Todos</option>
                  <option value="SOLICITADO">Solicitado</option>
                  <option value="CONFIRMADO">Confirmado</option>
                  <option value="CANCELADO">Cancelado</option>
                </select>
              </label>
              <Button
                type="button"
                variant="secondary"
                className="rounded-xl"
                onClick={() => {
                  if (historialFecha) {
                    const d = parseIso(historialFecha)
                    setCalMonth({ year: d.getFullYear(), month: d.getMonth() })
                  } else {
                    const n = new Date()
                    setCalMonth({ year: n.getFullYear(), month: n.getMonth() })
                  }
                  setCalModal(true)
                }}
              >
                <CalendarDays className="h-4 w-4" />
                Calendario
              </Button>
            </div>

            {historialFecha && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-800 ring-1 ring-brand-200">
                  Día: {formatDayLong(historialFecha)}
                </span>
                <button
                  type="button"
                  onClick={() => setHistorialFecha('')}
                  className="text-xs font-medium text-slate-500 hover:text-slate-800"
                >
                  Quitar filtro de fecha
                </button>
              </div>
            )}

            {loading ? (
              <div className="flex items-center gap-2 py-12 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando…
              </div>
            ) : historialFiltrado.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">Sin registros en el historial.</p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-surface-border bg-white">
                <ul className="divide-y divide-surface-border">
                  {historialPageItems.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => openEdit(t)}
                        className="flex min-h-[58px] w-full flex-wrap items-center gap-3 px-4 py-3 text-left text-sm hover:bg-surface-muted/50"
                      >
                        <span className="w-28 shrink-0 font-medium text-slate-700">{t.fecha}</span>
                        <span className="min-w-0 flex-1">
                          <span className="font-medium text-slate-900">
                            {lineaEnvioTexto(t)}
                          </span>
                          <span className="mt-0.5 block text-xs text-slate-500">
                            {t.transportista_nombre}
                            {t.notas ? ` · ${t.notas}` : ''}
                          </span>
                        </span>
                        <span
                          className={cn(
                            'rounded-full px-2.5 py-0.5 text-xs font-medium ring-1',
                            ESTADO_STYLE[t.estado]
                          )}
                        >
                          {ESTADO_LABEL[t.estado]}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                {historialFiltrado.length > historialPageSize && (
                  <PaginationControls
                    page={historialPageSafe}
                    pageSize={historialPageSize}
                    total={historialFiltrado.length}
                    onPageChange={setHistorialPage}
                    disabled={loading}
                  />
                )}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl ring-1 ring-surface-border"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {editing ? 'Editar turno' : 'Nuevo turno'}
                </h2>
                {!editing && (
                  <p className="mt-0.5 text-xs text-slate-500">
                    Se crea como <strong>Solicitado</strong>. Después confirmás o cancelás en la tarjeta.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form className="space-y-4" onSubmit={(e) => void saveTurno(e)}>
              {formError && (
                <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">
                  {formError}
                </div>
              )}

              <Input
                label="Fecha"
                type="date"
                required
                value={form.fecha}
                onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
                disabled={!canEdit && !!editing}
              />
              <Input
                label="Qué se envía"
                required
                placeholder="Ej. Etiquetas"
                value={form.descripcion}
                onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                disabled={!canEdit && !!editing}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Cantidad (opcional)"
                  type="number"
                  min="0.01"
                  step="any"
                  value={form.cantidad}
                  onChange={(e) => setForm((f) => ({ ...f, cantidad: e.target.value }))}
                  disabled={!canEdit && !!editing}
                />
                <label className="block text-sm">
                  <span className="mb-1.5 block font-medium text-slate-700">Unidad</span>
                  <select
                    value={form.unidad}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, unidad: e.target.value as AgendaTurnoUnidad }))
                    }
                    disabled={!canEdit && !!editing}
                    className="w-full rounded-xl border border-surface-border bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  >
                    {UNIDADES.map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">Transportista</span>
                  {canCreate && (
                    <button
                      type="button"
                      onClick={() => setTrModal(true)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
                    >
                      <Truck className="h-3.5 w-3.5" />
                      Nuevo
                    </button>
                  )}
                </div>
                <select
                  required
                  value={form.transportista_id}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      transportista_id: e.target.value ? Number(e.target.value) : ''
                    }))
                  }
                  disabled={!canEdit && !!editing}
                  className="w-full rounded-xl border border-surface-border bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                >
                  <option value="">Elegir…</option>
                  {activos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}
                    </option>
                  ))}
                  {editing &&
                    !activos.some((t) => t.id === editing.transportista_id) && (
                      <option value={editing.transportista_id}>
                        {editing.transportista_nombre} (inactivo)
                      </option>
                    )}
                </select>
              </div>

              <label className="block text-sm">
                <span className="mb-1.5 block font-medium text-slate-700">Notas</span>
                <textarea
                  rows={2}
                  value={form.notas}
                  onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
                  disabled={!canEdit && !!editing}
                  className="w-full rounded-xl border border-surface-border bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  placeholder="Opcional"
                />
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="rounded-xl"
                  onClick={() => setModalOpen(false)}
                >
                  Cerrar
                </Button>
                {(canCreate && !editing) || (canEdit && editing) ? (
                  <Button type="submit" className="rounded-xl" disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Guardar
                  </Button>
                ) : null}
              </div>
            </form>
          </div>
        </div>
      )}

      {calModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl ring-1 ring-surface-border sm:p-5"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-900">Calendario</h3>
              <button
                type="button"
                onClick={() => setCalModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-3 flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="rounded-xl"
                onClick={() =>
                  setCalMonth((m) => {
                    const d = new Date(m.year, m.month - 1, 1)
                    return { year: d.getFullYear(), month: d.getMonth() }
                  })
                }
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <p className="text-sm font-semibold text-slate-800">
                {monthTitle(calMonth.year, calMonth.month)}
              </p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="rounded-xl"
                onClick={() =>
                  setCalMonth((m) => {
                    const d = new Date(m.year, m.month + 1, 1)
                    return { year: d.getFullYear(), month: d.getMonth() }
                  })
                }
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="mb-1 grid grid-cols-7 gap-1">
              {DIAS.map((d) => (
                <div
                  key={d}
                  className="py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400"
                >
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {calCells.map((iso, idx) => {
                if (!iso) {
                  return <div key={`e-${idx}`} className="aspect-square" />
                }
                const count = historialCountsByFecha.get(iso) ?? 0
                const selected = historialFecha === iso
                const isToday = iso === toIsoDate(new Date())
                const dayNum = parseIso(iso).getDate()
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => {
                      setHistorialFecha(iso)
                      setCalModal(false)
                    }}
                    className={cn(
                      'relative flex aspect-square flex-col items-center justify-center rounded-lg text-sm font-semibold transition',
                      selected
                        ? 'bg-brand-600 text-white'
                        : count > 0
                          ? 'bg-amber-50 text-slate-900 ring-1 ring-amber-200 hover:bg-amber-100'
                          : 'text-slate-600 hover:bg-slate-100',
                      isToday && !selected && 'ring-2 ring-brand-400'
                    )}
                    title={
                      count > 0
                        ? `${count} turno${count === 1 ? '' : 's'}`
                        : 'Sin registros'
                    }
                  >
                    {dayNum}
                    {count > 0 && (
                      <span
                        className={cn(
                          'mt-0.5 h-1.5 w-1.5 rounded-full',
                          selected ? 'bg-white' : 'bg-amber-500'
                        )}
                      />
                    )}
                  </button>
                )
              })}
            </div>

            <p className="mt-3 text-center text-[11px] text-slate-400">
              Punto = día con turnos. Tocá un día para filtrar el historial.
            </p>
          </div>
        </div>
      )}

      {cfgModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={(e) => void saveConfig(e)}
            className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-xl ring-1 ring-surface-border"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Días anulados</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Marcá los días en los que no se agenda (ej. sábado y domingo).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCfgModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {cfgError && (
              <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">
                {cfgError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {DIAS_LARGOS.map((label, idx) => {
                const checked = cfgDias.includes(idx)
                return (
                  <label
                    key={label}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm',
                      checked
                        ? 'border-slate-300 bg-slate-100 text-slate-700'
                        : 'border-surface-border bg-white text-slate-800'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setCfgDias((prev) =>
                          checked ? prev.filter((d) => d !== idx) : [...prev, idx].sort((a, b) => a - b)
                        )
                      }}
                      className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    {label}
                  </label>
                )
              })}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="secondary"
                className="rounded-xl"
                onClick={() => setCfgModal(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" className="rounded-xl" disabled={cfgSaving}>
                {cfgSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Guardar
              </Button>
            </div>
          </form>
        </div>
      )}

      {diaPanelIso && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl ring-1 ring-surface-border"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Turnos del {formatDayLong(diaPanelIso)}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {(byFecha.get(diaPanelIso) ?? []).length} registro
                  {(byFecha.get(diaPanelIso) ?? []).length === 1 ? '' : 's'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDiaPanelIso(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              {(byFecha.get(diaPanelIso) ?? []).map((t) => (
                <TurnoCard
                  key={t.id}
                  turno={t}
                  canEdit={canEdit}
                  busyId={estadoBusyId}
                  onOpen={() => {
                    setDiaPanelIso(null)
                    openEdit(t)
                  }}
                  onEstado={(estado) => void cambiarEstado(t, estado)}
                />
              ))}
            </div>
            {canCreate && (
              <Button
                type="button"
                className="mt-4 w-full rounded-xl"
                onClick={() => {
                  const iso = diaPanelIso
                  setDiaPanelIso(null)
                  openCreate(iso)
                }}
              >
                <Plus className="h-4 w-4" />
                Agregar turno
              </Button>
            )}
          </div>
        </div>
      )}

      {trModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={(e) => void saveTransportista(e)}
            className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-5 shadow-xl"
          >
            <h3 className="text-base font-semibold text-slate-900">Nuevo transportista</h3>
            <Input
              label="Nombre"
              required
              autoFocus
              value={trNombre}
              onChange={(e) => setTrNombre(e.target.value)}
              placeholder="Ej. Russo, Transportes Catalina"
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                className="rounded-xl"
                onClick={() => setTrModal(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" className="rounded-xl" disabled={trSaving}>
                {trSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Crear
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
