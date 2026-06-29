import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownCircle,
  ArrowUpCircle,
  ClipboardList,
  HeartCrack,
  Loader2,
  Package,
  Scale,
  Search,
  X
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { formatCantidad, formatPeriodoFechas, todayIsoDate } from '@/lib/desglose'
import { api, cn } from '@/lib/utils'
import type { MovimientosDiaReport, ReporteDetalle, ReporteDetalleTipo } from '@/types'
import { useAuth } from '@/context/AuthContext'
import { useEscHandler } from '@/hooks/useEscHandler'

function formatSignedCantidad(value: number, sign: '+' | '-'): string {
  if (value === 0) return '0'
  return `${sign}${formatCantidad(value)}`
}

function matchesBusqueda(textos: string[], query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return textos.some((t) => t.toLowerCase().includes(q))
}

function ModalSearchBar({
  value,
  onChange,
  inputRef,
  placeholder = 'Buscar producto...'
}: {
  value: string
  onChange: (value: string) => void
  inputRef?: React.RefObject<HTMLInputElement | null>
  placeholder?: string
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-surface-border bg-white py-2.5 pl-10 pr-3 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
      />
    </div>
  )
}

function StatCard({
  title,
  value,
  icon: Icon,
  accentClass,
  iconClass,
  valueClass,
  actions,
  onClick
}: {
  title: string
  value: string
  icon: typeof Package
  accentClass: string
  iconClass: string
  valueClass?: string
  actions?: React.ReactNode
  onClick?: () => void
}) {
  return (
    <Card
      className={cn(
        'overflow-hidden shadow-panel transition-all',
        accentClass,
        onClick && 'cursor-pointer hover:shadow-lg hover:-translate-y-0.5'
      )}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
    >
      <CardBody className="flex h-full flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm',
              iconClass
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            {actions}
          </div>
        </div>
        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
        <p className={cn('mt-1 text-3xl font-bold tabular-nums tracking-tight', valueClass ?? 'text-slate-900')}>
          {value}
        </p>
        {onClick && (
          <button
            type="button"
            className="mt-3 text-left text-xs font-medium text-brand-600 hover:text-brand-700"
            onClick={(e) => {
              e.stopPropagation()
              onClick()
            }}
          >
            Ver detalle →
          </button>
        )}
      </CardBody>
    </Card>
  )
}

