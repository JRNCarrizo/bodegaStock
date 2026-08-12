import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import {
  botellasPorCajaDefault,
  cajasPorPalletDefault,
  formatEtiqueta,
  formatTotalCajas
} from '@/lib/desglose'
import { api } from '@/lib/utils'
import type { SectorUbicacion, StockLineaConsulta } from '@/types'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

export interface AjusteStockLineaPayload {
  tipo_bulto: 'PALLET' | 'CAJA' | 'SUELTO'
  cantidad_bultos?: number | null
  unidades_por_bulto?: number | null
  cantidad_suelta?: number | null
  ubicacion_id?: number | null
}

interface DraftLinea {
  tempId: string
  tipo_bulto: 'PALLET' | 'CAJA' | 'SUELTO'
  cantidad_bultos: string
  unidades_por_bulto: string
  cantidad_suelta: string
  ubicacion_id: string
}

function newTempId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function emptyLinea(
  defaults: { botellasPorCaja: number; cajasPorPallet: number },
  ubicacionId = ''
): DraftLinea {
  return {
    tempId: newTempId(),
    tipo_bulto: 'CAJA',
    cantidad_bultos: '',
    unidades_por_bulto: String(defaults.botellasPorCaja),
    cantidad_suelta: '',
    ubicacion_id: ubicacionId
  }
}

function fromExistentes(
  lineas: StockLineaConsulta[],
  defaults: { botellasPorCaja: number; cajasPorPallet: number }
): DraftLinea[] {
  if (lineas.length === 0) return [emptyLinea(defaults)]
  return lineas.map((l) => {
    const tipo =
      l.tipo_bulto === 'PALLET' || l.tipo_bulto === 'CAJA' || l.tipo_bulto === 'SUELTO'
        ? l.tipo_bulto
        : 'CAJA'
    return {
      tempId: newTempId(),
      tipo_bulto: tipo,
      cantidad_bultos: l.cantidad_bultos != null ? String(l.cantidad_bultos) : '',
      unidades_por_bulto:
        l.unidades_por_bulto != null
          ? String(l.unidades_por_bulto)
          : String(
              tipo === 'PALLET' ? defaults.cajasPorPallet : defaults.botellasPorCaja
            ),
      cantidad_suelta: l.cantidad_suelta != null ? String(l.cantidad_suelta) : '',
      ubicacion_id: l.ubicacion_id != null ? String(l.ubicacion_id) : ''
    }
  })
}

