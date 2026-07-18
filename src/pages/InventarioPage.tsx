import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  BarChart3,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Eye,
  Loader2,
  MapPin,
  Package,
  Play,
  Plus,
  Pencil,
  Search,
  Trash2,
  Warehouse,
  X
} from 'lucide-react'
import { BarcodeScannerModal } from '@/components/BarcodeScannerModal'
import { ProductImage } from '@/components/ProductImage'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardBody } from '@/components/ui/Card'
import {
  formatCantidad,
  formatEtiqueta,
  formatTotalesInventarioResumen,
  formatValorLineaConteo,
  normalizarUnidadProducto,
  sumarTotalesInventarioLineas,
  totalesInventarioCoinciden,
  type TipoBulto,
  type TotalesInventarioDesglose
} from '@/lib/desglose'
import { api, cn, formatDbDateTimeLocal } from '@/lib/utils'
import type {
  InventarioConteoLinea,
  InventarioMisSector,
  InventarioSesionDetalle,
  InventarioSesionListItem,
  InventarioUsuarioOption,
  Producto,
  Sector,
  SectorUbicacion
} from '@/types'
import { useAuth } from '@/context/AuthContext'
import { listLocalMisSectores, reconcileOfflineConServidor } from '@/lib/inventarioOffline'
import { useInventarioActivo } from '@/context/InventarioActivoContext'
import { usePolling } from '@/hooks/usePolling'

const ESTADO_SECTOR_COLOR: Record<string, string> = {
  PENDIENTE: 'bg-slate-100 text-slate-600',
  EN_CONTEO: 'bg-blue-100 text-blue-700',
  ESPERANDO_COMPANERO: 'bg-amber-100 text-amber-800',
  CON_DIFERENCIAS: 'bg-red-100 text-red-700',
  CERRADO_OK: 'bg-emerald-100 text-emerald-700'
}

const ESTADO_SECTOR_LABEL: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  EN_CONTEO: 'En conteo',
  ESPERANDO_COMPANERO: 'Esperando compañero',
  CON_DIFERENCIAS: 'Con diferencias',
  CERRADO_OK: 'Cerrado OK'
}

function estadoSesionLabel(estado: string): string {
  const map: Record<string, string> = {
    ABIERTA: 'Abierta',
    EN_PROGRESO: 'En progreso',
    CERRADA: 'Cerrada',
    CANCELADA: 'Cancelada'
  }
  return map[estado] ?? estado
}

function sesionFechasResumen(ses: {
  fecha_inicio: string | null
  fecha_cierre: string | null
  created_at: string
}): string {
  if (ses.fecha_cierre && ses.fecha_inicio) {
    return `${formatDbDateTimeLocal(ses.fecha_inicio)} → ${formatDbDateTimeLocal(ses.fecha_cierre)}`
  }
  if (ses.fecha_inicio) return `Inicio: ${formatDbDateTimeLocal(ses.fecha_inicio)}`
  return `Creada: ${formatDbDateTimeLocal(ses.created_at)}`
}

function tipoInventarioLabel(tipo: string): string {
  const map: Record<string, string> = {
    SIN_CAMBIO: 'Sin cambio',
    FALTANTE: 'Faltante',
    SOBRANTE: 'Sobrante',
    REORGANIZACION: 'Reorganización',
    CANTIDAD: 'Ajuste de cantidad'
  }
  return map[tipo] ?? tipo
}

const TIPO_INVENTARIO_COLOR: Record<string, string> = {
  SIN_CAMBIO: 'bg-emerald-100 text-emerald-800',
  FALTANTE: 'bg-red-100 text-red-800',
  SOBRANTE: 'bg-amber-100 text-amber-800',
  REORGANIZACION: 'bg-violet-100 text-violet-800',
  CANTIDAD: 'bg-orange-100 text-orange-800'
}

type DesgloseLineaVista = {
  etiqueta: string
  total_unidades: number
}

function lineasDesgloseFromItem(
  item: Record<string, unknown>,
  origen: 'sistema' | 'contado'
): DesgloseLineaVista[] {
  const key = origen === 'sistema' ? 'lineas_sistema' : 'lineas_contado'
  const lineas = item[key] as Array<Record<string, unknown>> | undefined
  if (lineas && lineas.length > 0) {
    return lineas.map((l) => ({
      etiqueta: String(l.etiqueta ?? '—'),
      total_unidades: Number(l.total_unidades ?? 0)
    }))
  }

  const texto = String(
    origen === 'sistema' ? item.desglose_sistema ?? '' : item.desglose_contado ?? ''
  )
  if (!texto || texto === '—') return []

  return texto.split(' + ').map((part) => {
    const m = part.match(/^(.+?)\s*\(([\d.]+)\)\s*$/)
    if (m) {
      return { etiqueta: m[1].trim(), total_unidades: Number(m[2]) }
    }
    return { etiqueta: part.trim(), total_unidades: 0 }
  })
}

function resumenTotalesItem(
  item: Record<string, unknown>,
  which: 'sistema' | 'contado' | 'aplicado'
): string {
  const resumenKey =
    which === 'sistema'
      ? 'resumen_sistema'
      : which === 'aplicado'
        ? 'resumen_aplicado'
        : 'resumen_contado'
  if (item[resumenKey]) return String(item[resumenKey])

  const cajas = Number(
    which === 'sistema'
      ? item.total_sistema
      : which === 'aplicado'
        ? item.total_aplicado ?? item.total_contado
        : item.total_contado
  )
  const suelto = Number(
    which === 'sistema'
      ? item.total_suelto_sistema ?? 0
      : which === 'aplicado'
        ? item.total_suelto_aplicado ?? item.total_suelto_contado ?? 0
        : item.total_suelto_contado ?? 0
  )
  return formatTotalesInventarioResumen({ cajas, suelto }, String(item.unidad ?? ''))
}

function totalesItem(
  item: Record<string, unknown>,
  which: 'sistema' | 'contado' | 'aplicado'
): TotalesInventarioDesglose {
  const resumenKey =
    which === 'sistema'
      ? 'resumen_sistema'
      : which === 'aplicado'
        ? 'resumen_aplicado'
        : 'resumen_contado'
  if (item[resumenKey]) {
    return {
      cajas: Number(
        which === 'sistema'
          ? item.total_sistema
          : which === 'aplicado'
            ? item.total_aplicado ?? item.total_contado
            : item.total_contado
      ),
      suelto: Number(
        which === 'sistema'
          ? item.total_suelto_sistema ?? 0
          : which === 'aplicado'
            ? item.total_suelto_aplicado ?? item.total_suelto_contado ?? 0
            : item.total_suelto_contado ?? 0
      )
    }
  }
  return {
    cajas: Number(
      which === 'sistema'
        ? item.total_sistema
        : which === 'aplicado'
          ? item.total_aplicado ?? item.total_contado
          : item.total_contado
    ),
    suelto: Number(
      which === 'sistema'
        ? item.total_suelto_sistema ?? 0
        : which === 'aplicado'
          ? item.total_suelto_aplicado ?? item.total_suelto_contado ?? 0
          : item.total_suelto_contado ?? 0
    )
  }
}

function sumarTotalesMisLineas(lineas: InventarioConteoLinea[]): TotalesInventarioDesglose {
  let cajas = 0
  let suelto = 0
  for (const l of lineas) {
    cajas += Number(l.total_cajas ?? (l.tipo_bulto === 'SUELTO' ? 0 : l.total_unidades))
    suelto += Number(
      l.total_suelto ?? (l.tipo_bulto === 'SUELTO' ? l.total_unidades : l.cantidad_suelta ?? 0)
    )
  }
  return { cajas, suelto }
}

const TABLA_CIERRE_CLASS = 'min-w-[72rem] text-sm'

function CeldaCodigoProducto({ codigo }: { codigo: string }) {
  return (
    <span className="inline-flex shrink-0 rounded-md bg-slate-800 px-2.5 py-1 font-mono text-xs font-bold tracking-wide text-white shadow-sm">
      {codigo}
    </span>
  )
}

function CeldaNombreProducto({ nombre }: { nombre: string }) {
  return <p className="min-w-[14rem] whitespace-nowrap font-medium text-slate-900">{nombre}</p>
}

function CeldaTotalesInventario({
  totales,
  unidad,
  variant = 'default'
}: {
  totales: TotalesInventarioDesglose
  unidad?: string
  variant?: 'default' | 'muted' | 'emphasis'
}) {
  const u = normalizarUnidadProducto(unidad)
  const hasCajas = totales.cajas > 0
  const hasSuelto = totales.suelto > 0

  if (!hasCajas && !hasSuelto) {
    return <span className="tabular-nums text-slate-300">0</span>
  }

  return (
    <div
      className={cn(
        'inline-flex flex-col items-end gap-0.5 tabular-nums leading-snug',
        variant === 'muted' && 'text-slate-600',
        variant === 'emphasis' && 'font-semibold text-slate-900'
      )}
    >
      {(hasCajas || !hasSuelto) && (
        <span className={cn(!hasCajas && 'text-slate-400')}>
          {formatCantidad(totales.cajas)}
        </span>
      )}
      {hasSuelto && (
        <span
          className={cn(
            'text-xs',
            variant === 'emphasis' ? 'font-medium text-slate-700' : 'text-slate-500'
          )}
        >
          {formatCantidad(totales.suelto)} {u}
          {totales.suelto === 1 ? '' : 's'}
        </span>
      )}
    </div>
  )
}

function CeldaDiferenciaInventario({
  difCajas,
  difSuelto
}: {
  difCajas: number
  difSuelto: number
}) {
  if (difCajas === 0 && difSuelto === 0) {
    return <span className="text-emerald-600">—</span>
  }

  return (
    <div className="inline-flex flex-col items-end gap-0.5 tabular-nums leading-snug">
      {difCajas !== 0 && (
        <span className={cn('font-medium', difCajas > 0 ? 'text-amber-700' : 'text-red-700')}>
          {difCajas > 0 ? '+' : ''}
          {formatCantidad(difCajas)}
        </span>
      )}
      {difSuelto !== 0 && (
        <span
          className={cn('text-xs font-medium', difSuelto > 0 ? 'text-amber-700' : 'text-red-700')}
        >
          {difSuelto > 0 ? '+' : ''}
          {formatCantidad(difSuelto)} botella/s
        </span>
      )}
    </div>
  )
}