function DetalleModal({
  detalle,
  loading,
  error,
  onClose
}: {
  detalle: ReporteDetalle | null
  loading: boolean
  error: string
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  const periodo = detalle
    ? formatPeriodoFechas(detalle.fecha_desde, detalle.fecha_hasta)
    : ''

  const itemsFiltrados = useMemo(() => {
    if (!detalle) return []
    return detalle.items.filter((item) =>
      matchesBusqueda([item.nombre, item.codigo_interno], search)
    )
  }, [detalle, search])

  useEffect(() => {
    setSearch('')
  }, [detalle?.tipo, detalle?.fecha_desde, detalle?.fecha_hasta])

  useEffect(() => {
    if (!loading && detalle && detalle.items.length > 0) {
      const timer = setTimeout(() => searchRef.current?.focus(), 80)
      return () => clearTimeout(timer)
    }
  }, [loading, detalle])

  useEscHandler(true, () => {
    onClose()
    return true
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-surface-border bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-surface-border bg-gradient-to-r from-brand-50/80 via-white to-white px-5 py-4">
          <div>
            <h3 className="font-semibold text-slate-900">
              {detalle?.titulo ?? 'Detalle'}
              {periodo ? ` — ${periodo}` : ''}
            </h3>
            {detalle && (
              <p className="mt-0.5 text-sm text-slate-500">
                Total:{' '}
                <span className="font-semibold tabular-nums text-brand-700">
                  {formatCantidad(detalle.total)}
                </span>
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col p-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
              Cargando detalle...
            </div>
          ) : error ? (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-100">
              {error}
            </div>
          ) : !detalle || detalle.items.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <Package className="h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">Sin movimientos en este período</p>
            </div>
          ) : (
            <>
              <ModalSearchBar value={search} onChange={setSearch} inputRef={searchRef} />
              {search.trim() && (
                <p className="mt-3 text-xs text-slate-500">
                  {itemsFiltrados.length} de {detalle.items.length} producto(s)
                </p>
              )}
              {itemsFiltrados.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">Ningún producto coincide con la búsqueda</p>
              ) : (
                <ul className="mt-4 min-h-0 flex-1 space-y-2 overflow-auto">
                  {itemsFiltrados.map((item) => (
                    <li
                      key={`${item.codigo_interno}-${item.nombre}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-surface-border bg-white px-4 py-3 shadow-sm"
                    >
                      <div className="min-w-0">
                        <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">
                          {item.codigo_interno}
                        </span>
                        <p className="mt-1 truncate text-sm font-medium text-slate-800">{item.nombre}</p>
                      </div>
                      <span className="inline-flex shrink-0 rounded-lg bg-brand-50 px-2.5 py-1.5 text-sm font-bold tabular-nums text-brand-700 ring-1 ring-brand-100">
                        {formatCantidad(item.cantidad_cajas)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export function ReportesPage() {
  const { hasPermiso } = useAuth()
  const canExport = hasPermiso('reportes.exportar')

  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [report, setReport] = useState<MovimientosDiaReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detalle, setDetalle] = useState<ReporteDetalle | null>(null)
  const [loadingDetalle, setLoadingDetalle] = useState(false)
  const [detalleError, setDetalleError] = useState('')
  const [showDetalle, setShowDetalle] = useState(false)

  const loadReport = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (fechaDesde) params.set('fecha_desde', fechaDesde)
      if (fechaHasta) params.set('fecha_hasta', fechaHasta)
      const data = await api<MovimientosDiaReport>(`/api/reportes/movimientos-dia?${params}`)
      setReport(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar reporte')
      setReport(null)
    } finally {
      setLoading(false)
    }
  }, [fechaDesde, fechaHasta])

  useEffect(() => {
    const timer = setTimeout(() => void loadReport(), 200)
    return () => clearTimeout(timer)
  }, [loadReport])

  async function abrirDetalle(tipo: ReporteDetalleTipo) {
    setShowDetalle(true)
    setLoadingDetalle(true)
    setDetalle(null)
    setDetalleError('')
    try {
      const params = new URLSearchParams({ tipo })
      if (fechaDesde) params.set('fecha_desde', fechaDesde)
      if (fechaHasta) params.set('fecha_hasta', fechaHasta)
      const data = await api<ReporteDetalle>(`/api/reportes/movimientos-dia/detalle?${params}`)
      setDetalle(data)
    } catch (err) {
      setDetalleError(err instanceof Error ? err.message : 'Error al cargar detalle')
    } finally {
      setLoadingDetalle(false)
    }
  }

  function handleExport(label: string) {
    if (!canExport) return
    window.alert(`Exportación de ${label} — próximamente`)
  }

  const exportBtn = (label: string) => (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className="h-8 rounded-lg text-xs"
      disabled={!canExport}
      title={canExport ? `Exportar ${label}` : 'Requiere permiso de exportación'}
      onClick={() => handleExport(label)}
    >
      Exportar
    </Button>
  )

  const periodoLabel = report
    ? formatPeriodoFechas(report.fecha_desde, report.fecha_hasta)
    : formatPeriodoFechas(fechaDesde || todayIsoDate(), fechaHasta || todayIsoDate())

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Reportes</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Movimientos del día
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-500">
          Estadísticas de stock por período: ingresos, salidas, retornos y balance.
        </p>
      </section>

      <Card className="overflow-hidden shadow-panel">
        <div className="border-b border-brand-100 bg-gradient-to-r from-brand-50/80 via-white to-white px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex shrink-0 items-center gap-1.5 rounded-xl border border-surface-border bg-white px-2 py-1.5 shadow-sm">
              <span className="pl-1 text-xs font-medium text-slate-500">Desde</span>
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                title="Fecha desde — solo este campo = ese día"
                className="rounded border-0 bg-transparent px-1 py-1 text-sm focus:outline-none focus:ring-0"
              />
              <span className="text-slate-300">|</span>
              <span className="text-xs font-medium text-slate-500">Hasta</span>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                title="Fecha hasta — solo este campo = ese día"
                className="rounded border-0 bg-transparent px-1 py-1 text-sm focus:outline-none focus:ring-0"
              />
            </div>
            {(fechaDesde || fechaHasta) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0 rounded-lg"
                onClick={() => {
                  setFechaDesde('')
                  setFechaHasta('')
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Una sola fecha filtra ese día · las dos juntas = rango
          </p>
        </div>

        <CardBody className="flex flex-wrap items-center justify-between gap-3 bg-slate-50/80 py-3.5 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Período</p>
            <p className="text-sm font-semibold text-slate-900">{periodoLabel}</p>
          </div>
          {loading && <Loader2 className="h-5 w-5 shrink-0 animate-spin text-brand-600" />}
          {report && !loading && (
            <p className="max-w-md text-xs leading-relaxed text-slate-500">
              Balance = stock inicial + ingresos + retornos − planillas − roturas
            </p>
          )}
        </CardBody>
      </Card>

      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-100">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
          Calculando movimientos...
        </div>
      ) : report ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            title="Stock inicial"
            value={formatCantidad(report.stock_inicial)}
            icon={Package}
            accentClass="border border-blue-100 bg-gradient-to-br from-blue-50/80 to-white"
            iconClass="bg-blue-600 text-white"
            actions={exportBtn('stock inicial')}
            onClick={() => void abrirDetalle('stock_inicial')}
          />
          <StatCard
            title="Ingresos"
            value={formatSignedCantidad(report.ingresos, '+')}
            icon={ArrowDownCircle}
            accentClass="border border-emerald-100 bg-gradient-to-br from-emerald-50/80 to-white"
            iconClass="bg-emerald-600 text-white"
            valueClass="text-emerald-700"
            actions={exportBtn('ingresos')}
            onClick={() => void abrirDetalle('ingresos')}
          />
          <StatCard
            title="Retornos y devoluciones"
            value={formatSignedCantidad(report.retornos, '+')}
            icon={ArrowUpCircle}
            accentClass="border border-amber-100 bg-gradient-to-br from-amber-50/80 to-white"
            iconClass="bg-amber-600 text-white"
            valueClass="text-amber-700"
            actions={exportBtn('retornos')}
            onClick={() => void abrirDetalle('retornos')}
          />
          <StatCard
            title="Carga de planillas"
            value={formatSignedCantidad(report.planillas, '-')}
            icon={ClipboardList}
            accentClass="border border-red-100 bg-gradient-to-br from-red-50/80 to-white"
            iconClass="bg-red-600 text-white"
            valueClass="text-red-700"
            actions={exportBtn('planillas')}
            onClick={() => void abrirDetalle('planillas')}
          />
          <StatCard
            title="Roturas y pérdidas"
            value={formatSignedCantidad(report.roturas, '-')}
            icon={HeartCrack}
            accentClass="border border-violet-100 bg-gradient-to-br from-violet-50/80 to-white"
            iconClass="bg-violet-600 text-white"
            valueClass="text-violet-700"
            actions={exportBtn('roturas y pérdidas')}
            onClick={() => void abrirDetalle('roturas')}
          />
          <StatCard
            title="Balance final"
            value={formatCantidad(report.balance_final)}
            icon={Scale}
            accentClass="border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-brand-50/30 ring-1 ring-indigo-100"
            iconClass="bg-indigo-600 text-white"
            valueClass="text-indigo-700"
            onClick={() => void abrirDetalle('balance_final')}
          />
        </div>
      ) : null}

      {showDetalle && (
        <DetalleModal
          detalle={detalle}
          loading={loadingDetalle}
          error={detalleError}
          onClose={() => {
            setShowDetalle(false)
            setDetalle(null)
            setDetalleError('')
          }}
        />
      )}
    </div>
  )
}
