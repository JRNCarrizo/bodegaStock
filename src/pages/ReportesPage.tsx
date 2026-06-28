import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {

  ArrowDownCircle,

  ArrowUpCircle,

  ClipboardList,

  HeartCrack,

  Package,

  Scale,

  Search,

  X

} from 'lucide-react'

import { Button } from '@/components/ui/Button'

import { Card, CardBody } from '@/components/ui/Card'

import { formatPeriodoFechas, todayIsoDate } from '@/lib/desglose'

import { api } from '@/lib/utils'

import type {

  MovimientosDiaReport,

  ReporteDetalle,

  ReporteDetalleTipo

} from '@/types'

import { useAuth } from '@/context/AuthContext'
import { useEscHandler } from '@/hooks/useEscHandler'



function formatCantidad(value: number): string {
  const n = Math.round(value * 1000) / 1000
  return Number.isInteger(n) ? String(n) : String(n)
}

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
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-surface-border py-2 pl-10 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
      />
    </div>
  )
}

function StatCard({

  title,

  value,

  icon: Icon,

  borderClass,

  iconClass,

  actions,

  onClick

}: {

  title: string

  value: string

  icon: typeof Package

  borderClass: string

  iconClass: string

  actions?: React.ReactNode

  onClick?: () => void

}) {

  return (

    <Card

      className={`overflow-hidden border-2 transition-shadow ${borderClass} ${

        onClick ? 'cursor-pointer hover:shadow-md' : ''

      }`}

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

            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconClass}`}

          >

            <Icon className="h-5 w-5" />

          </div>

          <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>

            {actions}

          </div>

        </div>

        <p className="mt-4 text-sm font-medium text-slate-600">{title}</p>

        <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{value}</p>

        {onClick && (
          <button
            type="button"
            className="mt-3 text-left text-xs font-medium text-brand-600 hover:text-brand-700"
            onClick={(e) => {
              e.stopPropagation()
              onClick()
            }}
          >
            Ver detalle
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
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b bg-white px-5 py-4">
          <div>
            <h3 className="font-semibold text-slate-900">
              {detalle?.titulo ?? 'Detalle'}
              {periodo ? ` — ${periodo}` : ''}
            </h3>
            {detalle && (
              <p className="text-sm text-slate-500">Total: {formatCantidad(detalle.total)}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col p-5">
          {loading ? (
            <p className="text-sm text-slate-500">Cargando...</p>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : !detalle || detalle.items.length === 0 ? (
            <p className="text-sm text-slate-500">Sin movimientos en este período</p>
          ) : (
            <>
              <div className="mb-4">
                <ModalSearchBar
                  value={search}
                  onChange={setSearch}
                  inputRef={searchRef}
                />
              </div>
              {search.trim() && (
                <p className="mb-3 text-xs text-slate-400">
                  {itemsFiltrados.length} de {detalle.items.length} producto(s)
                </p>
              )}
              {itemsFiltrados.length === 0 ? (
                <p className="text-sm text-slate-500">Ningún producto coincide con la búsqueda</p>
              ) : (
                <ul className="min-h-0 flex-1 divide-y divide-surface-border overflow-auto rounded-lg border">
                  {itemsFiltrados.map((item) => (
                    <li
                      key={`${item.codigo_interno}-${item.nombre}`}
                      className="flex items-center justify-between gap-3 px-4 py-3"
                    >
                      <p className="text-sm font-medium text-slate-800">{item.nombre}</p>
                      <span className="shrink-0 font-semibold tabular-nums text-slate-900">
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

      const data = await api<MovimientosDiaReport>(

        `/api/reportes/movimientos-dia?${params}`

      )

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
      const data = await api<ReporteDetalle>(
        `/api/reportes/movimientos-dia/detalle?${params}`
      )
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



  const exportBtn = (label: string, variant: 'primary' | 'secondary' = 'secondary') => (

    <Button

      type="button"

      variant={variant}

      size="sm"

      className="h-8 text-xs"

      disabled={!canExport}

      title={canExport ? `Exportar ${label}` : 'Requiere permiso de exportación'}

      onClick={() => handleExport(label)}

    >

      Exportar

    </Button>

  )



  return (

    <div className="mx-auto max-w-6xl space-y-6">

      <div>

        <h1 className="text-2xl font-bold text-slate-900">Movimientos del día</h1>

        <p className="mt-1 text-slate-500">

          Estadísticas de stock por período

        </p>

      </div>

      <Card>

        <CardBody className="space-y-3 border-b py-4">

          <div className="flex flex-wrap items-center gap-2">

            <div className="flex shrink-0 items-center gap-1.5 rounded-lg border border-surface-border bg-slate-50/60 px-2 py-1">

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

                className="shrink-0"

                onClick={() => {

                  setFechaDesde('')

                  setFechaHasta('')

                }}

              >

                <X className="h-4 w-4" />

              </Button>

            )}

          </div>

          <p className="text-xs text-slate-400">

            Una sola fecha = ese día · las dos = rango

          </p>

        </CardBody>

      </Card>



      <p className="text-sm text-slate-600">

        Período:{' '}

        <strong>

          {report

            ? formatPeriodoFechas(report.fecha_desde, report.fecha_hasta)

            : formatPeriodoFechas(fechaDesde || todayIsoDate(), fechaHasta || todayIsoDate())}

        </strong>

        {report && !loading && (

          <span className="ml-2 text-slate-400">

            · Balance = stock inicial + ingresos + retornos − planillas − roturas

          </span>

        )}

      </p>



      {error && (

        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>

      )}



      {loading ? (

        <p className="py-12 text-center text-sm text-slate-500">Calculando...</p>

      ) : report ? (

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">

          <StatCard

            title="Stock Inicial"

            value={formatCantidad(report.stock_inicial)}

            icon={Package}

            borderClass="border-blue-300"

            iconClass="bg-blue-100 text-blue-700"

            actions={exportBtn('stock inicial')}

            onClick={() => void abrirDetalle('stock_inicial')}

          />

          <StatCard

            title="Ingresos"

            value={formatSignedCantidad(report.ingresos, '+')}

            icon={ArrowDownCircle}

            borderClass="border-emerald-300"

            iconClass="bg-emerald-100 text-emerald-700"

            actions={exportBtn('ingresos')}

            onClick={() => void abrirDetalle('ingresos')}

          />

          <StatCard

            title="Retornos y Devoluciones"

            value={formatSignedCantidad(report.retornos, '+')}

            icon={ArrowUpCircle}

            borderClass="border-amber-300"

            iconClass="bg-amber-100 text-amber-700"

            actions={exportBtn('retornos')}

            onClick={() => void abrirDetalle('retornos')}

          />

          <StatCard

            title="Carga de Planillas"

            value={formatSignedCantidad(report.planillas, '-')}

            icon={ClipboardList}

            borderClass="border-red-300"

            iconClass="bg-red-100 text-red-700"

            actions={exportBtn('planillas')}

            onClick={() => void abrirDetalle('planillas')}

          />

          <StatCard

            title="Roturas y Pérdidas"

            value={formatSignedCantidad(report.roturas, '-')}

            icon={HeartCrack}

            borderClass="border-violet-300"

            iconClass="bg-violet-100 text-violet-700"

            actions={exportBtn('roturas y pérdidas')}

            onClick={() => void abrirDetalle('roturas')}

          />

          <StatCard

            title="Balance Final"

            value={formatCantidad(report.balance_final)}

            icon={Scale}

            borderClass="border-indigo-300"

            iconClass="bg-indigo-100 text-indigo-700"

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