function DesgloseComparacionParalelo({
  lineasSistema,
  lineasContado,
  totalesSistema,
  totalesContado,
  unidad
}: {
  lineasSistema: DesgloseLineaVista[]
  lineasContado: DesgloseLineaVista[]
  totalesSistema: TotalesInventarioDesglose
  totalesContado: TotalesInventarioDesglose
  unidad?: string
}) {
  const filas = Math.max(lineasSistema.length, lineasContado.length, 1)

  return (
    <div className="overflow-hidden rounded-xl border border-surface-border bg-white shadow-sm">
      <div className="grid grid-cols-2 divide-x divide-surface-border border-b border-surface-border bg-slate-50/80">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sistema</span>
          <CeldaTotalesInventario totales={totalesSistema} unidad={unidad} variant="muted" />
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-brand-600">Contado</span>
          <CeldaTotalesInventario totales={totalesContado} unidad={unidad} variant="emphasis" />
        </div>
      </div>

      <div className="divide-y divide-surface-border">
        {Array.from({ length: filas }).map((_, i) => {
          const sys = lineasSistema[i]
          const cnt = lineasContado[i]
          return (
            <div
              key={i}
              className="grid grid-cols-2 divide-x divide-surface-border text-sm"
            >
              <div className="flex min-h-[2.75rem] items-center justify-between gap-4 px-4 py-2.5">
                {sys ? (
                  <>
                    <span className="min-w-0 text-slate-700">{sys.etiqueta}</span>
                    <span className="shrink-0 tabular-nums font-medium text-slate-600">
                      {formatCantidad(sys.total_unidades)}
                    </span>
                  </>
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </div>
              <div className="flex min-h-[2.75rem] items-center justify-between gap-4 bg-brand-50/20 px-4 py-2.5">
                {cnt ? (
                  <>
                    <span className="min-w-0 text-slate-800">{cnt.etiqueta}</span>
                    <span className="shrink-0 tabular-nums font-semibold text-brand-700">
                      {formatCantidad(cnt.total_unidades)}
                    </span>
                  </>
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DesgloseToggleButton({
  abierto,
  onToggle
}: {
  abierto: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="mt-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
      aria-expanded={abierto}
    >
      {abierto ? (
        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
      )}
      {abierto ? 'Ocultar desglose' : 'Ver desglose'}
    </button>
  )
}

function ReporteDetalleItem({
  item,
  compacto = false,
  desgloseColapsado = false,
  colSpanDesglose = 6
}: {
  item: Record<string, unknown>
  compacto?: boolean
  desgloseColapsado?: boolean
  colSpanDesglose?: number
}) {
  const tipo = String(item.tipo ?? 'SIN_CAMBIO')
  const dif = Number(item.diferencia ?? 0)
  const [desgloseAbierto, setDesgloseAbierto] = useState(false)

  if (compacto && tipo === 'SIN_CAMBIO') {
    return (
      <>
        <tr className="bg-white">
          <td className="whitespace-nowrap px-4 py-2.5">
            <CeldaCodigoProducto codigo={String(item.codigo_interno ?? '—')} />
          </td>
          <td className="px-4 py-2.5">
            <CeldaNombreProducto nombre={String(item.nombre)} />
            {desgloseColapsado ? (
              <DesgloseToggleButton
                abierto={desgloseAbierto}
                onToggle={() => setDesgloseAbierto((v) => !v)}
              />
            ) : (
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {String(item.desglose_contado || item.desglose_aplicado || item.desglose_sistema || '—')}
              </p>
            )}
          </td>
          <td className="px-4 py-2.5">
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-xs font-medium',
                TIPO_INVENTARIO_COLOR[tipo] ?? 'bg-slate-100 text-slate-700'
              )}
            >
              {tipoInventarioLabel(tipo)}
            </span>
          </td>
          <td className="px-4 py-2.5 text-right">
            <CeldaTotalesInventario
              totales={totalesItem(item, 'aplicado')}
              unidad={String(item.unidad ?? '')}
              variant="emphasis"
            />
          </td>
        </tr>
        {desgloseColapsado && desgloseAbierto && (
          <tr className="bg-slate-50/60">
            <td colSpan={colSpanDesglose} className="px-4 pb-3 pt-0">
              <DesgloseComparacionParalelo
                lineasSistema={lineasDesgloseFromItem(item, 'sistema')}
                lineasContado={lineasDesgloseFromItem(item, 'contado')}
                totalesSistema={totalesItem(item, 'sistema')}
                totalesContado={totalesItem(item, 'aplicado')}
                unidad={String(item.unidad ?? '')}
              />
            </td>
          </tr>
        )}
      </>
    )
  }

  return (
    <>
      <tr className="bg-white align-top">
        <td className="whitespace-nowrap px-4 py-3">
          <CeldaCodigoProducto codigo={String(item.codigo_interno ?? '—')} />
        </td>
        <td className="px-4 py-3">
          <CeldaNombreProducto nombre={String(item.nombre)} />
          {desgloseColapsado ? (
            <DesgloseToggleButton
              abierto={desgloseAbierto}
              onToggle={() => setDesgloseAbierto((v) => !v)}
            />
          ) : (
            <div className="mt-2 grid gap-1.5 text-xs sm:grid-cols-2">
              <p className="text-slate-500">
                <span className="font-medium text-slate-400">Sistema:</span>{' '}
                {String(item.desglose_sistema || '—')}
              </p>
              <p className="text-slate-500">
                <span className="font-medium text-brand-600">Contado:</span>{' '}
                {String(item.desglose_contado || '—')}
              </p>
            </div>
          )}
        </td>
        <td className="px-4 py-3">
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-xs font-medium',
              TIPO_INVENTARIO_COLOR[tipo] ?? 'bg-slate-100 text-slate-700'
            )}
          >
            {tipoInventarioLabel(tipo)}
          </span>
        </td>
        <td className="px-4 py-3 text-right">
          <CeldaTotalesInventario
            totales={totalesItem(item, 'sistema')}
            unidad={String(item.unidad ?? '')}
            variant="muted"
          />
        </td>
        <td className="px-4 py-3 text-right">
          <CeldaTotalesInventario
            totales={totalesItem(item, 'contado')}
            unidad={String(item.unidad ?? '')}
            variant="emphasis"
          />
        </td>
        <td className="px-4 py-3 text-right">
          <CeldaDiferenciaInventario
            difCajas={dif}
            difSuelto={Number(item.diferencia_suelto ?? 0)}
          />
        </td>
      </tr>
      {desgloseColapsado && desgloseAbierto && (
        <tr className="bg-slate-50/60">
          <td colSpan={colSpanDesglose} className="px-4 pb-3 pt-0">
            <DesgloseComparacionParalelo
              lineasSistema={lineasDesgloseFromItem(item, 'sistema')}
              lineasContado={lineasDesgloseFromItem(item, 'contado')}
              totalesSistema={totalesItem(item, 'sistema')}
              totalesContado={totalesItem(item, 'contado')}
              unidad={String(item.unidad ?? '')}
            />
          </td>
        </tr>
      )}
    </>
  )
}

function InventarioReporteCierre({
  reporte
}: {
  reporte: NonNullable<InventarioSesionDetalle['reporte']>
}) {
  const { resumen, detalle, ajustes_aplicados, created_at } = reporte
  const [filtro, setFiltro] = useState<'todos' | 'ajustes' | 'ok'>('todos')
  const todoOk = (resumen.con_ajuste ?? 0) === 0

  const itemsFiltrados = useMemo(() => {
    if (filtro === 'ajustes') return detalle.filter((i) => i.requiere_ajuste)
    if (filtro === 'ok') return detalle.filter((i) => !i.requiere_ajuste)
    return detalle
  }, [detalle, filtro])

  const porSector = useMemo(() => {
    const map = new Map<string, Array<Record<string, unknown>>>()
    for (const item of itemsFiltrados) {
      const key = String(item.sector_nombre ?? 'Sin sector')
      const arr = map.get(key) ?? []
      arr.push(item)
      map.set(key, arr)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'))
  }, [itemsFiltrados])

  return (
    <Card>
      <CardBody className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-800">Reporte de cierre</h2>
            <p className="mt-1 text-xs text-slate-500">
              Generado el {formatDbDateTimeLocal(created_at)}
            </p>
          </div>
          {todoOk && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700 ring-1 ring-emerald-100">
              <Check className="h-4 w-4" />
              Inventario OK — sin ajustes
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="rounded-xl border border-surface-border bg-slate-50 px-3 py-2.5">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Revisados</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">
              {resumen.productos_revisados ?? 0}
            </p>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 px-3 py-2.5">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">Sin cambio</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-emerald-800">
              {resumen.sin_cambio ?? 0}
            </p>
          </div>
          <div className="rounded-xl border border-orange-100 bg-orange-50/50 px-3 py-2.5">
            <p className="text-xs font-medium uppercase tracking-wide text-orange-600">Ajustes</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-orange-800">
              {resumen.ajustes_cantidad ?? 0}
            </p>
          </div>
          <div className="rounded-xl border border-violet-100 bg-violet-50/50 px-3 py-2.5">
            <p className="text-xs font-medium uppercase tracking-wide text-violet-600">Reorganiz.</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-violet-800">
              {resumen.reorganizaciones ?? 0}
            </p>
          </div>
          <div className="rounded-xl border border-surface-border bg-white px-3 py-2.5 col-span-2 sm:col-span-1">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Con ajuste</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">
              {resumen.con_ajuste ?? 0}
            </p>
          </div>
        </div>

        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-800">
              Listado general ({detalle.length} producto{detalle.length === 1 ? '' : 's'})
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['todos', 'Todos'],
                  ['ajustes', 'Con diferencias'],
                  ['ok', 'Sin cambio']
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFiltro(id)}
                  className={cn(
                    'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                    filtro === id
                      ? 'bg-brand-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {porSector.length === 0 ? (
            <p className="rounded-xl border border-surface-border bg-slate-50 px-4 py-3 text-sm text-slate-500">
              No hay productos para este filtro.
            </p>
          ) : (
            <div className="space-y-4">
              {porSector.map(([sectorNombre, items]) => (
                <div
                  key={sectorNombre}
                  className="overflow-hidden rounded-xl border border-surface-border"
                >
                  <div className="flex items-center justify-between border-b border-surface-border bg-slate-50 px-4 py-2.5">
                    <p className="text-sm font-semibold text-slate-800">{sectorNombre}</p>
                    <span className="text-xs text-slate-500">
                      {items.length} producto{items.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className={TABLA_CIERRE_CLASS}>
                      <thead className="bg-white text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                        <tr>
                          <th className="whitespace-nowrap px-4 py-2">Código</th>
                          <th className="min-w-[14rem] px-4 py-2">Producto</th>
                          <th className="px-4 py-2">Resultado</th>
                          {filtro !== 'ok' && (
                            <>
                              <th className="px-4 py-2 text-right">Sistema</th>
                              <th className="px-4 py-2 text-right">Contado</th>
                              <th className="px-4 py-2 text-right">Dif.</th>
                            </>
                          )}
                          {filtro === 'ok' && <th className="px-4 py-2 text-right">Total</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-border">
                        {items.map((item, idx) => (
                          <ReporteDetalleItem
                            key={`${String(item.producto_id)}-${idx}`}
                            item={item}
                            compacto={filtro === 'ok'}
                            desgloseColapsado
                            colSpanDesglose={filtro === 'ok' ? 4 : 6}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {ajustes_aplicados.length > 0 && (
          <div>
            <h3 className="mb-3 text-sm font-semibold text-slate-800">Ajustes aplicados al stock</h3>
            <div className="overflow-x-auto rounded-xl border border-surface-border">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5">Producto</th>
                    <th className="px-4 py-2.5">Sector</th>
                    <th className="px-4 py-2.5">Tipo</th>
                    <th className="px-4 py-2.5 text-right">Antes</th>
                    <th className="px-4 py-2.5 text-right">Después</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {ajustes_aplicados.map((ajuste, idx) => {
                    const det = detalle.find(
                      (d) =>
                        d.producto_id === ajuste.producto_id && d.sector_id === ajuste.sector_id
                    )
                    return (
                      <tr key={idx} className="bg-white">
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-slate-900">
                            {String(det?.nombre ?? `Producto #${String(ajuste.producto_id)}`)}
                          </p>
                          {det?.codigo_interno && (
                            <p className="font-mono text-xs text-slate-500">
                              {String(det.codigo_interno)}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">
                          {String(det?.sector_nombre ?? `#${String(ajuste.sector_id)}`)}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-xs font-medium',
                              TIPO_INVENTARIO_COLOR[String(ajuste.tipo)] ??
                                'bg-slate-100 text-slate-700'
                            )}
                          >
                            {tipoInventarioLabel(String(ajuste.tipo))}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                          {formatCantidad(Number(ajuste.antes ?? 0))}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-900">
                          {formatCantidad(Number(ajuste.despues ?? 0))}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {todoOk && (
          <p className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-800">
            Todos los productos contados coinciden con el stock del sistema. No se aplicaron ajustes.
          </p>
        )}
      </CardBody>
    </Card>
  )
}

type ComparacionSistemaData = {
  resumen: Record<string, number>
  items: Array<Record<string, unknown>>
}

type CierreDecisionModo = 'CONTADO' | 'SISTEMA' | 'MANUAL'

type ManualLineaDraft = {
  tempId: string
  tipo_bulto: TipoBulto
  cantidad_bultos: string
  unidades_por_bulto: string
  cantidad_suelta: string
}

type ItemDecisionState = {
  modo: CierreDecisionModo
  lineas: ManualLineaDraft[]
}

function comparacionItemKey(item: Record<string, unknown>): string {
  return `${String(item.producto_id)}:${String(item.sector_id)}`
}

function lineasFromComparacion(
  source: Array<Record<string, unknown>> | undefined,
  options?: {
    prefix?: string
    botellasPorCaja?: number
    fallbackTotal?: number
  }
): ManualLineaDraft[] {
  const botellasPorCaja = options?.botellasPorCaja ?? 6
  let rows = source ?? []

  if (rows.length === 0 && (options?.fallbackTotal ?? 0) > 0) {
    rows = [
      {
        tipo_bulto: 'CAJA',
        cantidad_bultos: options!.fallbackTotal,
        unidades_por_bulto: botellasPorCaja,
        cantidad_suelta: null
      }
    ]
  }

  const prefix = options?.prefix ?? 'l'
  const ts = Date.now()

  return rows.map((l, i) => {
    const tipo = String(l.tipo_bulto ?? 'CAJA') as TipoBulto
    let cantidad_bultos = l.cantidad_bultos
    let unidades_por_bulto = l.unidades_por_bulto
    let cantidad_suelta = l.cantidad_suelta
    const totalStored = Number(l.total_unidades ?? 0)

    if (tipo === 'SUELTO') {
      if ((cantidad_suelta == null || Number(cantidad_suelta) <= 0) && totalStored > 0) {
        cantidad_suelta = totalStored
      }
    } else {
      const hasBultos = cantidad_bultos != null && Number(cantidad_bultos) > 0
      const hasPorBulto = unidades_por_bulto != null && Number(unidades_por_bulto) > 0
      if (!hasBultos && !hasPorBulto && totalStored > 0) {
        if (tipo === 'PALLET') {
          cantidad_bultos = 1
          unidades_por_bulto = totalStored
        } else {
          cantidad_bultos = totalStored
          unidades_por_bulto = botellasPorCaja
        }
      } else if (hasBultos && !hasPorBulto && totalStored > 0) {
        unidades_por_bulto =
          Math.round(totalStored / Number(cantidad_bultos)) || botellasPorCaja
      }
    }

    return {
      tempId: `${prefix}-${ts}-${i}`,
      tipo_bulto: tipo,
      cantidad_bultos: cantidad_bultos != null ? String(cantidad_bultos) : '',
      unidades_por_bulto: unidades_por_bulto != null ? String(unidades_por_bulto) : '',
      cantidad_suelta: cantidad_suelta != null ? String(cantidad_suelta) : ''
    }
  })
}

function lineasParaCopia(
  item: Record<string, unknown>,
  origen: 'contado' | 'sistema'
): ManualLineaDraft[] {
  const botellasPorCaja = Number(item.botellas_por_caja ?? 6)
  const key = origen === 'contado' ? 'lineas_contado' : 'lineas_sistema'
  const lineas = item[key] as Array<Record<string, unknown>> | undefined
  const fallbackTotal =
    origen === 'sistema' ? Number(item.total_sistema ?? 0) : Number(item.total_contado ?? 0)

  return lineasFromComparacion(lineas, {
    prefix: origen === 'contado' ? 'cnt' : 'sys',
    botellasPorCaja,
    fallbackTotal: lineas?.length ? undefined : fallbackTotal
  })
}

function totalLineasManuales(
  lineas: ManualLineaDraft[],
  botellasPorCaja: number
): TotalesInventarioDesglose {
  return sumarTotalesInventarioLineas(
    lineas.map((l) => ({
      tipo_bulto: l.tipo_bulto,
      cantidad_bultos: l.cantidad_bultos,
      unidades_por_bulto: l.unidades_por_bulto,
      cantidad_suelta: l.cantidad_suelta
    })),
    botellasPorCaja
  )
}

function manualLineasToPayload(lineas: ManualLineaDraft[]): Array<Record<string, unknown>> {
  return lineas.map((l) => {
    const body: Record<string, unknown> = { tipo_bulto: l.tipo_bulto }
    if (l.tipo_bulto === 'SUELTO') {
      body.cantidad_suelta = Number(l.cantidad_suelta)
    } else {
      body.cantidad_bultos = Number(l.cantidad_bultos)
      body.unidades_por_bulto = Number(l.unidades_por_bulto)
      if (l.cantidad_suelta.trim()) {
        body.cantidad_suelta = Number(l.cantidad_suelta)
      }
    }
    return body
  })
}

function calcResumenConDecisiones(
  items: Array<Record<string, unknown>>,
  decisiones: Map<string, ItemDecisionState>
) {
  let sinCambio = 0
  let ajustesCantidad = 0
  let reorganizaciones = 0
  let conAjuste = 0
  let mantenerSistema = 0
  let correccionManual = 0

  for (const item of items) {
    const key = comparacionItemKey(item)
    const decision = decisiones.get(key)
    const modo: CierreDecisionModo = decision?.modo ?? 'CONTADO'
    const totalesSistema = totalesItem(item, 'sistema')
    const botellasPorCaja = Number(item.botellas_por_caja ?? 6)

    if (!item.requiere_ajuste) {
      sinCambio++
      continue
    }

    if (modo === 'SISTEMA') {
      sinCambio++
      mantenerSistema++
      continue
    }

    const totalesAplicado =
      modo === 'MANUAL'
        ? totalLineasManuales(decision?.lineas ?? [], botellasPorCaja)
        : totalesItem(item, 'contado')

    if (modo === 'MANUAL') correccionManual++

    if (!totalesInventarioCoinciden(totalesAplicado, totalesSistema)) {
      conAjuste++
      ajustesCantidad++
    } else if (String(item.tipo ?? '') === 'REORGANIZACION') {
      conAjuste++
      ajustesCantidad++
    } else if (String(item.tipo ?? '') === 'REORGANIZACION') {
      conAjuste++
      reorganizaciones++
    } else {
      sinCambio++
    }
  }

  return {
    productos_revisados: new Set(items.map((i) => i.producto_id)).size,
    sin_cambio: sinCambio,
    ajustes_cantidad: ajustesCantidad,
    reorganizaciones,
    con_ajuste: conAjuste,
    mantener_sistema: mantenerSistema,
    correccion_manual: correccionManual
  }
}

function ManualLineasEditor({
  lineas,
  unidad,
  botellasPorCaja,
  onChange,
  showHeader = true
}: {
  lineas: ManualLineaDraft[]
  unidad?: string | null
  botellasPorCaja: number
  onChange: (lineas: ManualLineaDraft[]) => void
  showHeader?: boolean
}) {
  const total = totalLineasManuales(lineas, botellasPorCaja)

  function updateLinea(tempId: string, patch: Partial<ManualLineaDraft>) {
    onChange(
      lineas.map((l) => (l.tempId === tempId ? { ...l, ...patch } : l))
    )
  }

  function agregarLinea() {
    onChange([
      ...lineas,
      {
        tempId: `new-${Date.now()}`,
        tipo_bulto: 'CAJA',
        cantidad_bultos: '',
        unidades_por_bulto: '',
        cantidad_suelta: ''
      }
    ])
  }

  return (
    <div className="space-y-3">
      {showHeader && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
            Líneas de corrección
          </p>
          <span className="text-sm font-bold tabular-nums text-brand-800">
            Total: {formatTotalesInventarioResumen(total, unidad)}
          </span>
        </div>
      )}

      {lineas.length === 0 ? (
        <p className="text-xs text-slate-500">
          Sin líneas — al cerrar el stock de este producto en el sector quedará en cero.
        </p>
      ) : (
        <div className="space-y-2">
          {lineas.map((linea) => (
            <div
              key={linea.tempId}
              className="flex flex-wrap items-end gap-2 rounded-lg border border-surface-border bg-white p-2"
            >
              <div className="min-w-[100px]">
                <label className="mb-1 block text-[10px] font-medium uppercase text-slate-400">
                  Tipo
                </label>
                <select
                  value={linea.tipo_bulto}
                  onChange={(e) =>
                    updateLinea(linea.tempId, {
                      tipo_bulto: e.target.value as TipoBulto,
                      cantidad_bultos: '',
                      unidades_por_bulto: '',
                      cantidad_suelta: ''
                    })
                  }
                  className="w-full rounded-lg border border-surface-border px-2 py-1.5 text-sm"
                >
                  <option value="PALLET">Pallet</option>
                  <option value="CAJA">Caja</option>
                  <option value="SUELTO">Suelto</option>
                </select>
              </div>
              {linea.tipo_bulto === 'SUELTO' ? (
                <div className="min-w-[100px] flex-1">
                  <label className="mb-1 block text-[10px] font-medium uppercase text-slate-400">
                    Cantidad suelta
                  </label>
                  <Input
                    type="number"
                    min={0}
                    value={linea.cantidad_suelta}
                    onChange={(e) => updateLinea(linea.tempId, { cantidad_suelta: e.target.value })}
                    className="h-9"
                  />
                </div>
              ) : (
                <>
                  <div className="min-w-[80px]">
                    <label className="mb-1 block text-[10px] font-medium uppercase text-slate-400">
                      {linea.tipo_bulto === 'PALLET' ? 'Pallets' : 'Cajas'}
                    </label>
                    <Input
                      type="number"
                      min={0}
                      value={linea.cantidad_bultos}
                      onChange={(e) =>
                        updateLinea(linea.tempId, { cantidad_bultos: e.target.value })
                      }
                      className="h-9"
                    />
                  </div>
                  <div className="min-w-[80px]">
                    <label className="mb-1 block text-[10px] font-medium uppercase text-slate-400">
                      Por bulto
                    </label>
                    <Input
                      type="number"
                      min={0}
                      value={linea.unidades_por_bulto}
                      onChange={(e) =>
                        updateLinea(linea.tempId, { unidades_por_bulto: e.target.value })
                      }
                      className="h-9"
                    />
                  </div>
                  <div className="min-w-[80px]">
                    <label className="mb-1 block text-[10px] font-medium uppercase text-slate-400">
                      Extra
                    </label>
                    <Input
                      type="number"
                      min={0}
                      value={linea.cantidad_suelta}
                      onChange={(e) =>
                        updateLinea(linea.tempId, { cantidad_suelta: e.target.value })
                      }
                      className="h-9"
                      placeholder="0"
                    />
                  </div>
                </>
              )}
              <div className="pb-0.5 text-xs text-slate-500">
                {formatEtiqueta(
                  {
                    tipo_bulto: linea.tipo_bulto,
                    cantidad_bultos: linea.cantidad_bultos,
                    unidades_por_bulto: linea.unidades_por_bulto,
                    cantidad_suelta: linea.cantidad_suelta
                  },
                  unidad
                )}
              </div>
              <button
                type="button"
                onClick={() => onChange(lineas.filter((l) => l.tempId !== linea.tempId))}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                aria-label="Eliminar línea"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Button type="button" variant="outline" size="sm" onClick={agregarLinea}>
        <Plus className="h-3.5 w-3.5" />
        Agregar línea
      </Button>
    </div>
  )
}

function CorreccionManualModal({
  open,
  item,
  lineas,
  onLineasChange,
  onAccept,
  onClose
}: {
  open: boolean
  item: Record<string, unknown>
  lineas: ManualLineaDraft[]
  onLineasChange: (lineas: ManualLineaDraft[]) => void
  onAccept: () => void
  onClose: () => void
}) {
  const botellasPorCaja = Number(item.botellas_por_caja ?? 6)
  const totalesDraft = totalLineasManuales(lineas, botellasPorCaja)
  const totalesSistema = totalesItem(item, 'sistema')
  const difCajas = totalesDraft.cajas - totalesSistema.cajas
  const difSuelto = totalesDraft.suelto - totalesSistema.suelto
  const hayDiferencia = !totalesInventarioCoinciden(totalesDraft, totalesSistema)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} aria-hidden />
      <div
        className="relative z-10 flex max-h-[min(90vh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-surface-border bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="correccion-manual-title"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-surface-border px-5 py-4">
          <div className="min-w-0">
            <h3 id="correccion-manual-title" className="font-semibold text-slate-900">
              Corrección manual
            </h3>
            <p className="mt-0.5 truncate text-sm text-slate-600">{String(item.nombre)}</p>
            <p className="text-xs text-slate-400">
              {String(item.codigo_interno ?? '—')} · {String(item.sector_nombre ?? 'Sector')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <DesgloseComparacionParalelo
            lineasSistema={lineasDesgloseFromItem(item, 'sistema')}
            lineasContado={lineasDesgloseFromItem(item, 'contado')}
            totalesSistema={totalesItem(item, 'sistema')}
            totalesContado={totalesItem(item, 'contado')}
            unidad={String(item.unidad ?? '')}
          />

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onLineasChange(lineasParaCopia(item, 'contado'))}
            >
              Copiar contado
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onLineasChange(lineasParaCopia(item, 'sistema'))}
            >
              Copiar sistema
            </Button>
          </div>

          <ManualLineasEditor
            lineas={lineas}
            unidad={String(item.unidad ?? '')}
            botellasPorCaja={botellasPorCaja}
            onChange={onLineasChange}
          />
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-surface-border bg-slate-50/80 px-5 py-4">
          <div className="text-sm text-slate-600">
            Total al cerrar:{' '}
            <span className="inline-block align-top">
              <CeldaTotalesInventario
                totales={totalesDraft}
                unidad={String(item.unidad ?? '')}
                variant="emphasis"
              />
            </span>
            {hayDiferencia && (
              <span className="ml-2 inline-block align-top text-xs">
                <CeldaDiferenciaInventario difCajas={difCajas} difSuelto={difSuelto} />
                <span className="text-slate-400"> vs sistema</span>
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="button" onClick={onAccept}>
              <Check className="h-4 w-4" />
              Aceptar corrección
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function VistaPreviaItemConDecision({
  item,
  decision,
  onDecisionChange,
  compacto = false,
  colSpanDesglose = 7
}: {
  item: Record<string, unknown>
  decision: ItemDecisionState
  onDecisionChange: (next: ItemDecisionState) => void
  compacto?: boolean
  colSpanDesglose?: number
}) {
  const tipo = String(item.tipo ?? 'SIN_CAMBIO')
  const dif = Number(item.diferencia ?? 0)
  const botellasPorCaja = Number(item.botellas_por_caja ?? 6)
  const [desgloseAbierto, setDesgloseAbierto] = useState(false)
  const [modalManualAbierto, setModalManualAbierto] = useState(false)
  const [draftLineas, setDraftLineas] = useState<ManualLineaDraft[]>([])
  const totalesSistema = totalesItem(item, 'sistema')
  const totalesAplicado =
    decision.modo === 'SISTEMA'
      ? totalesSistema
      : decision.modo === 'MANUAL'
        ? totalLineasManuales(decision.lineas, botellasPorCaja)
        : totalesItem(item, 'contado')
  const difCajas = totalesAplicado.cajas - totalesSistema.cajas
  const difSuelto = totalesAplicado.suelto - totalesSistema.suelto
  const requiereAjuste = Boolean(item.requiere_ajuste)
  const selectModo =
    modalManualAbierto && decision.modo !== 'MANUAL' ? 'MANUAL' : decision.modo

  function abrirModalManual() {
    setDraftLineas(
      decision.modo === 'MANUAL' && decision.lineas.length > 0
        ? decision.lineas
        : lineasParaCopia(item, 'contado')
    )
    setModalManualAbierto(true)
  }

  function cambiarModo(modo: CierreDecisionModo) {
    if (modo === 'MANUAL') {
      abrirModalManual()
      return
    }
    onDecisionChange({ modo, lineas: [] })
  }

  function aceptarCorreccionManual() {
    onDecisionChange({ modo: 'MANUAL', lineas: draftLineas })
    setModalManualAbierto(false)
  }

  function cancelarCorreccionManual() {
    setModalManualAbierto(false)
  }

  if (compacto) {
    return (
      <ReporteDetalleItem item={item} compacto />
    )
  }

  return (
    <>
      <tr className="bg-white align-top">
        <td className="whitespace-nowrap px-4 py-3">
          <CeldaCodigoProducto codigo={String(item.codigo_interno ?? '—')} />
        </td>
        <td className="px-4 py-3">
          <CeldaNombreProducto nombre={String(item.nombre)} />
          <DesgloseToggleButton
            abierto={desgloseAbierto}
            onToggle={() => setDesgloseAbierto((v) => !v)}
          />
        </td>
        <td className="px-4 py-3">
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-xs font-medium',
              TIPO_INVENTARIO_COLOR[tipo] ?? 'bg-slate-100 text-slate-700'
            )}
          >
            {tipoInventarioLabel(tipo)}
          </span>
        </td>
        <td className="px-4 py-3 text-right">
          <CeldaTotalesInventario
            totales={totalesSistema}
            unidad={String(item.unidad ?? '')}
            variant="muted"
          />
        </td>
        <td className="px-4 py-3 text-right">
          <CeldaTotalesInventario
            totales={totalesItem(item, 'contado')}
            unidad={String(item.unidad ?? '')}
            variant="emphasis"
          />
        </td>
        <td className="px-4 py-3 text-right">
          <CeldaDiferenciaInventario
            difCajas={dif}
            difSuelto={Number(item.diferencia_suelto ?? 0)}
          />
        </td>
        {requiereAjuste && (
          <td className="min-w-[11rem] px-4 py-3">
            <select
              value={selectModo}
              onChange={(e) => cambiarModo(e.target.value as CierreDecisionModo)}
              className="w-full min-w-[160px] rounded-lg border border-surface-border bg-white px-2 py-1.5 text-xs font-medium text-slate-700"
            >
              <option value="CONTADO">Aplicar contado</option>
              <option value="SISTEMA">Mantener sistema</option>
              <option value="MANUAL">Corregir manualmente</option>
            </select>
            {decision.modo === 'MANUAL' && (
              <button
                type="button"
                onClick={abrirModalManual}
                className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-brand-600 hover:text-brand-700"
              >
                <Pencil className="h-3 w-3" />
                Editar corrección
              </button>
            )}
            {decision.modo !== 'CONTADO' && (
              <div className="mt-1 text-[11px] text-slate-500">
                <span className="text-slate-400">Al cerrar:</span>{' '}
                <CeldaTotalesInventario
                  totales={totalesAplicado}
                  unidad={String(item.unidad ?? '')}
                  variant="emphasis"
                />
                {(difCajas !== 0 || difSuelto !== 0) && (
                  <span className="ml-1 inline-block align-top">
                    (
                    <CeldaDiferenciaInventario difCajas={difCajas} difSuelto={difSuelto} />)
                  </span>
                )}
              </div>
            )}
          </td>
        )}
      </tr>
      {desgloseAbierto && (
        <tr className="bg-slate-50/60">
          <td colSpan={colSpanDesglose} className="px-4 pb-3 pt-0">
            <DesgloseComparacionParalelo
              lineasSistema={lineasDesgloseFromItem(item, 'sistema')}
              lineasContado={lineasDesgloseFromItem(item, 'contado')}
              totalesSistema={totalesSistema}
              totalesContado={totalesItem(item, 'contado')}
              unidad={String(item.unidad ?? '')}
            />
          </td>
        </tr>
      )}
      <CorreccionManualModal
        open={modalManualAbierto}
        item={item}
        lineas={draftLineas}
        onLineasChange={setDraftLineas}
        onAccept={aceptarCorreccionManual}
        onClose={cancelarCorreccionManual}
      />
    </>
  )
}

function InventarioVistaPreviaCierre({
  comparacion,
  onCerrar,
  cerrando
}: {
  comparacion: ComparacionSistemaData
  onCerrar: (decisiones: Array<{
    producto_id: number
    sector_id: number
    modo: CierreDecisionModo
    lineas?: Array<Record<string, unknown>>
  }>) => void
  cerrando: boolean
}) {
  const { items } = comparacion
  const [filtro, setFiltro] = useState<'todos' | 'ajustes' | 'ok'>('ajustes')
  const [revisionConfirmada, setRevisionConfirmada] = useState(false)
  const [decisiones, setDecisiones] = useState<Map<string, ItemDecisionState>>(() => new Map())

  const resumen = useMemo(
    () => calcResumenConDecisiones(items, decisiones),
    [items, decisiones]
  )

  const hayDiferencias = (comparacion.resumen.con_ajuste ?? 0) > 0
  const puedeCerrar = !hayDiferencias || revisionConfirmada

  function getDecision(item: Record<string, unknown>): ItemDecisionState {
    const key = comparacionItemKey(item)
    return decisiones.get(key) ?? { modo: 'CONTADO', lineas: [] }
  }

  function setDecision(item: Record<string, unknown>, next: ItemDecisionState) {
    const key = comparacionItemKey(item)
    setDecisiones((prev) => {
      const map = new Map(prev)
      if (next.modo === 'CONTADO' && next.lineas.length === 0) {
        map.delete(key)
      } else {
        map.set(key, next)
      }
      return map
    })
  }

  function buildDecisionesPayload() {
    const payload: Array<{
      producto_id: number
      sector_id: number
      modo: CierreDecisionModo
      lineas?: Array<Record<string, unknown>>
    }> = []

    for (const item of items) {
      if (!item.requiere_ajuste) continue
      const key = comparacionItemKey(item)
      const decision = decisiones.get(key)
      const modo = decision?.modo ?? 'CONTADO'
      if (modo === 'CONTADO') continue

      const entry: {
        producto_id: number
        sector_id: number
        modo: CierreDecisionModo
        lineas?: Array<Record<string, unknown>>
      } = {
        producto_id: Number(item.producto_id),
        sector_id: Number(item.sector_id),
        modo
      }
      if (modo === 'MANUAL') {
        entry.lineas = manualLineasToPayload(decision?.lineas ?? [])
      }
      payload.push(entry)
    }

    return payload
  }

  const itemsFiltrados = useMemo(() => {
    if (filtro === 'ajustes') return items.filter((i) => i.requiere_ajuste)
    if (filtro === 'ok') return items.filter((i) => !i.requiere_ajuste)
    return items
  }, [items, filtro])

  const porSector = useMemo(() => {
    const map = new Map<string, Array<Record<string, unknown>>>()
    for (const item of itemsFiltrados) {
      const key = String(item.sector_nombre ?? 'Sin sector')
      const arr = map.get(key) ?? []
      arr.push(item)
      map.set(key, arr)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'))
  }, [itemsFiltrados])

  const mostrarDecisiones = filtro === 'ajustes'
  const colSpanDesglose = mostrarDecisiones ? 7 : 6

  return (
    <Card className="border-brand-200 ring-1 ring-brand-100">
      <CardBody className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-brand-600" />
              <h2 className="font-semibold text-slate-800">Vista previa de cierre</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Revisá las diferencias con el sistema antes de aplicar ajustes al stock.
            </p>
          </div>
          {!hayDiferencias && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700 ring-1 ring-emerald-100">
              <Check className="h-4 w-4" />
              Listo para cerrar
            </span>
          )}
        </div>

        {hayDiferencias && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Hay <strong>{comparacion.resumen.con_ajuste ?? 0}</strong> producto
            {(comparacion.resumen.con_ajuste ?? 0) === 1 ? '' : 's'} con diferencias respecto al
            sistema. Podés aplicar el contado, mantener el sistema o corregir manualmente producto
            por producto antes de cerrar.
          </div>
        )}

        {(resumen.mantener_sistema ?? 0) > 0 || (resumen.correccion_manual ?? 0) > 0 ? (
          <div className="rounded-xl border border-brand-200 bg-brand-50/60 px-4 py-3 text-sm text-brand-900">
            {(resumen.mantener_sistema ?? 0) > 0 && (
              <span>
                {resumen.mantener_sistema} producto
                {(resumen.mantener_sistema ?? 0) === 1 ? '' : 's'} mantendrán el stock del sistema.{' '}
              </span>
            )}
            {(resumen.correccion_manual ?? 0) > 0 && (
              <span>
                {resumen.correccion_manual} producto
                {(resumen.correccion_manual ?? 0) === 1 ? '' : 's'} con corrección manual del
                supervisor.
              </span>
            )}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="rounded-xl border border-surface-border bg-slate-50 px-3 py-2.5">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Revisados</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">
              {resumen.productos_revisados ?? 0}
            </p>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 px-3 py-2.5">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">Sin cambio</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-emerald-800">
              {resumen.sin_cambio ?? 0}
            </p>
          </div>
          <div className="rounded-xl border border-orange-100 bg-orange-50/50 px-3 py-2.5">
            <p className="text-xs font-medium uppercase tracking-wide text-orange-600">Ajustes</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-orange-800">
              {resumen.ajustes_cantidad ?? 0}
            </p>
          </div>
          <div className="rounded-xl border border-violet-100 bg-violet-50/50 px-3 py-2.5">
            <p className="text-xs font-medium uppercase tracking-wide text-violet-600">Reorganiz.</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-violet-800">
              {resumen.reorganizaciones ?? 0}
            </p>
          </div>
          <div className="col-span-2 rounded-xl border border-surface-border bg-white px-3 py-2.5 sm:col-span-1">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Con ajuste</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">
              {resumen.con_ajuste ?? 0}
            </p>
          </div>
        </div>

        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-800">
              Comparación contado vs sistema ({items.length} producto{items.length === 1 ? '' : 's'})
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['ajustes', 'Con diferencias'],
                  ['todos', 'Todos'],
                  ['ok', 'Sin cambio']
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFiltro(id)}
                  className={cn(
                    'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                    filtro === id
                      ? 'bg-brand-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[min(420px,50vh)] space-y-4 overflow-y-auto pr-1">
            {porSector.length === 0 ? (
              <p className="rounded-xl border border-surface-border bg-slate-50 px-4 py-3 text-sm text-slate-500">
                No hay productos para este filtro.
              </p>
            ) : (
              porSector.map(([sectorNombre, sectorItems]) => (
                <div
                  key={sectorNombre}
                  className="overflow-hidden rounded-xl border border-surface-border"
                >
                  <div className="flex items-center justify-between border-b border-surface-border bg-slate-50 px-4 py-2.5">
                    <p className="text-sm font-semibold text-slate-800">{sectorNombre}</p>
                    <span className="text-xs text-slate-500">
                      {sectorItems.length} producto{sectorItems.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className={TABLA_CIERRE_CLASS}>
                      <thead className="bg-white text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                        <tr>
                          <th className="whitespace-nowrap px-4 py-2">Código</th>
                          <th className="min-w-[14rem] px-4 py-2">Producto</th>
                          <th className="px-4 py-2">Resultado</th>
                          {filtro !== 'ok' && (
                            <>
                              <th className="px-4 py-2 text-right">Sistema</th>
                              <th className="px-4 py-2 text-right">Contado</th>
                              <th className="px-4 py-2 text-right">Dif.</th>
                              {mostrarDecisiones && (
                                <th className="px-4 py-2">Al cerrar</th>
                              )}
                            </>
                          )}
                          {filtro === 'ok' && <th className="px-4 py-2 text-right">Total</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-border">
                        {sectorItems.map((item, idx) =>
                          mostrarDecisiones && item.requiere_ajuste ? (
                            <VistaPreviaItemConDecision
                              key={`${String(item.producto_id)}-${idx}`}
                              item={item}
                              decision={getDecision(item)}
                              onDecisionChange={(next) => setDecision(item, next)}
                              colSpanDesglose={colSpanDesglose}
                            />
                          ) : (
                            <ReporteDetalleItem
                              key={`${String(item.producto_id)}-${idx}`}
                              item={item}
                              compacto={filtro === 'ok'}
                              desgloseColapsado={filtro !== 'ok'}
                              colSpanDesglose={colSpanDesglose}
                            />
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-surface-border bg-slate-50/80 p-4">
          {hayDiferencias && (
            <label className="mb-4 flex cursor-pointer items-start gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={revisionConfirmada}
                onChange={(e) => setRevisionConfirmada(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-surface-border text-brand-600 focus:ring-brand-500"
              />
              <span>
                Confirmo haber revisado las diferencias y autorizo aplicar los ajustes según la
                columna &quot;Al cerrar&quot; de cada producto.
              </span>
            </label>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              onClick={() => onCerrar(buildDecisionesPayload())}
              disabled={!puedeCerrar || cerrando}
              className="rounded-xl"
            >
              {cerrando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {cerrando ? 'Cerrando inventario…' : 'Cerrar inventario y aplicar ajustes'}
            </Button>
          </div>
          {hayDiferencias && !revisionConfirmada && (
            <p className="mt-2 text-right text-xs text-slate-500">
              Marcá la confirmación para habilitar el cierre.
            </p>
          )}
        </div>
      </CardBody>
    </Card>
  )
}

export function InventarioPage() {
  const { hasPermiso, user, offlineSession } = useAuth()
  const navigate = useNavigate()
  const { sectorInvId } = useParams<{ sectorInvId?: string }>()

  const canCreate = hasPermiso('inventario.crear_sesion')
  const canSupervise = hasPermiso('inventario.supervisar')
  const canCount = hasPermiso('inventario.contar')
  const canClose = hasPermiso('inventario.cerrar')
  const canManageInventario = canCreate || canSupervise || canClose

  const { activo, refresh: refreshInventarioActivo } = useInventarioActivo()

  const [sesiones, setSesiones] = useState<InventarioSesionListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [view, setView] = useState<'list' | 'create' | 'sesion' | 'contar'>('list')
  const [selectedSesionId, setSelectedSesionId] = useState<number | null>(null)
  const [sesionDetalle, setSesionDetalle] = useState<InventarioSesionDetalle | null>(null)
  const [comparacionSistema, setComparacionSistema] = useState<ComparacionSistemaData | null>(null)
  const [cerrando, setCerrando] = useState(false)

  const [misSectores, setMisSectores] = useState<InventarioMisSector[]>([])

  const mapLocalSectores = useCallback(async (): Promise<InventarioMisSector[]> => {
    const localRaw = await listLocalMisSectores(user?.id)
    return localRaw.map(
      (s): InventarioMisSector => ({
        ...s,
        estado: s.estado as InventarioMisSector['estado']
      })
    )
  }, [user?.id])

  const loadMisSectores = useCallback(async () => {
    if (!canCount) return

    const local = await mapLocalSectores()
    // Pintar ya lo local (modo depósito sin PC)
    if (local.length > 0) setMisSectores(local)

    const skipRemote =
      offlineSession || (typeof navigator !== 'undefined' && navigator.onLine === false)
    if (skipRemote) {
      setMisSectores(local)
      return
    }

    try {
      const mis = await api<{ sectores: InventarioMisSector[] }>('/api/inventario/mis-sectores', {
        timeoutMs: 3000
      })
      // Sesión cancelada u otros sectores ya no activos en el PC → limpiar paquetes locales
      await reconcileOfflineConServidor(mis.sectores.map((s) => s.id))
      setMisSectores(mis.sectores)
    } catch {
      setMisSectores(local)
    }
  }, [canCount, mapLocalSectores, offlineSession])

  const loadBase = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      // Primero lo local: la lista no debe esperar al PC
      if (canCount) {
        const local = await mapLocalSectores()
        setMisSectores(local)
      }

      const skipRemote =
        offlineSession || (typeof navigator !== 'undefined' && navigator.onLine === false)

      if (skipRemote) {
        setSesiones([])
        return
      }

      if (canManageInventario) {
        try {
          const sesionesData = await api<InventarioSesionListItem[]>('/api/inventario/sesiones', {
            timeoutMs: 3000
          })
          setSesiones(sesionesData)
        } catch {
          setSesiones([])
        }
      } else {
        setSesiones([])
      }

      try {
        await refreshInventarioActivo()
      } catch {
        /* ok offline */
      }
      await loadMisSectores()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar inventario')
    } finally {
      setLoading(false)
    }
  }, [
    canCount,
    canManageInventario,
    refreshInventarioActivo,
    loadMisSectores,
    mapLocalSectores,
    offlineSession
  ])

  useEffect(() => {
    void loadBase()
  }, [loadBase])

  useEffect(() => {
    if (sectorInvId) {
      setView('contar')
    }
  }, [sectorInvId])

  async function loadSesion(id: number, options?: { silent?: boolean }) {
    if (!options?.silent) setLoading(true)
    try {
      const det = await api<InventarioSesionDetalle>(`/api/inventario/sesiones/${id}`)
      setSesionDetalle(det)
      setSelectedSesionId(id)
      if (!options?.silent) setView('sesion')
      if (det.sesion.estado === 'EN_PROGRESO' && (canSupervise || canClose)) {
        const todosSectoresCerrados = det.sectores.every((s) => s.estado === 'CERRADO_OK')
        if (todosSectoresCerrados) {
          try {
            const comp = await api<ComparacionSistemaData>(
              `/api/inventario/sesiones/${id}/comparacion-sistema`
            )
            setComparacionSistema(comp)
          } catch {
            setComparacionSistema(null)
          }
        } else {
          setComparacionSistema(null)
        }
      } else {
        setComparacionSistema(null)
      }
    } catch (e) {
      if (!options?.silent) {
        setError(e instanceof Error ? e.message : 'Error al cargar sesión')
      }
    } finally {
      if (!options?.silent) setLoading(false)
    }
  }

  usePolling(
    () => {
      if (selectedSesionId == null) return
      return loadSesion(selectedSesionId, { silent: true })
    },
    view === 'sesion' && sesionDetalle?.sesion.estado === 'EN_PROGRESO'
  )

  usePolling(
    () => loadMisSectores(),
    view === 'list' && canCount && activo != null && !offlineSession
  )

  async function iniciarSesion(id: number) {
    try {
      await api(`/api/inventario/sesiones/${id}/iniciar`, { method: 'POST' })
      await refreshInventarioActivo()
      await loadBase()
      await loadSesion(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al iniciar')
    }
  }

  async function cerrarSesion(
    id: number,
    decisiones: Array<{
      producto_id: number
      sector_id: number
      modo: CierreDecisionModo
      lineas?: Array<Record<string, unknown>>
    }> = []
  ) {
    if (
      !confirm(
        '¿Confirmar cierre del inventario? Se aplicarán los ajustes al stock según lo revisado.'
      )
    ) {
      return
    }
    setCerrando(true)
    setError('')
    try {
      await api(`/api/inventario/sesiones/${id}/cerrar`, {
        method: 'POST',
        body: JSON.stringify({ decisiones })
      })
      await refreshInventarioActivo()
      await loadBase()
      await loadSesion(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cerrar')
    } finally {
      setCerrando(false)
    }
  }

  async function cancelarSesion(id: number) {
    if (!confirm('¿Cancelar esta sesión de inventario?')) return
    try {
      await api(`/api/inventario/sesiones/${id}/cancelar`, { method: 'POST' })
      await refreshInventarioActivo()
      setView('list')
      await loadBase()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cancelar')
    }
  }

  if (view === 'create' && canCreate) {
    return (
      <CrearSesionForm
        onBack={() => setView('list')}
        onCreated={async (id) => {
          await loadBase()
          await loadSesion(id)
        }}
      />
    )
  }

  if (view === 'contar' && sectorInvId && canCount) {
    return (
      <ConteoSectorView
        inventarioSectorId={Number(sectorInvId)}
        onBack={() => {
          navigate('/inventario')
          setView('list')
          void loadBase()
        }}
      />
    )
  }

  if (view === 'sesion' && sesionDetalle && canManageInventario) {
    const s = sesionDetalle.sesion
    const todosSectoresOk = sesionDetalle.sectores.every((x) => x.estado === 'CERRADO_OK')
    const listoParaCierre =
      s.estado === 'EN_PROGRESO' && todosSectoresOk && comparacionSistema != null && canClose
    const anchoCierre = listoParaCierre || sesionDetalle.reporte

    return (
      <div
        className={cn(
          'mx-auto space-y-4 p-4 md:p-6',
          anchoCierre ? 'max-w-[88rem]' : 'max-w-5xl'
        )}
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => { setView('list'); setSesionDetalle(null) }}>
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-slate-800">{s.nombre}</h1>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                {estadoSesionLabel(s.estado)}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-slate-500">
              {sesionFechasResumen(s)} · {s.creado_por_nombre}
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <Card>
          <CardBody className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {s.estado === 'ABIERTA' && canCreate && (
                <Button onClick={() => void iniciarSesion(s.id)}>
                  <Play className="h-4 w-4" />
                  Iniciar inventario
                </Button>
              )}
              {s.estado === 'EN_PROGRESO' && canClose && !listoParaCierre && (
                <p className="text-sm text-slate-500">
                  El cierre se habilita cuando todos los sectores estén en estado OK entre contadores.
                </p>
              )}
              {['ABIERTA', 'EN_PROGRESO'].includes(s.estado) && canCreate && (
                <Button variant="outline" onClick={() => void cancelarSesion(s.id)}>Cancelar sesión</Button>
              )}
            </div>

            <p className="text-sm text-slate-500">
              Progreso: {sesionDetalle.sectores.filter((x) => x.estado === 'CERRADO_OK').length} /{' '}
              {sesionDetalle.sectores.length} sectores OK · actualización automática cada 20 s
            </p>

            <div className="space-y-2">
              {sesionDetalle.sectores.map((sec) => (
                <div
                  key={sec.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-surface-border px-3 py-2"
                >
                  <div>
                    <p className="font-medium text-slate-800">{sec.sector_nombre}</p>
                    <p className="text-xs text-slate-500">
                      {sec.contador_1_nombre} + {sec.contador_2_nombre} · Ronda {sec.ronda_actual}
                      {sec.modo_conectividad === 'OFFLINE' ? ' · Offline' : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {sec.modo_conectividad === 'OFFLINE' && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-amber-100">
                        Offline
                        {sec.importado_at ? ' · importado' : sec.paquete_descargado_at ? ' · paquete' : ''}
                      </span>
                    )}
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', ESTADO_SECTOR_COLOR[sec.estado])}>
                      {ESTADO_SECTOR_LABEL[sec.estado]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        {listoParaCierre && comparacionSistema && (
          <InventarioVistaPreviaCierre
            comparacion={comparacionSistema}
            onCerrar={(decisiones) => void cerrarSesion(s.id, decisiones)}
            cerrando={cerrando}
          />
        )}

        {sesionDetalle.reporte && <InventarioReporteCierre reporte={sesionDetalle.reporte} />}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Inventario</h1>
          <p className="text-sm text-slate-500">Conteo físico con doble verificación</p>
        </div>
        {canCreate && !activo && (
          <Button onClick={() => setView('create')}>
            <Plus className="h-4 w-4" />
            Nuevo inventario
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {offlineSession && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          Modo sin red al PC. Podés seguir con los sectores offline descargados en este celular.
        </div>
      )}

      {canCount && misSectores.length > 0 && (
        <Card>
          <CardBody>
            <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-800">
              <ClipboardList className="h-5 w-5" />
              Mis sectores
            </h2>
            <div className="space-y-2">
              {misSectores.map((sec) => (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() =>
                    navigate(
                      sec.modo_conectividad === 'OFFLINE'
                        ? `/inventario/offline/${sec.id}`
                        : `/inventario/contar/${sec.id}`
                    )
                  }
                  className="flex w-full items-center justify-between rounded-lg border border-surface-border px-3 py-3 text-left hover:bg-slate-50"
                >
                  <div>
                    <p className="font-medium text-slate-800">{sec.sector_nombre}</p>
                    <p className="text-xs text-slate-500">
                      Con {sec.soy_contador_1 ? sec.contador_2_nombre : sec.contador_1_nombre} · Ronda{' '}
                      {sec.ronda_actual}
                      {sec.modo_conectividad === 'OFFLINE' ? ' · Offline' : ''}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {sec.modo_conectividad === 'OFFLINE' && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-amber-100">
                        Offline
                      </span>
                    )}
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', ESTADO_SECTOR_COLOR[sec.estado])}>
                      {ESTADO_SECTOR_LABEL[sec.estado]}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {canManageInventario && (
      <Card>
        <CardBody>
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-800">
            <BarChart3 className="h-5 w-5" />
            Sesiones
          </h2>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : sesiones.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No hay sesiones de inventario</p>
          ) : (
            <>
              {sesiones.length > 6 && (
                <p className="mb-2 text-xs text-slate-500">
                  {sesiones.length} sesiones — desplazá para ver el historial completo
                </p>
              )}
              <div className="scrollbar-thin max-h-[25rem] space-y-2 overflow-y-auto overscroll-contain pr-1">
                {sesiones.map((ses) => (
                  <button
                    key={ses.id}
                    type="button"
                    onClick={() => void loadSesion(ses.id)}
                    className="flex w-full shrink-0 items-center justify-between rounded-lg border border-surface-border px-3 py-3 text-left hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800">{ses.nombre}</p>
                      <p className="text-xs text-slate-500">{sesionFechasResumen(ses)}</p>
                      <p className="text-xs text-slate-500">
                        {ses.creado_por_nombre} · {ses.sectores_ok}/{ses.sectores_total} sectores OK
                      </p>
                    </div>
                    <span className="text-xs text-slate-500">{estadoSesionLabel(ses.estado)}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </CardBody>
      </Card>
      )}

      {canCount && !canManageInventario && misSectores.length === 0 && !loading && (
        <Card>
          <CardBody>
            <p className="py-4 text-center text-sm text-slate-500">
              No tenés sectores asignados para contar en este momento.
            </p>
          </CardBody>
        </Card>
      )}
    </div>
  )
}

function CrearSesionForm({
  onBack,
  onCreated
}: {
  onBack: () => void
  onCreated: (id: number) => void
}) {
  const [nombre, setNombre] = useState('')
  const [sectores, setSectores] = useState<Sector[]>([])
  const [usuarios, setUsuarios] = useState<InventarioUsuarioOption[]>([])
  const [selectedSectorIds, setSelectedSectorIds] = useState<Set<number>>(new Set())
  const [asignaciones, setAsignaciones] = useState<
    Record<number, { c1: number; c2: number; modo: 'ONLINE' | 'OFFLINE' }>
  >({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    void (async () => {
      const [s, u] = await Promise.all([
        api<Sector[]>('/api/sectores'),
        api<InventarioUsuarioOption[]>('/api/inventario/usuarios-contadores')
      ])
      setSectores(s.filter((x) => x.activo))
      setUsuarios(u)
    })()
  }, [])

  function toggleSector(id: number) {
    setSelectedSectorIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) {
      setError('Nombre requerido')
      return
    }
    const sectoresBody = [...selectedSectorIds].map((sector_id) => {
      const a = asignaciones[sector_id]
      return {
        sector_id,
        contador_1_id: a?.c1 ?? 0,
        contador_2_id: a?.c2 ?? 0,
        modo_conectividad: (a?.modo ?? 'ONLINE') as 'ONLINE' | 'OFFLINE'
      }
    })
    if (sectoresBody.length === 0) {
      setError('Seleccioná al menos un sector')
      return
    }
    for (const s of sectoresBody) {
      if (!s.contador_1_id || !s.contador_2_id) {
        setError('Asigná dos contadores por cada sector')
        return
      }
      if (s.contador_1_id === s.contador_2_id) {
        setError('Los contadores deben ser distintos')
        return
      }
    }
    setSaving(true)
    setError('')
    try {
      const res = await api<{ id: number }>('/api/inventario/sesiones', {
        method: 'POST',
        body: JSON.stringify({ nombre: nombre.trim(), sectores: sectoresBody })
      })
      onCreated(res.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" />
        Volver
      </Button>
      <h1 className="text-xl font-semibold text-slate-800">Nuevo inventario</h1>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        <Input label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Inventario Julio 2026" />

        <Card>
          <CardBody className="space-y-3">
            <p className="text-sm font-medium text-slate-700">Sectores y contadores</p>
            {sectores.map((sec) => (
              <div key={sec.id} className="rounded-lg border border-surface-border p-3">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedSectorIds.has(sec.id)}
                    onChange={() => toggleSector(sec.id)}
                  />
                  <span className="font-medium">{sec.nombre}</span>
                </label>
                {selectedSectorIds.has(sec.id) && (
                  <div className="mt-2 space-y-2">
                    <div className="grid gap-2 sm:grid-cols-2">
                    <select
                      className="rounded border border-surface-border px-2 py-1.5 text-sm"
                      value={asignaciones[sec.id]?.c1 ?? ''}
                      onChange={(e) =>
                        setAsignaciones((prev) => ({
                          ...prev,
                          [sec.id]: {
                            c1: Number(e.target.value),
                            c2: prev[sec.id]?.c2 ?? 0,
                            modo: prev[sec.id]?.modo ?? 'ONLINE'
                          }
                        }))
                      }
                    >
                      <option value="">Contador 1...</option>
                      {usuarios.map((u) => (
                        <option key={u.id} value={u.id}>{u.nombre}</option>
                      ))}
                    </select>
                    <select
                      className="rounded border border-surface-border px-2 py-1.5 text-sm"
                      value={asignaciones[sec.id]?.c2 ?? ''}
                      onChange={(e) =>
                        setAsignaciones((prev) => ({
                          ...prev,
                          [sec.id]: {
                            c1: prev[sec.id]?.c1 ?? 0,
                            c2: Number(e.target.value),
                            modo: prev[sec.id]?.modo ?? 'ONLINE'
                          }
                        }))
                      }
                    >
                      <option value="">Contador 2...</option>
                      {usuarios.map((u) => (
                        <option key={u.id} value={u.id}>{u.nombre}</option>
                      ))}
                    </select>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={cn(
                          'rounded-lg border px-3 py-1.5 text-xs font-medium',
                          (asignaciones[sec.id]?.modo ?? 'ONLINE') === 'ONLINE'
                            ? 'border-brand-500 bg-brand-50 text-brand-800'
                            : 'border-surface-border text-slate-600'
                        )}
                        onClick={() =>
                          setAsignaciones((prev) => ({
                            ...prev,
                            [sec.id]: {
                              c1: prev[sec.id]?.c1 ?? 0,
                              c2: prev[sec.id]?.c2 ?? 0,
                              modo: 'ONLINE'
                            }
                          }))
                        }
                      >
                        Con red
                      </button>
                      <button
                        type="button"
                        className={cn(
                          'rounded-lg border px-3 py-1.5 text-xs font-medium',
                          asignaciones[sec.id]?.modo === 'OFFLINE'
                            ? 'border-amber-500 bg-amber-50 text-amber-900'
                            : 'border-surface-border text-slate-600'
                        )}
                        onClick={() =>
                          setAsignaciones((prev) => ({
                            ...prev,
                            [sec.id]: {
                              c1: prev[sec.id]?.c1 ?? 0,
                              c2: prev[sec.id]?.c2 ?? 0,
                              modo: 'OFFLINE'
                            }
                          }))
                        }
                      >
                        Offline (APK)
                      </button>
                    </div>
                    {asignaciones[sec.id]?.modo === 'OFFLINE' && (
                      <p className="text-xs text-amber-800">
                        Bajan paquete en oficina → cuentan sin WiFi al PC → sincronizan entre
                        celulares → importan al PC.
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </CardBody>
        </Card>

        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Crear sesión
        </Button>
      </form>
    </div>
  )
}

type InventarioDiferenciaContadores = {
  producto_id: number
  codigo_interno: string
  nombre: string
  resumen_contador_1: string
  resumen_contador_2: string
  lineas_contador_1?: InventarioConteoLinea[]
  lineas_contador_2?: InventarioConteoLinea[]
}

type InventarioComparacionContadores = {
  ronda: number
  ok: Array<Record<string, unknown>>
  diferencias: InventarioDiferenciaContadores[]
  coincide: boolean
}

function resumenContadorDiff(d: InventarioDiferenciaContadores, contador: 1 | 2): string {
  return contador === 1 ? d.resumen_contador_1 : d.resumen_contador_2
}

function ConteoSectorView({
  inventarioSectorId,
  onBack
}: {
  inventarioSectorId: number
  onBack: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sectorInfo, setSectorInfo] = useState<Record<string, unknown> | null>(null)
  const [misLineas, setMisLineas] = useState<InventarioConteoLinea[]>([])
  const [comparacion, setComparacion] = useState<InventarioComparacionContadores | null>(null)
  const [referenciaReconteo, setReferenciaReconteo] =
    useState<InventarioComparacionContadores | null>(null)
  const [productSearch, setProductSearch] = useState('')
  const [productResults, setProductResults] = useState<Producto[]>([])
  const [searchingProducts, setSearchingProducts] = useState(false)
  const [productHighlightIndex, setProductHighlightIndex] = useState(-1)
  const [selectedProduct, setSelectedProduct] = useState<Producto | null>(null)
  const [tipoBulto, setTipoBulto] = useState<TipoBulto>('PALLET')
  const [cantidadBultos, setCantidadBultos] = useState('')
  const [unidadesPorBulto, setUnidadesPorBulto] = useState('')
  const [cantidadSuelta, setCantidadSuelta] = useState('')
  const [ubicacionId, setUbicacionId] = useState('')
  const [ubicaciones, setUbicaciones] = useState<SectorUbicacion[]>([])
  const [showScanner, setShowScanner] = useState(false)
  const [saving, setSaving] = useState(false)
  const [expandedProductos, setExpandedProductos] = useState<Set<number>>(new Set())
  const [editingLineaId, setEditingLineaId] = useState<number | null>(null)

  const productSearchRef = useRef<HTMLInputElement>(null)
  const productResultsListRef = useRef<HTMLUListElement>(null)
  const tipoRef = useRef<HTMLSelectElement>(null)
  const cantidadBultosRef = useRef<HTMLInputElement>(null)
  const unidadesRef = useRef<HTMLInputElement>(null)
  const cantidadSueltaRef = useRef<HTMLInputElement>(null)
  const ubicacionSelectRef = useRef<HTMLSelectElement>(null)
  const listScrollRef = useRef<HTMLDivElement>(null)
  const cargaPanelRef = useRef<HTMLDivElement>(null)
  const productLineFormRef = useRef<HTMLDivElement>(null)

  function focusField(ref: React.RefObject<HTMLElement | null>) {
    requestAnimationFrame(() => {
      const el = ref.current
      if (!el) return
      el.focus()
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
  }

  function scrollFieldIntoView(ref: React.RefObject<HTMLElement | null>) {
    requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
  }

  function scrollListToBottom() {
    requestAnimationFrame(() => {
      const el = listScrollRef.current
      if (el) {
        el.scrollTop = el.scrollHeight
      }
    })
  }

  function defaultUnidadesPorBulto(tipo: 'PALLET' | 'CAJA', p: Producto | null): string {
    if (!p) return tipo === 'PALLET' ? '112' : '6'
    if (tipo === 'PALLET') {
      return String(p.unidades_por_pallet_default ?? 112)
    }
    return String(p.unidades_por_caja_default ?? 6)
  }

  function resetLineaForm(forProduct?: Producto | null) {
    const p = forProduct ?? selectedProduct
    setTipoBulto('PALLET')
    setCantidadBultos('')
    setUnidadesPorBulto(defaultUnidadesPorBulto('PALLET', p))
    setCantidadSuelta('')
  }

  function handleTipoBultoChange(tipo: TipoBulto) {
    setTipoBulto(tipo)
    if (tipo === 'SUELTO') {
      setCantidadBultos('')
      setUnidadesPorBulto('')
      setCantidadSuelta('')
    } else {
      setUnidadesPorBulto(defaultUnidadesPorBulto(tipo, selectedProduct))
    }
  }

  function selectProduct(p: Producto) {
    setSelectedProduct(p)
    setProductSearch(p.codigo_interno)
    setProductResults([])
    setProductHighlightIndex(-1)
    if (!editingLineaId) resetLineaForm(p)
    setError('')
    setTimeout(() => focusField(tipoRef), 50)
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

  function toggleProductoExpand(productoId: number) {
    setExpandedProductos((prev) => {
      const next = new Set(prev)
      if (next.has(productoId)) next.delete(productoId)
      else next.add(productoId)
      return next
    })
  }

  const loadSector = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true)
    try {
      const data = await api<{
        sector: Record<string, unknown>
        mi_rol: 1 | 2 | null
        ubicaciones: SectorUbicacion[]
        mis_lineas: InventarioConteoLinea[]
        lineas_contador_1?: InventarioConteoLinea[]
        lineas_contador_2?: InventarioConteoLinea[]
        comparacion: InventarioComparacionContadores | null
        referencia_reconteo: InventarioComparacionContadores | null
      }>(`/api/inventario/sectores/${inventarioSectorId}`)
      setSectorInfo({ ...data.sector, mi_rol: data.mi_rol ?? null })
      setUbicaciones(data.ubicaciones ?? [])
      setMisLineas(data.mis_lineas)
      setComparacion(data.comparacion)
      setReferenciaReconteo(data.referencia_reconteo)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar sector')
    } finally {
      if (!options?.silent) setLoading(false)
    }
  }, [inventarioSectorId])

  useEffect(() => {
    void loadSector()
  }, [loadSector])

  const estado = String(sectorInfo?.estado ?? '')

  usePolling(
    () => loadSector({ silent: true }),
    estado !== '' && estado !== 'CERRADO_OK'
  )

  useEffect(() => {
    if (!loading && puedeEditarRef.current) {
      setTimeout(() => {
        const tieneUbicaciones =
          Boolean(sectorInfo?.usa_ubicaciones) && ubicaciones.length > 0
        if (tieneUbicaciones && !ubicacionId) {
          ubicacionSelectRef.current?.focus()
        } else {
          productSearchRef.current?.focus()
        }
      }, 80)
    }
  }, [loading, sectorInfo?.usa_ubicaciones, ubicaciones.length, ubicacionId])

  useEffect(() => {
    if (!productSearch.trim()) {
      setProductResults([])
      setSearchingProducts(false)
      return
    }
    setSearchingProducts(true)
    const t = setTimeout(() => {
      void api<Producto[]>(`/api/productos?q=${encodeURIComponent(productSearch)}`)
        .then((rows) => {
          setProductResults(rows)
          setSearchingProducts(false)
        })
        .catch(() => {
          setProductResults([])
          setSearchingProducts(false)
        })
    }, 250)
    return () => clearTimeout(t)
  }, [productSearch])

  useEffect(() => {
    setProductHighlightIndex(-1)
  }, [productResults])

  useLayoutEffect(() => {
    if (productHighlightIndex < 0) return
    const list = productResultsListRef.current
    if (!list) return
    const item = list.children[productHighlightIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [productHighlightIndex])

  useLayoutEffect(() => {
    if (misLineas.length > 0) {
      scrollListToBottom()
    }
  }, [misLineas.length])

  useLayoutEffect(() => {
    if (!selectedProduct) return
    scrollFieldIntoView(productLineFormRef)
  }, [selectedProduct])

  const ronda = Number(sectorInfo?.ronda_actual ?? 1)
  const miRol = sectorInfo?.mi_rol === 1 || sectorInfo?.mi_rol === 2 ? sectorInfo.mi_rol : null
  const enReconteo =
    estado === 'EN_CONTEO' &&
    ronda > 1 &&
    (referenciaReconteo?.diferencias.length ?? 0) > 0

  const referenciaPorProducto = useMemo(() => {
    const map = new Map<number, InventarioDiferenciaContadores>()
    for (const d of referenciaReconteo?.diferencias ?? []) {
      map.set(d.producto_id, d)
    }
    return map
  }, [referenciaReconteo])

  useEffect(() => {
    if (!enReconteo || !referenciaReconteo) return
    setExpandedProductos(new Set(referenciaReconteo.diferencias.map((d) => d.producto_id)))
  }, [enReconteo, referenciaReconteo?.ronda])

  const lineasPorProducto = useMemo(() => {
    const map = new Map<number, InventarioConteoLinea[]>()
    for (const l of misLineas) {
      const arr = map.get(l.producto_id) ?? []
      arr.push(l)
      map.set(l.producto_id, arr)
    }

    const ids = new Set(map.keys())
    if (enReconteo && referenciaReconteo) {
      for (const d of referenciaReconteo.diferencias) {
        ids.add(d.producto_id)
      }
    }

    const orderedIds =
      enReconteo && referenciaReconteo
        ? [
            ...referenciaReconteo.diferencias.map((d) => d.producto_id),
            ...[...ids].filter(
              (id) => !referenciaReconteo.diferencias.some((d) => d.producto_id === id)
            )
          ]
        : [...ids]

    return orderedIds.map((producto_id) => {
      const lineas = map.get(producto_id) ?? []
      const ref = referenciaPorProducto.get(producto_id)
      const totales = sumarTotalesMisLineas(lineas)
      return {
        producto_id,
        nombre: lineas[0]?.nombre ?? ref?.nombre ?? '',
        codigo: lineas[0]?.codigo_interno ?? ref?.codigo_interno ?? '',
        lineas,
        total: totales,
        resumen: formatTotalesInventarioResumen(totales),
        referencia: ref
      }
    })
  }, [misLineas, enReconteo, referenciaReconteo, referenciaPorProducto])

  const totalGeneral = useMemo(() => sumarTotalesMisLineas(misLineas), [misLineas])
  const resumenGeneral = useMemo(
    () => formatTotalesInventarioResumen(totalGeneral),
    [totalGeneral]
  )

  const usaUbicaciones = Boolean(sectorInfo?.usa_ubicaciones) && ubicaciones.length > 0
  const ubicacionSeleccionada = useMemo(
    () => ubicaciones.find((u) => u.id === Number(ubicacionId)) ?? null,
    [ubicaciones, ubicacionId]
  )
  const yoFinalice =
    miRol === 1
      ? Boolean(sectorInfo?.contador_1_finalizo)
      : miRol === 2
        ? Boolean(sectorInfo?.contador_2_finalizo)
        : true
  const puedeEditar =
    miRol != null &&
    estado !== 'CERRADO_OK' &&
    estado !== 'CON_DIFERENCIAS' &&
    !yoFinalice
  const puedeFinalizar = miRol != null && estado !== 'CERRADO_OK' && !yoFinalice
  const esperandoCompanero = estado === 'ESPERANDO_COMPANERO' && yoFinalice

  const puedeEditarRef = useRef(puedeEditar)
  puedeEditarRef.current = puedeEditar

  async function agregarLinea(): Promise<boolean> {
    if (!selectedProduct) {
      setError('Seleccioná un producto primero')
      return false
    }

    const body: Record<string, unknown> = {
      producto_id: selectedProduct.id,
      tipo_bulto: tipoBulto
    }

    if (tipoBulto === 'SUELTO') {
      const suelta = Number(cantidadSuelta)
      if (!Number.isFinite(suelta) || suelta <= 0) {
        setError('Indicá la cantidad suelta')
        return false
      }
      body.cantidad_suelta = suelta
    } else {
      const bultos = Number(cantidadBultos)
      const porBulto = Number(unidadesPorBulto)
      if (!Number.isFinite(bultos) || bultos <= 0) {
        setError(`Indicá la cantidad de ${tipoBulto === 'PALLET' ? 'pallets' : 'cajas'}`)
        return false
      }
      if (!Number.isFinite(porBulto) || porBulto <= 0) {
        setError('Indicá las unidades por bulto')
        return false
      }
      body.cantidad_bultos = bultos
      body.unidades_por_bulto = porBulto
      if (cantidadSuelta.trim()) {
        const extra = Number(cantidadSuelta)
        if (Number.isFinite(extra) && extra > 0) body.cantidad_suelta = extra
      }
    }

    if (ubicacionSeleccionada) {
      body.ubicacion_id = ubicacionSeleccionada.id
      body.ubicacion = ubicacionSeleccionada.nombre
    }

    const productoId = selectedProduct.id
    setSaving(true)
    setError('')
    try {
      if (editingLineaId) {
        await api(`/api/inventario/sectores/${inventarioSectorId}/lineas/${editingLineaId}`, {
          method: 'PUT',
          body: JSON.stringify(body)
        })
      } else {
        await api(`/api/inventario/sectores/${inventarioSectorId}/lineas`, {
          method: 'POST',
          body: JSON.stringify(body)
        })
      }
      setExpandedProductos((prev) => new Set(prev).add(productoId))
      setEditingLineaId(null)
      setSelectedProduct(null)
      setProductSearch('')
      setProductResults([])
      resetLineaForm()
      await loadSector({ silent: true })
      setTimeout(() => productSearchRef.current?.focus(), 50)
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar línea')
      return false
    } finally {
      setSaving(false)
    }
  }

  async function empezarEditarLinea(l: InventarioConteoLinea) {
    setEditingLineaId(l.id)
    setError('')
    try {
      const rows = await api<Producto[]>(
        `/api/productos?q=${encodeURIComponent(l.codigo_interno ?? '')}`
      )
      const p = rows.find((r) => r.id === l.producto_id) ?? rows[0]
      if (p) {
        setSelectedProduct(p)
        setProductSearch(p.codigo_interno)
        setProductResults([])
      }
      setTipoBulto(l.tipo_bulto as TipoBulto)
      if (l.tipo_bulto === 'SUELTO') {
        setCantidadBultos('')
        setUnidadesPorBulto('')
        setCantidadSuelta(String(l.cantidad_suelta ?? l.total_unidades ?? ''))
      } else {
        setCantidadBultos(String(l.cantidad_bultos ?? ''))
        setUnidadesPorBulto(String(l.unidades_por_bulto ?? ''))
        setCantidadSuelta(l.cantidad_suelta != null ? String(l.cantidad_suelta) : '')
      }
      scrollFieldIntoView(productLineFormRef)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar línea')
    }
  }

  function cancelarLineaForm() {
    setEditingLineaId(null)
    setSelectedProduct(null)
    setProductSearch('')
    setProductResults([])
    resetLineaForm()
  }

  async function agregarLineaYContinuar() {
    await agregarLinea()
  }

  function handleLineaEnter(e: React.KeyboardEvent) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    void agregarLineaYContinuar()
  }

  async function eliminarLinea(lineaId: number) {
    try {
      await api(`/api/inventario/sectores/${inventarioSectorId}/lineas/${lineaId}`, { method: 'DELETE' })
      await loadSector({ silent: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al eliminar')
    }
  }

  async function finalizarSector() {
    if (!confirm('¿Finalizaste el conteo de este sector?')) return
    try {
      const res = await api<{ comparacion: typeof comparacion }>(
        `/api/inventario/sectores/${inventarioSectorId}/finalizar`,
        { method: 'POST' }
      )
      setComparacion(res.comparacion)
      await loadSector({ silent: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al finalizar')
    }
  }

  async function iniciarReconteo() {
    try {
      await api(`/api/inventario/sectores/${inventarioSectorId}/reconteo`, { method: 'POST' })
      await loadSector({ silent: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al iniciar reconteo')
    }
  }

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-5rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    )
  }

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
                  <p className="border-b border-slate-200/90 pb-1.5 text-[10px] leading-snug text-slate-500">
                    <span className="text-slate-400">Ronda anterior ·</span>{' '}
                    <span className="font-medium text-slate-600">
                      Vos {resumenContadorDiff(ref, miRol)}
                    </span>
                    <span className="mx-1 text-slate-300">vs</span>
                    <span className="font-medium text-slate-600">
                      Compañero {resumenContadorDiff(ref, miRol === 1 ? 2 : 1)}
                    </span>
                  </p>
                )}
                {grupo.lineas.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-surface-border bg-white px-3 py-4 text-center text-sm text-slate-500">
                    Sin líneas — buscá el producto arriba para cargar
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {grupo.lineas.map((l, idx) => (
                      <li
                        key={l.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-surface-border bg-white px-3 py-2.5 text-sm"
                      >
                        <div className="min-w-0 text-slate-800">
                          <span className="text-xs text-slate-400">{idx + 1}.</span> {l.etiqueta}
                          {l.ubicacion && (
                            <span className="ml-1.5 text-xs text-slate-500">({l.ubicacion})</span>
                          )}
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
                                onClick={() => void empezarEditarLinea(l)}
                              >
                                <Pencil className="h-4 w-4 text-brand-600" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="rounded-lg"
                                onClick={() => void eliminarLinea(l.id)}
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
              onClick={onBack}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Salir
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-sm font-semibold text-slate-900">
                {String(sectorInfo?.sector_nombre)}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-white px-2.5 py-1 font-medium text-slate-700 ring-1 ring-surface-border">
                  Ronda {ronda}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 font-medium text-brand-800 ring-1 ring-brand-100">
                  <Warehouse className="h-3 w-3" />
                  {ESTADO_SECTOR_LABEL[estado] ?? estado}
                </span>
                {ubicacionSeleccionada && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 font-medium text-violet-800 ring-1 ring-violet-100">
                    <MapPin className="h-3 w-3" />
                    {ubicacionSeleccionada.nombre}
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

        {esperandoCompanero && (
          <div className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-sm text-amber-800 sm:px-5">
            Ya finalizaste este sector. Esperando a que tu compañero termine su conteo. La pantalla se
            actualiza sola cada 20 segundos.
          </div>
        )}

        {estado === 'ESPERANDO_COMPANERO' && !yoFinalice && miRol != null && (
          <div className="border-b border-blue-100 bg-blue-50 px-4 py-2 text-sm text-blue-800 sm:px-5">
            Tu compañero ya finalizó. Revisá tus líneas y tocá «Finalicé este sector» cuando estés listo.
          </div>
        )}

        {comparacion && (estado === 'CON_DIFERENCIAS' || estado === 'CERRADO_OK') && (
          <div className="border-b border-amber-100 bg-amber-50/80 px-4 py-3 text-sm sm:px-5">
            <h2 className="font-medium text-slate-800">Comparación con compañero</h2>
            {comparacion.coincide ? (
              <p className="mt-1 flex items-center gap-2 text-emerald-700">
                <Check className="h-4 w-4" />
                Todos los productos coinciden
              </p>
            ) : (
              <div className="mt-2 space-y-2">
                {comparacion.diferencias.map((d, i) => (
                  <div key={i} className="rounded-lg border border-red-200 bg-white p-2 text-sm">
                    <p className="font-medium">{String(d.nombre)}</p>
                    <p className="text-slate-600">
                      Vos:{' '}
                      {String(
                        (d as { resumen_contador_1?: string }).resumen_contador_1 ??
                          (d as { total_contador_1?: number }).total_contador_1 ??
                          '—'
                      )}{' '}
                      · Compañero:{' '}
                      {String(
                        (d as { resumen_contador_2?: string }).resumen_contador_2 ??
                          (d as { total_contador_2?: number }).total_contador_2 ??
                          '—'
                      )}
                    </p>
                  </div>
                ))}
                {estado === 'CON_DIFERENCIAS' && (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-600">
                      Al iniciar reconteo se precargan tus líneas anteriores en cada producto con
                      diferencia. Podés corregirlas, agregar o borrar sin buscar de nuevo.
                    </p>
                    <Button size="sm" className="rounded-xl" onClick={() => void iniciarReconteo()}>
                      Iniciar reconteo
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {puedeEditar && (
          <div className="space-y-3 overflow-visible p-4 sm:p-5">
            {usaUbicaciones ? (
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <label className="mb-0.5 block text-xs font-medium text-slate-600">Ubicación</label>
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
                    className="w-full rounded-xl border border-surface-border bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  >
                    <option value="">Seleccionar…</option>
                    {ubicaciones.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-[42px] shrink-0 rounded-xl px-3"
                  onClick={() => setShowScanner(true)}
                  aria-label="Escanear código"
                  title="Escanear código"
                >
                  <Camera className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex justify-end">
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
            )}

            <div className="relative z-30 min-w-0">
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
                {searchingProducts && (
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
            {usaUbicaciones && (
              <p className="text-xs text-slate-500">
                Elegí la ubicación una vez; se aplica a cada producto hasta que la cambies.
              </p>
            )}

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
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-600">
                      {editingLineaId ? 'Editar línea' : 'Nueva línea'}
                    </p>
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
                    onClick={cancelarLineaForm}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                  <div>
                    <label className="mb-0.5 block text-xs font-medium text-slate-600">Tipo</label>
                    <select
                      ref={tipoRef}
                      value={tipoBulto}
                      onChange={(e) => handleTipoBultoChange(e.target.value as TipoBulto)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          if (tipoBulto === 'SUELTO') {
                            focusField(cantidadSueltaRef)
                          } else {
                            focusField(cantidadBultosRef)
                          }
                        }
                      }}
                      className="w-full rounded-lg border border-surface-border px-2 py-1.5 text-sm"
                    >
                      <option value="PALLET">Pallet</option>
                      <option value="CAJA">Caja</option>
                      <option value="SUELTO">Suelto</option>
                    </select>
                  </div>

                  {tipoBulto === 'SUELTO' ? (
                    <Input
                      ref={cantidadSueltaRef}
                      label="Cantidad suelta"
                      type="number"
                      min="1"
                      value={cantidadSuelta}
                      onChange={(e) => setCantidadSuelta(e.target.value)}
                      onKeyDown={handleLineaEnter}
                      placeholder="12"
                      className="col-span-2 [&_label]:text-xs"
                    />
                  ) : (
                    <>
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
                            focusField(unidadesRef)
                          }
                        }}
                        placeholder={tipoBulto === 'PALLET' ? '2' : '1'}
                        className="[&_label]:text-xs"
                      />
                      <Input
                        ref={unidadesRef}
                        label={
                          tipoBulto === 'PALLET'
                            ? '× cajas por pallet'
                            : '× botellas por caja'
                        }
                        type="number"
                        min="1"
                        value={unidadesPorBulto}
                        onChange={(e) => setUnidadesPorBulto(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            focusField(cantidadSueltaRef)
                          }
                        }}
                        placeholder={tipoBulto === 'PALLET' ? '112' : '6'}
                        className="[&_label]:text-xs"
                      />
                      <Input
                        ref={cantidadSueltaRef}
                        label={
                          tipoBulto === 'PALLET'
                            ? 'Cajas sueltas (opc.)'
                            : 'Botellas sueltas (opc.)'
                        }
                        type="number"
                        min="0"
                        value={cantidadSuelta}
                        onChange={(e) => setCantidadSuelta(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            void agregarLineaYContinuar()
                          }
                        }}
                        placeholder="0"
                        className="[&_label]:text-xs"
                      />
                    </>
                  )}

                  <div className="flex items-end">
                    <Button
                      type="button"
                      size="sm"
                      className="w-full rounded-xl"
                      onClick={() => void agregarLineaYContinuar()}
                      disabled={saving}
                    >
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                      {editingLineaId ? 'Guardar' : 'Enter ↵'}
                    </Button>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-slate-500">
                  <span className="font-medium text-slate-600">Pallet:</span> 3 × 112 = 3 pallets de 112
                  cajas; cajas sueltas al costado van en el campo aparte.{' '}
                  <span className="font-medium text-slate-600">Caja:</span> 30 × 6 = 30 cajas de 6
                  botellas; botellas sueltas al costado, en su campo.{' '}
                  <span className="font-medium text-slate-600">Suelto:</span> solo unidades sueltas, sin bulto.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <div
        ref={listScrollRef}
        className="relative z-0 min-h-0 flex-1 overflow-y-auto bg-white"
      >
        {lineasListContent}
      </div>

      <div className="shrink-0 border-t border-surface-border bg-white px-4 py-4 shadow-[0_-4px_12px_rgba(0,0,0,0.04)] sm:px-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Total contado
            </p>
            <p className="text-lg font-bold tabular-nums text-brand-700 sm:text-2xl">{resumenGeneral}</p>
            <p className="mt-0.5 text-[11px] text-slate-400">Cajas y botellerio por separado</p>
            <p className="mt-1 text-xs text-slate-500">
              {misLineas.length} línea{misLineas.length === 1 ? '' : 's'} ·{' '}
              {lineasPorProducto.length} producto{lineasPorProducto.length === 1 ? '' : 's'}
            </p>
          </div>
          {puedeFinalizar && (
            <Button className="shrink-0 rounded-xl" onClick={() => void finalizarSector()}>
              <Check className="h-4 w-4" />
              Finalicé este sector
            </Button>
          )}
        </div>
      </div>

      {showScanner && (
        <BarcodeScannerModal
          open={showScanner}
          onClose={() => setShowScanner(false)}
          onScan={(code) => {
            setShowScanner(false)
            setProductSearch(code)
            setSelectedProduct(null)
            setProductResults([])
            setTimeout(() => productSearchRef.current?.focus(), 50)
          }}
        />
      )}
    </div>
  )
}