export function AjustarStockForm({
  sectorId,
  sectorNombre,
  lineasActuales,
  unidadProducto,
  botellasPorCaja,
  cajasPorPallet,
  loading,
  onConfirm,
  onCancel
}: {
  sectorId: number
  sectorNombre: string
  lineasActuales: StockLineaConsulta[]
  unidadProducto: string
  botellasPorCaja?: number | null
  cajasPorPallet?: number | null
  loading: boolean
  onConfirm: (payload: { motivo: string; lineas: AjusteStockLineaPayload[] }) => void
  onCancel: () => void
}) {
  const defaults = useMemo(
    () => ({
      botellasPorCaja: botellasPorCajaDefault(botellasPorCaja),
      cajasPorPallet: cajasPorPalletDefault(cajasPorPallet)
    }),
    [botellasPorCaja, cajasPorPallet]
  )

  const [motivo, setMotivo] = useState('')
  const [rows, setRows] = useState<DraftLinea[]>(() =>
    fromExistentes(lineasActuales, defaults)
  )
  const [ubicaciones, setUbicaciones] = useState<SectorUbicacion[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const data = await api<SectorUbicacion[]>(`/api/sectores/${sectorId}/ubicaciones`)
        if (!cancelled) setUbicaciones((data ?? []).filter((u) => u.activo !== 0))
      } catch {
        if (!cancelled) setUbicaciones([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [sectorId])

  const usaUbicaciones = ubicaciones.length > 0

  function updateRow(tempId: string, patch: Partial<DraftLinea>) {
    setRows((prev) => prev.map((r) => (r.tempId === tempId ? { ...r, ...patch } : r)))
  }

  function handleTipoChange(tempId: string, tipo: DraftLinea['tipo_bulto']) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.tempId !== tempId) return r
        if (tipo === 'SUELTO') {
          return {
            ...r,
            tipo_bulto: tipo,
            cantidad_bultos: '',
            unidades_por_bulto: '',
            cantidad_suelta: r.cantidad_suelta || ''
          }
        }
        return {
          ...r,
          tipo_bulto: tipo,
          unidades_por_bulto:
            r.unidades_por_bulto ||
            String(tipo === 'PALLET' ? defaults.cajasPorPallet : defaults.botellasPorCaja),
          cantidad_suelta: ''
        }
      })
    )
  }

  function previewEtiqueta(row: DraftLinea): string {
    if (row.tipo_bulto === 'SUELTO') {
      return formatEtiqueta(
        {
          tipo_bulto: 'SUELTO',
          cantidad_suelta: Number(row.cantidad_suelta) || 0
        },
        unidadProducto
      )
    }
    return formatEtiqueta(
      {
        tipo_bulto: row.tipo_bulto,
        cantidad_bultos: Number(row.cantidad_bultos) || 0,
        unidades_por_bulto: Number(row.unidades_por_bulto) || 0,
        cantidad_suelta: Number(row.cantidad_suelta) || 0
      },
      unidadProducto
    )
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const motivoTrim = motivo.trim()
    if (!motivoTrim) {
      setError('Indicá el motivo del ajuste')
      return
    }

    const lineas: AjusteStockLineaPayload[] = []
    for (const row of rows) {
      if (row.tipo_bulto === 'SUELTO') {
        const n = Number(row.cantidad_suelta)
        if (!Number.isFinite(n) || n <= 0) {
          setError('Completá la cantidad de botellas sueltas en cada línea')
          return
        }
        lineas.push({
          tipo_bulto: 'SUELTO',
          cantidad_suelta: n,
          ubicacion_id: row.ubicacion_id ? Number(row.ubicacion_id) : null
        })
        continue
      }

      const bultos = Number(row.cantidad_bultos)
      const porBulto = Number(row.unidades_por_bulto)
      if (!Number.isFinite(bultos) || bultos <= 0 || !Number.isFinite(porBulto) || porBulto <= 0) {
        setError('Completá cantidad y unidades por bulto en cada línea')
        return
      }
      lineas.push({
        tipo_bulto: row.tipo_bulto,
        cantidad_bultos: bultos,
        unidades_por_bulto: porBulto,
        ubicacion_id: row.ubicacion_id ? Number(row.ubicacion_id) : null
      })
    }

    onConfirm({ motivo: motivoTrim, lineas })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-4 space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3"
    >
      <div>
        <p className="text-sm font-semibold text-slate-900">
          Ajustar stock · {sectorNombre}
        </p>
        <p className="mt-0.5 text-xs text-slate-600">
          Reemplaza el desglose de este sector. Usalo para corregir errores (ej. botellas en vez
          de cajas). Queda registrado con tu usuario.
        </p>
      </div>

      <Input
        label="Motivo *"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Ej. Inventario: contaron botellas en vez de cajas"
        required
      />

      <div className="space-y-2">
        {rows.map((row, idx) => (
          <div
            key={row.tempId}
            className="rounded-lg border border-surface-border bg-white p-2.5 shadow-sm"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Línea {idx + 1}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">{previewEtiqueta(row)}</span>
                {rows.length > 1 && (
                  <button
                    type="button"
                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    onClick={() => setRows((prev) => prev.filter((r) => r.tempId !== row.tempId))}
                    aria-label="Eliminar línea"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-4">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-500">Tipo</label>
                <select
                  value={row.tipo_bulto}
                  onChange={(e) =>
                    handleTipoChange(row.tempId, e.target.value as DraftLinea['tipo_bulto'])
                  }
                  className="w-full rounded-lg border border-surface-border bg-white px-2 py-2 text-sm"
                >
                  <option value="PALLET">Pallet</option>
                  <option value="CAJA">Caja</option>
                  <option value="SUELTO">Suelto</option>
                </select>
              </div>

              {row.tipo_bulto === 'SUELTO' ? (
                <div className="sm:col-span-2">
                  <Input
                    label="Cantidad suelta"
                    type="number"
                    min="1"
                    inputMode="numeric"
                    value={row.cantidad_suelta}
                    onChange={(e) => updateRow(row.tempId, { cantidad_suelta: e.target.value })}
                  />
                </div>
              ) : (
                <>
                  <Input
                    label={row.tipo_bulto === 'PALLET' ? 'Cant. pallets' : 'Cant. cajas'}
                    type="number"
                    min="1"
                    inputMode="numeric"
                    value={row.cantidad_bultos}
                    onChange={(e) => updateRow(row.tempId, { cantidad_bultos: e.target.value })}
                  />
                  <Input
                    label={
                      row.tipo_bulto === 'PALLET' ? '× cajas por pallet' : '× botellas por caja'
                    }
                    type="number"
                    min="1"
                    inputMode="numeric"
                    value={row.unidades_por_bulto}
                    onChange={(e) =>
                      updateRow(row.tempId, { unidades_por_bulto: e.target.value })
                    }
                  />
                </>
              )}

              {usaUbicaciones && (
                <div className={row.tipo_bulto === 'SUELTO' ? '' : 'sm:col-span-1'}>
                  <label className="mb-1 block text-[11px] font-medium text-slate-500">
                    Ubicación
                  </label>
                  <select
                    value={row.ubicacion_id}
                    onChange={(e) => updateRow(row.tempId, { ubicacion_id: e.target.value })}
                    className="w-full rounded-lg border border-surface-border bg-white px-2 py-2 text-sm"
                  >
                    <option value="">Sin ubicación</option>
                    {ubicaciones.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setRows((prev) => [...prev, emptyLinea(defaults)])}
        >
          <Plus className="h-3.5 w-3.5" />
          Agregar línea
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-red-700 hover:bg-red-50"
          onClick={() => setRows([])}
        >
          Dejar en cero
        </Button>
        <span className="text-xs text-slate-500">
          Actual: {formatTotalCajas(
            lineasActuales.reduce((s, l) => s + Number(l.total_unidades ?? 0), 0)
          )}
        </span>
      </div>

      {rows.length === 0 && (
        <p className="rounded-lg bg-white/80 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
          Sin líneas = stock en cero en este sector.
        </p>
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="submit" disabled={loading} className="rounded-lg">
          {loading ? 'Guardando...' : 'Confirmar ajuste'}
        </Button>
        <Button type="button" variant="secondary" disabled={loading} onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
