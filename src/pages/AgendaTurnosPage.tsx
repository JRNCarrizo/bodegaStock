import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  History,
  Loader2,
  Package,
  Plus,
  Settings,
  StickyNote,
  Truck,
  X
} from 'lucide-react'
import { api, cn } from '@/lib/utils'
import { isNativeApp } from '@/lib/nativeServer'
import { ScrollableProductName } from '@/components/ScrollableProductName'
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

function formatWeekRange(dias: string[]): string {
  const first = parseIso(dias[0]!)
  const last = parseIso(dias[6]!)
  const sameMonth = first.getMonth() === last.getMonth()
  const d1 = first.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
  const d2 = last.toLocaleDateString('es-AR', {
    day: 'numeric',
    month: sameMonth ? undefined : 'short'
  })
  return `${d1} – ${d2}`
}

function historialPageSizeFromViewport(): number {
  if (typeof window === 'undefined') return 10
  const native = isNativeApp()
  const rowPx = native ? 82 : HISTORIAL_ROW_PX
  const chromePx = native ? 420 : HISTORIAL_CHROME_PX
  const available = Math.max(200, window.innerHeight - chromePx)
  return Math.max(5, Math.min(40, Math.floor(available / rowPx)))
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
  onEstado,
  onEliminar,
  compact = false
}: {
  turno: AgendaTurno
  canEdit: boolean
  busyId: number | null
  onOpen: () => void
  onEstado: (estado: 'CONFIRMADO' | 'CANCELADO') => void
  onEliminar?: () => void
  compact?: boolean
}) {
  const busy = busyId === turno.id
  const showSolicitadoActions = canEdit && turno.estado === 'SOLICITADO'
  const showCanceladoActions = canEdit && turno.estado === 'CANCELADO' && !!onEliminar
  const editable = canEdit && turno.estado !== 'CONFIRMADO'
  const lineaEnvio = lineaEnvioTexto(turno)

  if (compact) {
    return (
      <div
        className={cn(
          'overflow-hidden rounded-xl border bg-white shadow-sm',
          turno.estado === 'SOLICITADO' && 'border-amber-200',
          turno.estado === 'CONFIRMADO' && 'border-emerald-200',
          turno.estado === 'CANCELADO' && 'border-slate-200 opacity-80'
        )}
      >
        <button
          type="button"
          onClick={() => onOpen()}
          className="flex w-full items-start gap-3 px-3 py-2.5 text-left active:bg-slate-50"
          title={editable ? 'Editar turno' : 'Ver turno'}
        >
          <div className="min-w-0 flex-1">
            <ScrollableProductName
              className={cn(
                'text-sm font-semibold text-slate-900',
                turno.estado === 'CANCELADO' && 'line-through text-slate-500'
              )}
            >
              {turno.descripcion}
            </ScrollableProductName>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
              {turno.cantidad != null && (
                <span className="font-medium tabular-nums text-slate-700">
                  {turno.cantidad} {unidadLabel(turno.unidad)}
                </span>
              )}
              {turno.transportista_nombre && (
                <span className="inline-flex items-center gap-1">
                  <Truck className="h-3 w-3 shrink-0" />
                  {turno.transportista_nombre}
                </span>
              )}
            </div>
            {turno.notas?.trim() && (
              <div className="scrollbar-none-x mt-1 overflow-x-auto whitespace-nowrap text-[11px] italic text-slate-500">
                {turno.notas}
              </div>
            )}
          </div>
          {turno.estado === 'CONFIRMADO' ? (
            <span
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xs"
              title="Confirmado"
            >
              <Check className="h-3.5 w-3.5 stroke-[3]" />
            </span>
          ) : (
            <span
              className={cn(
                'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1',
                ESTADO_STYLE[turno.estado]
              )}
            >
              {ESTADO_LABEL[turno.estado]}
            </span>
          )}
        </button>
        {showSolicitadoActions && (
          <div className="grid grid-cols-2 gap-2 border-t border-surface-border px-3 py-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => onEstado('CONFIRMADO')}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-amber-500 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Confirmar
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onEstado('CANCELADO')}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-slate-500 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              Cancelar
            </button>
          </div>
        )}
        {showCanceladoActions && (
          <div className="border-t border-surface-border px-3 py-2">
            <button
              type="button"
              disabled={busy}
              onClick={onEliminar}
              className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5 stroke-[2.5]" />}
              Eliminar de la lista
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return
        onOpen()
      }}
      className={cn(
        'group relative flex h-[4.5rem] shrink-0 flex-col justify-between rounded-lg border px-2 py-1.5 shadow-xs transition-all',
        ESTADO_STYLE[turno.estado],
        turno.estado === 'CANCELADO' && 'opacity-80',
        'cursor-pointer hover:ring-2 hover:ring-brand-400/50'
      )}
      title={editable ? 'Editar turno' : 'Ver turno'}
    >
      <div className="flex items-start justify-between gap-1">
        <button
          type="button"
          onClick={() => onOpen()}
          title={editable ? 'Editar turno' : 'Ver turno'}
          className="min-w-0 flex-1 cursor-pointer text-left"
        >
          <div
            className={cn(
              'scrollbar-none-x overflow-x-auto whitespace-nowrap text-xs font-semibold text-slate-900',
              turno.estado === 'CANCELADO' && 'line-through text-slate-500'
            )}
          >
            {lineaEnvio}
          </div>
        </button>
        {turno.estado === 'CONFIRMADO' ? (
          <span
            className="inline-flex h-4 items-center justify-center rounded bg-emerald-600 px-1 text-white shadow-xs"
            title="Confirmado"
          >
            <Check className="h-3 w-3 stroke-[3]" />
          </span>
        ) : (
          <span className="inline-flex h-4 items-center justify-center rounded px-1.5 text-[9px] font-bold uppercase tracking-wide opacity-80 ring-1 ring-black/5">
            {ESTADO_LABEL[turno.estado]}
          </span>
        )}
      </div>

      <div className="flex h-5 items-center justify-between gap-1">
        <div className="min-w-0 flex-1 truncate text-[10px] text-slate-600">
          {turno.transportista_nombre ? (
            <span className="inline-flex items-center gap-0.5 truncate">
              <Truck className="h-2.5 w-2.5 shrink-0 text-slate-400" />
              <span className={cn(turno.estado === 'CANCELADO' && 'line-through')}>
                {turno.transportista_nombre}
              </span>
            </span>
          ) : (
            <span className="italic text-slate-400">Sin transportista</span>
          )}
        </div>

        <div className="flex h-5 shrink-0 items-center gap-1">
          {showSolicitadoActions && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => onEstado('CONFIRMADO')}
                title="Confirmar"
                aria-label="Confirmar"
                className="inline-flex h-5 w-5 items-center justify-center rounded bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Check className="h-3 w-3" />}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onEstado('CANCELADO')}
                title="Cancelar"
                aria-label="Cancelar"
                className="inline-flex h-5 w-5 items-center justify-center rounded bg-slate-500 text-white hover:bg-slate-600 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <X className="h-3 w-3" />}
              </button>
            </>
          )}
          {showCanceladoActions && (
            <button
              type="button"
              disabled={busy}
              onClick={onEliminar}
              title="Eliminar de la lista"
              aria-label="Eliminar turno cancelado"
              className="inline-flex h-5 w-5 items-center justify-center rounded bg-red-100 text-red-700 hover:bg-red-200 hover:text-red-800 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <X className="h-3.5 w-3.5 stroke-[2.5]" />}
            </button>
          )}
        </div>
      </div>

      <div className="min-h-[14px]">
        {turno.notas?.trim() ? (
          <div className="scrollbar-none-x overflow-x-auto whitespace-nowrap text-[10px] italic text-slate-500">
            {turno.notas}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function AgendaTurnosPage() {
  const { hasPermiso } = useAuth()
  const nativeApp = isNativeApp()
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
  const formReadOnly = !!editing && (editing.estado === 'CONFIRMADO' || !canEdit)
  const canSaveTurno =
    (canCreate && !editing) || (canEdit && !!editing && editing.estado !== 'CONFIRMADO')

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
        (t.transportista_nombre ?? '').toLowerCase().includes(q) ||
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
    setEditing(turno)
    setForm({
      fecha: turno.fecha,
      descripcion: turno.descripcion,
      cantidad: turno.cantidad != null ? String(turno.cantidad) : '',
      unidad: turno.unidad,
      transportista_id: turno.transportista_id ?? '',
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

  async function eliminarTurno(turno: AgendaTurno) {
    if (!canEdit) return
    setEstadoBusyId(turno.id)
    setError('')
    try {
      await api(`/api/agenda-turnos/${turno.id}`, {
        method: 'DELETE'
      })
      setTurnos((list) => list.filter((t) => t.id !== turno.id))
      setHistorial((list) => list.filter((t) => t.id !== turno.id))
      notifyAgendaPendientesChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el turno')
    } finally {
      setEstadoBusyId(null)
    }
  }

  async function saveTurno(e: React.FormEvent) {
    e.preventDefault()
    if (formReadOnly || (editing && editing.estado === 'CONFIRMADO')) return
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
        transportista_id:
          form.transportista_id != null && form.transportista_id !== ''
            ? Number(form.transportista_id)
            : null,
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
  const isCurrentWeek = toIsoDate(anchorMonday) === toIsoDate(startOfWeekMonday(new Date()))

  function renderWeek(dias: string[], titulo: string) {
    const visibles = dias
      .map((iso, weekdayIndex) => ({ iso, weekdayIndex }))
      .filter(({ weekdayIndex }) => !inhabilSet.has(weekdayIndex))

    if (visibles.length === 0) {
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="h-4 w-1 rounded-full bg-brand-500" aria-hidden />
            <h2 className="text-sm font-semibold tracking-tight text-slate-800">{titulo}</h2>
          </div>
          <p className="rounded-2xl border border-dashed border-slate-200 bg-white/80 px-4 py-8 text-center text-sm text-slate-400">
            Todos los días de esta semana están anulados.
          </p>
        </div>
      )
    }

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="h-4 w-1 rounded-full bg-brand-500" aria-hidden />
          <h2 className="text-sm font-semibold tracking-tight text-slate-800">{titulo}</h2>
        </div>
        <div
          className="grid gap-2.5"
          style={{
            gridTemplateColumns: `repeat(${Math.min(visibles.length, 5)}, minmax(0, 1fr))`
          }}
        >
          {visibles.map(({ iso, weekdayIndex }) => {
            const items = byFecha.get(iso) ?? []
            const isToday = iso === hoyIso
            return (
              <div
                key={iso}
                className={cn(
                  'flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition',
                  isToday
                    ? 'border-brand-400 shadow-md shadow-brand-100/70 ring-2 ring-brand-200/80'
                    : 'border-slate-200/90 hover:border-slate-300 hover:shadow-md'
                )}
              >
                <div
                  className={cn(
                    'mb-0 flex shrink-0 items-start justify-between gap-1 border-b px-2.5 py-2',
                    isToday
                      ? 'border-brand-100 bg-gradient-to-br from-brand-50 via-white to-sky-50/40'
                      : 'border-slate-100 bg-gradient-to-b from-slate-50/90 to-white'
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p
                        className={cn(
                          'text-[10px] font-semibold uppercase tracking-wide',
                          isToday ? 'text-brand-600' : 'text-slate-500'
                        )}
                      >
                        {DIAS[weekdayIndex]}
                      </p>
                      {isToday && (
                        <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white shadow-sm">
                          Hoy
                        </span>
                      )}
                    </div>
                    <p
                      className={cn(
                        'mt-0.5 text-lg font-bold leading-none tracking-tight',
                        isToday ? 'text-brand-800' : 'text-slate-900'
                      )}
                    >
                      {parseIso(iso).getDate()}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    {items.length > 0 && (
                      <span
                        className={cn(
                          'rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                          isToday
                            ? 'bg-brand-100 text-brand-800'
                            : 'bg-slate-100 text-slate-600'
                        )}
                      >
                        {items.length}
                      </span>
                    )}
                    {canCreate && (
                      <button
                        type="button"
                        onClick={() => openCreate(iso)}
                        className={cn(
                          'rounded-lg p-1 transition',
                          isToday
                            ? 'text-brand-600 hover:bg-brand-100 hover:text-brand-800'
                            : 'text-slate-400 hover:bg-slate-100 hover:text-brand-700'
                        )}
                        title="Agendar"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="p-1.5 pt-2">
                  {items.length === 0 ? (
                    <div className="flex h-[228px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-200 bg-gradient-to-b from-slate-50/50 to-white">
                      <CalendarDays className="h-4 w-4 text-slate-300" aria-hidden />
                      <p className="text-[11px] font-medium text-slate-400">Sin turnos</p>
                    </div>
                  ) : (
                    <div className="scrollbar-thin flex h-[228px] max-h-[228px] min-h-[228px] flex-col gap-1.5 overflow-y-auto pr-0.5">
                      {items.map((t) => (
                        <TurnoCard
                          key={t.id}
                          turno={t}
                          canEdit={canEdit}
                          busyId={estadoBusyId}
                          onOpen={() => openEdit(t)}
                          onEstado={(estado) => void cambiarEstado(t, estado)}
                          onEliminar={() => void eliminarTurno(t)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  function renderWeekNative(dias: string[]) {
    const visibles = dias
      .map((iso, weekdayIndex) => ({ iso, weekdayIndex }))
      .filter(({ weekdayIndex }) => !inhabilSet.has(weekdayIndex))

    if (visibles.length === 0) {
      return (
        <p className="rounded-xl border border-dashed border-surface-border bg-white px-4 py-10 text-center text-sm text-slate-400 shadow-card">
          Todos los días de esta semana están anulados.
        </p>
      )
    }

    return (
      <div className="space-y-2.5">
        {visibles.map(({ iso, weekdayIndex }) => {
          const items = byFecha.get(iso) ?? []
          const isToday = iso === hoyIso
          return (
            <section
              key={iso}
              className={cn(
                'overflow-hidden rounded-2xl border bg-white shadow-card',
                isToday
                  ? 'border-brand-300 ring-2 ring-brand-100'
                  : 'border-surface-border'
              )}
            >
              <div
                className={cn(
                  'flex items-center justify-between gap-2 border-b px-3 py-2.5',
                  isToday
                    ? 'border-brand-100 bg-gradient-to-r from-brand-50 via-white to-sky-50/50'
                    : 'border-surface-border bg-gradient-to-b from-slate-50/90 to-white'
                )}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={cn(
                      'inline-flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-xl text-center shadow-sm',
                      isToday
                        ? 'bg-brand-600 text-white'
                        : 'bg-white text-slate-800 ring-1 ring-slate-200'
                    )}
                  >
                    <span className="text-[9px] font-semibold uppercase leading-none opacity-80">
                      {DIAS[weekdayIndex]}
                    </span>
                    <span className="text-sm font-bold leading-none">
                      {parseIso(iso).getDate()}
                    </span>
                  </span>
                  <div className="min-w-0">
                    <p
                      className={cn(
                        'truncate text-sm font-semibold',
                        isToday ? 'text-brand-800' : 'text-slate-900'
                      )}
                    >
                      {DIAS_LARGOS[weekdayIndex]}
                    </p>
                    <p className="truncate text-[11px] text-slate-500">{formatDayLong(iso)}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {isToday && (
                    <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                      Hoy
                    </span>
                  )}
                  {items.length > 0 && (
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums',
                        isToday ? 'bg-brand-100 text-brand-800' : 'bg-slate-100 text-slate-600'
                      )}
                    >
                      {items.length}
                    </span>
                  )}
                  {canCreate && (
                    <button
                      type="button"
                      onClick={() => openCreate(iso)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm"
                      title="Agendar"
                      aria-label="Agendar turno"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-2 p-2">
                {items.length === 0 ? (
                  <div className="flex flex-col items-center gap-1 px-1 py-5">
                    <CalendarDays className="h-4 w-4 text-slate-300" aria-hidden />
                    <p className="text-xs text-slate-400">Sin turnos</p>
                  </div>
                ) : (
                  items.map((t) => (
                    <TurnoCard
                      key={t.id}
                      turno={t}
                      canEdit={canEdit}
                      busyId={estadoBusyId}
                      compact
                      onOpen={() => openEdit(t)}
                      onEstado={(estado) => void cambiarEstado(t, estado)}
                      onEliminar={() => void eliminarTurno(t)}
                    />
                  ))
                )}
              </div>
            </section>
          )
        })}
      </div>
    )
  }

  return (
    <div className={cn('mx-auto max-w-7xl', nativeApp ? '-mt-1 space-y-3' : 'space-y-3')}>
      {nativeApp ? (
        <div className="flex items-center gap-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-sky-500 text-white shadow-md shadow-brand-600/25">
              <CalendarDays className="h-4 w-4" strokeWidth={2.5} />
            </span>
            <h1 className="min-w-0 truncate text-xl font-bold tracking-tight text-slate-900">
              Agenda
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {canEdit && (
              <Button
                type="button"
                variant="secondary"
                className="h-9 rounded-xl border-slate-200 bg-white px-2.5 shadow-sm"
                onClick={openConfig}
                aria-label="Días anulados"
              >
                <Settings className="h-4 w-4" />
              </Button>
            )}
            {canCreate && (
              <Button
                className="h-9 rounded-xl px-3 shadow-sm shadow-brand-600/20"
                onClick={() => openCreate()}
              >
                <Plus className="h-4 w-4" />
                Nuevo
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-gradient-to-r from-white via-white to-brand-50/40 px-3.5 py-3 shadow-sm ring-1 ring-slate-100">
          <div className="flex min-w-0 flex-wrap items-center gap-3 sm:gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-sky-500 text-white shadow-md shadow-brand-600/25">
                <CalendarDays className="h-5 w-5" strokeWidth={2.5} />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Planificación
                </p>
                <h1 className="truncate text-xl font-bold tracking-tight text-slate-900">
                  Agenda de turnos
                </h1>
              </div>
            </div>
            <div className="flex rounded-xl bg-slate-100/90 p-1 text-xs font-semibold ring-1 ring-slate-200/80">
              <button
                type="button"
                onClick={() => setTab('semana')}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-all',
                  tab === 'semana'
                    ? 'bg-white text-brand-800 shadow-sm ring-1 ring-slate-200/80'
                    : 'text-slate-500 hover:text-slate-800'
                )}
              >
                <CalendarDays className="h-3.5 w-3.5" />
                Semana
              </button>
              <button
                type="button"
                onClick={() => setTab('historial')}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-all',
                  tab === 'historial'
                    ? 'bg-white text-brand-800 shadow-sm ring-1 ring-slate-200/80'
                    : 'text-slate-500 hover:text-slate-800'
                )}
              >
                <History className="h-3.5 w-3.5" />
                Historial
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {tab === 'semana' && (
              <div className="flex items-center gap-0.5 rounded-xl border border-slate-200 bg-white p-0.5 shadow-sm">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-8 rounded-lg border-0 bg-transparent px-2 shadow-none hover:bg-slate-100"
                  onClick={() => setAnchorMonday((d) => addDays(d, -7))}
                  title="Semana anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className={cn(
                    'h-8 rounded-lg border-0 px-2.5 text-xs font-semibold shadow-none',
                    isCurrentWeek
                      ? 'bg-brand-50 text-brand-800 hover:bg-brand-100'
                      : 'bg-transparent text-slate-700 hover:bg-slate-100'
                  )}
                  onClick={() => setAnchorMonday(startOfWeekMonday(new Date()))}
                >
                  Hoy
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-8 rounded-lg border-0 bg-transparent px-2 shadow-none hover:bg-slate-100"
                  onClick={() => setAnchorMonday((d) => addDays(d, 7))}
                  title="Semana siguiente"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
            {canEdit && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-8 rounded-xl border-slate-200 bg-white text-xs shadow-sm"
                onClick={openConfig}
              >
                <Settings className="h-3.5 w-3.5" />
                Días
              </Button>
            )}
            {canCreate && (
              <Button
                size="sm"
                className="h-8 rounded-xl text-xs shadow-sm shadow-brand-600/20"
                onClick={() => openCreate()}
              >
                <Plus className="h-3.5 w-3.5" />
                Nuevo turno
              </Button>
            )}
          </div>
        </div>
      )}

      {nativeApp && (
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100/90 p-1 ring-1 ring-slate-200/70">
          <button
            type="button"
            onClick={() => setTab('semana')}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition',
              tab === 'semana'
                ? 'bg-white text-brand-800 shadow-sm ring-1 ring-slate-200/80'
                : 'text-slate-500'
            )}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Semana
          </button>
          <button
            type="button"
            onClick={() => setTab('historial')}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition',
              tab === 'historial'
                ? 'bg-white text-brand-800 shadow-sm ring-1 ring-slate-200/80'
                : 'text-slate-500'
            )}
          >
            <History className="h-3.5 w-3.5" />
            Historial
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700 ring-1 ring-red-100">
          {error}
        </div>
      )}

      {tab === 'semana' && (
        nativeApp ? (
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 rounded-xl border border-surface-border bg-white px-2 py-2 shadow-card">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-9 w-9 shrink-0 rounded-xl px-0"
                onClick={() => setAnchorMonday((d) => addDays(d, -7))}
                aria-label="Semana anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <button
                type="button"
                onClick={() => setAnchorMonday(startOfWeekMonday(new Date()))}
                className="min-w-0 flex-1 rounded-lg px-2 py-1 text-center active:bg-slate-50"
              >
                <p className="text-sm font-semibold text-slate-900">{formatWeekRange(week1)}</p>
                {isCurrentWeek ? (
                  <p className="text-[10px] font-medium text-brand-600">Esta semana</p>
                ) : (
                  <p className="text-[10px] text-slate-400">Ir a hoy</p>
                )}
              </button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-9 w-9 shrink-0 rounded-xl px-0"
                onClick={() => setAnchorMonday((d) => addDays(d, 7))}
                aria-label="Semana siguiente"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 rounded-xl border border-surface-border bg-white px-4 py-10 text-sm text-slate-500 shadow-card">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando agenda…
              </div>
            ) : (
              renderWeekNative(week1)
            )}
          </div>
        ) : (
          <Card className="overflow-hidden border-slate-200/90 bg-gradient-to-b from-slate-50 via-white to-slate-50/80 shadow-sm ring-1 ring-slate-200/60">
            <CardBody className="space-y-5 p-4 sm:p-5">
              {loading ? (
                <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
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
        )
      )}

      {tab === 'historial' && (
        nativeApp ? (
          <div className="space-y-3">
            <div className="space-y-2 rounded-xl border border-surface-border bg-white px-3 py-2.5 shadow-card">
              <Input
                value={historialQ}
                onChange={(e) => setHistorialQ(e.target.value)}
                placeholder="Buscar descripción o transportista…"
                className="py-2"
              />
              <div className="flex gap-2">
                <select
                  value={historialEstado}
                  onChange={(e) => setHistorialEstado(e.target.value as '' | AgendaTurnoEstado)}
                  className="min-w-0 flex-1 rounded-xl border border-surface-border bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                >
                  <option value="">Todos los estados</option>
                  <option value="SOLICITADO">Solicitado</option>
                  <option value="CONFIRMADO">Confirmado</option>
                  <option value="CANCELADO">Cancelado</option>
                </select>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-10 shrink-0 rounded-xl px-3"
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
                  aria-label="Filtrar por fecha"
                >
                  <CalendarDays className="h-4 w-4" />
                </Button>
              </div>
              {historialFecha && (
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-800 ring-1 ring-brand-200">
                    {formatDayLong(historialFecha)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setHistorialFecha('')}
                    className="shrink-0 text-xs font-medium text-slate-500"
                  >
                    Quitar
                  </button>
                </div>
              )}
            </div>

            {loading ? (
              <div className="flex items-center gap-2 rounded-xl border border-surface-border bg-white px-4 py-10 text-sm text-slate-500 shadow-card">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando…
              </div>
            ) : historialFiltrado.length === 0 ? (
              <p className="rounded-xl border border-dashed border-surface-border bg-white px-4 py-10 text-center text-sm text-slate-400 shadow-card">
                Sin registros en el historial.
              </p>
            ) : (
              <>
                <ul className="space-y-2">
                  {historialPageItems.map((t) => (
                    <li key={t.id}>
                      <div className="overflow-hidden rounded-xl border border-surface-border bg-white shadow-card">
                        <button
                          type="button"
                          onClick={() => openEdit(t)}
                          className="flex w-full items-start gap-3 px-3 py-3 text-left active:bg-slate-50"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start gap-2">
                              <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-700">
                                {t.fecha.slice(8, 10)}/{t.fecha.slice(5, 7)}
                              </span>
                              <ScrollableProductName className="min-w-0 flex-1 text-sm font-semibold text-slate-900">
                                {t.descripcion}
                              </ScrollableProductName>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                              {t.cantidad != null && (
                                <span className="font-medium tabular-nums text-slate-700">
                                  {t.cantidad} {unidadLabel(t.unidad)}
                                </span>
                              )}
                              {t.transportista_nombre && (
                                <span className="inline-flex items-center gap-1">
                                  <Truck className="h-3 w-3 shrink-0" />
                                  {t.transportista_nombre}
                                </span>
                              )}
                            </div>
                            {t.notas?.trim() && (
                              <div className="scrollbar-none-x mt-1 overflow-x-auto whitespace-nowrap text-[11px] italic text-slate-500">
                                {t.notas}
                              </div>
                            )}
                          </div>
                          {t.estado === 'CONFIRMADO' ? (
                            <span
                              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xs"
                              title="Confirmado"
                            >
                              <Check className="h-3.5 w-3.5 stroke-[3]" />
                            </span>
                          ) : (
                            <span
                              className={cn(
                                'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1',
                                ESTADO_STYLE[t.estado]
                              )}
                            >
                              {ESTADO_LABEL[t.estado]}
                            </span>
                          )}
                        </button>
                        {canEdit && t.estado === 'CANCELADO' && (
                          <div className="border-t border-surface-border px-3 py-1.5">
                            <button
                              type="button"
                              disabled={estadoBusyId === t.id}
                              onClick={() => void eliminarTurno(t)}
                              className="inline-flex h-7 w-full items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                            >
                              {estadoBusyId === t.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <X className="h-3 w-3 stroke-[2.5]" />
                              )}
                              Eliminar de la lista
                            </button>
                          </div>
                        )}
                      </div>
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
              </>
            )}
          </div>
        ) : (
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
                      <li key={t.id} className="flex items-center">
                        <button
                          type="button"
                          onClick={() => openEdit(t)}
                          className="flex min-h-[58px] flex-1 flex-wrap items-center gap-3 px-4 py-3 text-left text-sm hover:bg-surface-muted/50"
                        >
                          <span className="w-28 shrink-0 font-medium text-slate-700">{t.fecha}</span>
                          <span className="min-w-0 flex-1">
                            <span className="font-medium text-slate-900">
                              {lineaEnvioTexto(t)}
                            </span>
                            <span className="mt-0.5 block text-xs text-slate-500">
                              {t.transportista_nombre ? (
                                <span className="inline-flex items-center gap-1">
                                  <Truck className="h-3 w-3 shrink-0 text-slate-400" />
                                  {t.transportista_nombre}
                                </span>
                              ) : (
                                <span className="italic text-slate-400">Sin transportista</span>
                              )}
                              {t.notas ? ` · ${t.notas}` : ''}
                            </span>
                          </span>
                          {t.estado === 'CONFIRMADO' ? (
                            <span
                              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xs"
                              title="Confirmado"
                            >
                              <Check className="h-4 w-4 stroke-[3]" />
                            </span>
                          ) : (
                            <span
                              className={cn(
                                'rounded-full px-2.5 py-0.5 text-xs font-medium ring-1',
                                ESTADO_STYLE[t.estado]
                              )}
                            >
                              {ESTADO_LABEL[t.estado]}
                            </span>
                          )}
                        </button>
                        {canEdit && t.estado === 'CANCELADO' && (
                          <div className="pr-3">
                            <button
                              type="button"
                              disabled={estadoBusyId === t.id}
                              onClick={() => void eliminarTurno(t)}
                              title="Eliminar de la lista"
                              aria-label="Eliminar turno cancelado"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
                            >
                              {estadoBusyId === t.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <X className="h-4 w-4 stroke-[2.5]" />
                              )}
                            </button>
                          </div>
                        )}
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
        )
      )}

      {modalOpen && (
        <>
          {nativeApp && (
            <div
              className="fixed inset-0 z-40 bg-slate-900/45"
              aria-hidden
              onClick={() => setModalOpen(false)}
            />
          )}
          <div
            className={cn(
              nativeApp
                ? 'fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-3xl max-h-[92dvh] overflow-hidden overscroll-contain rounded-t-2xl border-2 border-b-0 border-brand-400 bg-white shadow-[0_-12px_40px_rgba(15,23,42,0.25)] ring-4 ring-brand-500/15'
                : 'fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center'
            )}
          >
            {!nativeApp && (
              <div
                className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
                aria-hidden
                onClick={() => setModalOpen(false)}
              />
            )}
            <div
              role="dialog"
              aria-modal="true"
              className={cn(
                'relative z-10 flex w-full flex-col overflow-hidden bg-white',
                nativeApp
                  ? 'max-h-[92dvh]'
                  : 'max-h-[min(90vh,720px)] max-w-lg rounded-2xl border border-surface-border shadow-xl'
              )}
            >
              {(() => {
                const modalTone =
                  editing?.estado === 'CONFIRMADO'
                    ? {
                        bar: 'from-emerald-600 via-emerald-500 to-teal-500',
                        head: 'from-emerald-50 via-white to-white',
                        iconWrap: 'bg-emerald-600 text-white shadow-emerald-600/30',
                        Icon: Check
                      }
                    : editing
                      ? {
                          bar: 'from-brand-600 via-brand-500 to-sky-500',
                          head: 'from-brand-50/80 via-white to-white',
                          iconWrap: 'bg-brand-600 text-white shadow-brand-600/30',
                          Icon: Package
                        }
                      : {
                          bar: 'from-amber-500 via-amber-400 to-orange-400',
                          head: 'from-amber-50 via-white to-white',
                          iconWrap: 'bg-amber-500 text-white shadow-amber-500/30',
                          Icon: Plus
                        }
                const ModalIcon = modalTone.Icon
                return (
                  <>
                    <div className={cn('h-1.5 shrink-0 bg-gradient-to-r', modalTone.bar)} />
                    <div
                      className={cn(
                        'flex shrink-0 items-start justify-between gap-3 border-b border-surface-border bg-gradient-to-r px-4 py-4 sm:px-5',
                        modalTone.head
                      )}
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <span
                          className={cn(
                            'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-md',
                            modalTone.iconWrap
                          )}
                        >
                          <ModalIcon className="h-5 w-5" strokeWidth={2.5} />
                        </span>
                        <div className="min-w-0">
                          <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                            {editing?.estado === 'CONFIRMADO'
                              ? 'Turno confirmado'
                              : editing
                                ? 'Editar turno'
                                : 'Nuevo turno'}
                          </h2>
                          {editing?.estado === 'CONFIRMADO' ? (
                            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-emerald-700">
                              <Eye className="h-3.5 w-3.5 shrink-0" />
                              Solo lectura — no se puede modificar
                            </p>
                          ) : !editing ? (
                            <p className="mt-0.5 text-xs text-slate-500">
                              Se crea como <strong>Solicitado</strong>. Después confirmás o cancelás en la
                              tarjeta.
                            </p>
                          ) : editing.estado === 'SOLICITADO' ? (
                            <p className="mt-0.5 text-xs text-amber-700">Estado: Solicitado</p>
                          ) : (
                            <p className="mt-0.5 text-xs text-slate-500">
                              Estado: {ESTADO_LABEL[editing.estado]}
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setModalOpen(false)}
                        className="rounded-xl p-1.5 text-slate-400 transition hover:bg-white/80 hover:text-slate-700"
                        aria-label="Cerrar"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>

                    <form
                      className="flex min-h-0 flex-1 flex-col"
                      onSubmit={(e) => void saveTurno(e)}
                    >
                      <div
                        className={cn(
                          'min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5',
                          nativeApp && 'pb-2'
                        )}
                      >
                        {formError && (
                          <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">
                            {formError}
                          </div>
                        )}

                        <div className="space-y-3 rounded-2xl border border-surface-border bg-slate-50/70 p-3.5 sm:p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                            Envío
                          </p>
                          <Input
                            label="Fecha"
                            type="date"
                            required
                            value={form.fecha}
                            onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
                            disabled={formReadOnly}
                            leading={<CalendarDays className="h-4 w-4" aria-hidden />}
                          />
                          <Input
                            label="Qué se envía"
                            required
                            placeholder="Ej. Etiquetas"
                            value={form.descripcion}
                            onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                            disabled={formReadOnly}
                            leading={<Package className="h-4 w-4" aria-hidden />}
                          />
                          <div className="grid grid-cols-2 gap-3">
                            <Input
                              label="Cantidad (opcional)"
                              type="number"
                              min="0.01"
                              step="any"
                              value={form.cantidad}
                              onChange={(e) => setForm((f) => ({ ...f, cantidad: e.target.value }))}
                              disabled={formReadOnly}
                            />
                            <label className="block text-sm">
                              <span className="mb-1.5 block font-medium text-slate-700">Unidad</span>
                              <select
                                value={form.unidad}
                                onChange={(e) =>
                                  setForm((f) => ({
                                    ...f,
                                    unidad: e.target.value as AgendaTurnoUnidad
                                  }))
                                }
                                disabled={formReadOnly}
                                className="w-full rounded-xl border border-surface-border bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50 disabled:text-slate-600"
                              >
                                {UNIDADES.map((u) => (
                                  <option key={u.value} value={u.value}>
                                    {u.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                        </div>

                        <div className="space-y-3 rounded-2xl border border-surface-border bg-white p-3.5 shadow-sm sm:p-4">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                              Logística
                            </p>
                            {canCreate && !formReadOnly && (
                              <button
                                type="button"
                                onClick={() => setTrModal(true)}
                                className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-100 hover:bg-brand-100"
                              >
                                <Truck className="h-3.5 w-3.5" />
                                Nuevo
                              </button>
                            )}
                          </div>
                          <label className="block text-sm">
                            <span className="mb-1.5 block font-medium text-slate-700">
                              Transportista (opcional)
                            </span>
                            <select
                              value={form.transportista_id ?? ''}
                              onChange={(e) =>
                                setForm((f) => ({
                                  ...f,
                                  transportista_id: e.target.value ? Number(e.target.value) : ''
                                }))
                              }
                              disabled={formReadOnly}
                              className="w-full rounded-xl border border-surface-border bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50 disabled:text-slate-600"
                            >
                              <option value="">Sin transportista</option>
                              {activos.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.nombre}
                                </option>
                              ))}
                              {editing &&
                                editing.transportista_id != null &&
                                !activos.some((t) => t.id === editing.transportista_id) && (
                                  <option value={editing.transportista_id}>
                                    {editing.transportista_nombre ??
                                      `ID ${editing.transportista_id}`}{' '}
                                    (inactivo)
                                  </option>
                                )}
                            </select>
                          </label>
                          <label className="block text-sm">
                            <span className="mb-1.5 inline-flex items-center gap-1.5 font-medium text-slate-700">
                              <StickyNote className="h-3.5 w-3.5 text-slate-400" />
                              Notas
                            </span>
                            <textarea
                              rows={3}
                              value={form.notas}
                              onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
                              disabled={formReadOnly}
                              className="w-full rounded-xl border border-surface-border bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50 disabled:text-slate-600"
                              placeholder="Opcional"
                            />
                          </label>
                        </div>
                      </div>

                      <div
                        className={cn(
                          'shrink-0 border-t border-surface-border bg-slate-50/90 px-4 py-3 sm:px-5',
                          nativeApp && 'pb-[max(0.75rem,env(safe-area-inset-bottom))]'
                        )}
                      >
                        {nativeApp ? (
                          <div className="grid grid-cols-2 gap-2">
                            <Button
                              type="button"
                              variant="secondary"
                              className="h-11 rounded-xl"
                              onClick={() => setModalOpen(false)}
                            >
                              {formReadOnly ? 'Cerrar' : 'Cancelar'}
                            </Button>
                            {canSaveTurno ? (
                              <Button type="submit" className="h-11 rounded-xl" disabled={saving}>
                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                Guardar
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                className="h-11 rounded-xl"
                                onClick={() => setModalOpen(false)}
                              >
                                Listo
                              </Button>
                            )}
                          </div>
                        ) : (
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="secondary"
                              className="rounded-xl"
                              onClick={() => setModalOpen(false)}
                            >
                              Cerrar
                            </Button>
                            {canSaveTurno ? (
                              <Button type="submit" className="rounded-xl" disabled={saving}>
                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                Guardar
                              </Button>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </form>
                  </>
                )
              })()}
            </div>
          </div>
        </>
      )}

      {calModal && (
        <>
          {nativeApp && (
            <div
              className="fixed inset-0 z-40 bg-slate-900/45"
              aria-hidden
              onClick={() => setCalModal(false)}
            />
          )}
          <div
            className={cn(
              nativeApp
                ? 'fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-sm max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-2xl border-2 border-b-0 border-brand-400 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgba(15,23,42,0.25)] ring-4 ring-brand-500/15'
                : 'fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4'
            )}
          >
            <div
              role="dialog"
              aria-modal="true"
              className={cn(
                nativeApp ? 'w-full' : 'w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl ring-1 ring-surface-border sm:p-5'
              )}
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

              {!nativeApp && (
                <p className="mt-3 text-center text-[11px] text-slate-400">
                  Punto = día con turnos. Tocá un día para filtrar el historial.
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {cfgModal && (
        <>
          {nativeApp && (
            <div
              className="fixed inset-0 z-40 bg-slate-900/45"
              aria-hidden
              onClick={() => setCfgModal(false)}
            />
          )}
          <div
            className={cn(
              nativeApp
                ? 'fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md max-h-[88dvh] overflow-y-auto overscroll-contain rounded-t-2xl border-2 border-b-0 border-brand-400 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgba(15,23,42,0.25)] ring-4 ring-brand-500/15'
                : 'fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4'
            )}
          >
            <form
              onSubmit={(e) => void saveConfig(e)}
              className={cn(
                nativeApp
                  ? 'w-full space-y-4'
                  : 'w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-xl ring-1 ring-surface-border'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Días anulados</h3>
                  {!nativeApp && (
                    <p className="mt-1 text-xs text-slate-500">
                      Marcá los días en los que no se agenda (ej. sábado y domingo).
                    </p>
                  )}
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

              {nativeApp ? (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-11 rounded-xl"
                    onClick={() => setCfgModal(false)}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" className="h-11 rounded-xl" disabled={cfgSaving}>
                    {cfgSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Guardar
                  </Button>
                </div>
              ) : (
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
              )}
            </form>
          </div>
        </>
      )}

      {diaPanelIso && (
        <>
          {nativeApp && (
            <div
              className="fixed inset-0 z-40 bg-slate-900/45"
              aria-hidden
              onClick={() => setDiaPanelIso(null)}
            />
          )}
          <div
            className={cn(
              nativeApp
                ? 'fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-2xl border-2 border-b-0 border-brand-400 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgba(15,23,42,0.25)] ring-4 ring-brand-500/15'
                : 'fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center'
            )}
          >
            <div
              role="dialog"
              aria-modal="true"
              className={cn(
                nativeApp
                  ? 'w-full'
                  : 'max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl ring-1 ring-surface-border'
              )}
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
              <div className="space-y-2">
                {(byFecha.get(diaPanelIso) ?? []).map((t) => (
                  <TurnoCard
                    key={t.id}
                    turno={t}
                    canEdit={canEdit}
                    busyId={estadoBusyId}
                    compact={nativeApp}
                    onOpen={() => {
                      setDiaPanelIso(null)
                      openEdit(t)
                    }}
                    onEstado={(estado) => void cambiarEstado(t, estado)}
                    onEliminar={() => void eliminarTurno(t)}
                  />
                ))}
              </div>
              {canCreate && (
                <Button
                  type="button"
                  className={cn('mt-4 w-full rounded-xl', nativeApp && 'h-11')}
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
        </>
      )}

      {trModal && (
        <>
          {nativeApp && (
            <div
              className="fixed inset-0 z-[59] bg-slate-900/45"
              aria-hidden
              onClick={() => setTrModal(false)}
            />
          )}
          <div
            className={cn(
              nativeApp
                ? 'fixed inset-x-0 bottom-0 z-[60] mx-auto w-full max-w-sm overflow-y-auto overscroll-contain rounded-t-2xl border-2 border-b-0 border-brand-400 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgba(15,23,42,0.25)] ring-4 ring-brand-500/15'
                : 'fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4'
            )}
          >
            <form
              onSubmit={(e) => void saveTransportista(e)}
              className={cn(
                nativeApp ? 'w-full space-y-4' : 'w-full max-w-sm space-y-4 rounded-2xl bg-white p-5 shadow-xl'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-slate-900">Nuevo transportista</h3>
                {nativeApp && (
                  <button
                    type="button"
                    onClick={() => setTrModal(false)}
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                  >
                    <X className="h-5 w-5" />
                  </button>
                )}
              </div>
              <Input
                label="Nombre"
                required
                autoFocus
                value={trNombre}
                onChange={(e) => setTrNombre(e.target.value)}
                placeholder="Ej. Russo, Transportes Catalina"
              />
              {nativeApp ? (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-11 rounded-xl"
                    onClick={() => setTrModal(false)}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" className="h-11 rounded-xl" disabled={trSaving}>
                    {trSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Crear
                  </Button>
                </div>
              ) : (
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
              )}
            </form>
          </div>
        </>
      )}
    </div>
  )
}
