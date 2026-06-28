import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import {
  formatEtiqueta,
  formatTotalCajas
} from '@/lib/desglose'
import type {
  ReorganizarDesglosePayload,
  ReorganizarLineaInfo,
  ReferenciaBulto
} from '@/types'
import { Button } from '@/components/ui/Button'

interface BultoRow {
  tempId: string
  tipo_bulto: 'PALLET' | 'CAJA'
  cantidad_bultos: string
  unidades_por_bulto: string
}

function newTempId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function emptyRow(): BultoRow {
  return {
    tempId: newTempId(),
    tipo_bulto: 'PALLET',
    cantidad_bultos: '',
    unidades_por_bulto: ''
  }
}

function findPalletRef(refs: ReferenciaBulto[]): ReferenciaBulto | undefined {
  return refs.find((r) => r.tipo_bulto === 'PALLET') ?? refs[0]
}

function buildInitialRows(info: ReorganizarLineaInfo): BultoRow[] {
  const ref = findPalletRef(info.referencias_bulto)
  if (!ref || ref.tipo_bulto !== 'PALLET') return [emptyRow()]

  const u = ref.unidades_por_bulto
  const bultos = Math.floor(info.total_unidades / u)
  if (bultos <= 0) return [emptyRow()]

  return [
    {
      tempId: newTempId(),
      tipo_bulto: 'PALLET',
      cantidad_bultos: String(bultos),
      unidades_por_bulto: String(u)
    }
  ]
}

function calcRestoUnidades(total: number, rows: BultoRow[]): number {
  const pallets = rows.reduce((sum, row) => {
    const b = Number(row.cantidad_bultos)
    const u = Number(row.unidades_por_bulto)
    if (!Number.isFinite(b) || !Number.isFinite(u) || b <= 0 || u <= 0) return sum
    return sum + b * u
  }, 0)
  return Math.max(0, total - pallets)
}

function rowSubtotal(row: BultoRow): number {
  const b = Number(row.cantidad_bultos)
  const u = Number(row.unidades_por_bulto)
  if (!Number.isFinite(b) || !Number.isFinite(u) || b <= 0 || u <= 0) return 0
  return b * u
}

export function ReorganizarStockForm({
  titulo,
  info,
  unidadProducto,
  loading,
  onConfirm,
  onCancel
}: {
  titulo: string
  info: ReorganizarLineaInfo
  unidadProducto: string
  loading: boolean
  onConfirm: (desglose: ReorganizarDesglosePayload) => void
  onCancel: () => void
}) {
  const [rows, setRows] = useState<BultoRow[]>(() => buildInitialRows(info))
  const [unidadesSueltas, setUnidadesSueltas] = useState(() =>
    String(calcRestoUnidades(info.total_unidades, buildInitialRows(info)))
  )
  const [unidadesManual, setUnidadesManual] = useState(false)

  const total = info.total_unidades
  const asignadoPallets = useMemo(
    () => rows.reduce((sum, row) => sum + rowSubtotal(row), 0),
    [rows]
  )
  const unidadesNum = Number(unidadesSueltas)
  const asignadoTotal =
    asignadoPallets + (Number.isFinite(unidadesNum) && unidadesNum >= 0 ? unidadesNum : 0)
  const diferencia = total - asignadoTotal

  const previewPartes = useMemo(() => {
    const partes: string[] = []
    for (const row of rows) {
      const sub = rowSubtotal(row)
      if (sub <= 0) continue
      partes.push(
        formatEtiqueta(
          {
            tipo_bulto: row.tipo_bulto,
            cantidad_bultos: row.cantidad_bultos,
            unidades_por_bulto: row.unidades_por_bulto
          },
          unidadProducto
        )
      )
    }
    if (Number.isFinite(unidadesNum) && unidadesNum > 0) {
      partes.push(formatTotalCajas(unidadesNum))
    }
    return partes.join(' + ')
  }, [rows, unidadesNum, unidadProducto])

  function recalcUnidades(nextRows: BultoRow[]) {
    setUnidadesSueltas(String(calcRestoUnidades(total, nextRows)))
  }

  function updateRow(tempId: string, patch: Partial<BultoRow>) {
    const next = rows.map((r) => (r.tempId === tempId ? { ...r, ...patch } : r))
    setRows(next)
    if (!unidadesManual) recalcUnidades(next)
  }

  function addRow(ref?: ReferenciaBulto) {
    const next = [
      ...rows,
      ref
        ? {
            tempId: newTempId(),
            tipo_bulto: ref.tipo_bulto,
            cantidad_bultos: '',
            unidades_por_bulto: String(ref.unidades_por_bulto)
          }
        : emptyRow()
    ]
    setRows(next)
    if (!unidadesManual) recalcUnidades(next)
  }

  function removeRow(tempId: string) {
    const next = rows.filter((r) => r.tempId !== tempId)
    const normalized = next.length > 0 ? next : [emptyRow()]
    setRows(normalized)
    if (!unidadesManual) recalcUnidades(normalized)
  }

  function handleConfirm() {
    const bultos = rows
      .map((row) => ({
        tipo_bulto: row.tipo_bulto,
        cantidad_bultos: Number(row.cantidad_bultos),
        unidades_por_bulto: Number(row.unidades_por_bulto)
      }))
      .filter((b) => b.cantidad_bultos > 0 && b.unidades_por_bulto > 0)

    onConfirm({
      bultos,
      unidades_sueltas: Number.isFinite(unidadesNum) && unidadesNum >= 0 ? unidadesNum : 0
    })
  }

  const canConfirm =
    diferencia === 0 &&
    (rows.some((r) => rowSubtotal(r) > 0) || unidadesNum > 0) &&
    !loading

  return (
    <div className="mt-2 rounded-md border border-amber-200 bg-amber-50/80 p-3">
      <p className="text-xs font-semibold text-amber-950">
        Reorganizar {titulo} ({total} cajas)
      </p>

      {info.referencias_bulto.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="self-center text-[10px] font-medium uppercase tracking-wide text-amber-800/70">
            Referencias:
          </span>
          {info.referencias_bulto.map((ref) => {
            const label =
              ref.tipo_bulto === 'PALLET'
                ? `Pallet × ${ref.unidades_por_bulto}`
                : `Caja × ${ref.unidades_por_bulto}`
            return (
              <button
                key={`${ref.tipo_bulto}-${ref.unidades_por_bulto}`}
                type="button"
                className="rounded-full border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-medium text-amber-900 hover:bg-amber-100"
                onClick={() => addRow(ref)}
              >
                + {label}
              </button>
            )
          })}
        </div>
      )}

      <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Pallets
      </p>
      <div className="mt-1.5 space-y-2">
        {rows.map((row, idx) => (
          <div
            key={row.tempId}
            className="flex flex-wrap items-end gap-2 rounded-md border border-amber-200/80 bg-white p-2"
          >
            <div className="min-w-[88px] flex-1">
              <label className="mb-1 block text-[10px] font-medium text-slate-500">
                Tipo #{idx + 1}
              </label>
              <select
                value={row.tipo_bulto}
                onChange={(e) =>
                  updateRow(row.tempId, {
                    tipo_bulto: e.target.value as 'PALLET' | 'CAJA'
                  })
                }
                className="w-full rounded-md border border-surface-border px-2 py-1.5 text-xs"
              >
                <option value="PALLET">Pallet</option>
                <option value="CAJA">Caja (bulto)</option>
              </select>
            </div>
            <div className="w-16">
              <label className="mb-1 block text-[10px] font-medium text-slate-500">Cant.</label>
              <input
                type="number"
                min={1}
                step={1}
                value={row.cantidad_bultos}
                onChange={(e) => updateRow(row.tempId, { cantidad_bultos: e.target.value })}
                className="w-full rounded-md border border-surface-border px-2 py-1.5 text-xs"
                placeholder="0"
              />
            </div>
            <div className="w-16">
              <label className="mb-1 block text-[10px] font-medium text-slate-500">× cajas</label>
              <input
                type="number"
                min={1}
                step={1}
                value={row.unidades_por_bulto}
                onChange={(e) => updateRow(row.tempId, { unidades_por_bulto: e.target.value })}
                className="w-full rounded-md border border-surface-border px-2 py-1.5 text-xs"
                placeholder="112"
              />
            </div>
            <div className="w-14 pb-1.5 text-right text-xs font-medium text-slate-600">
              {rowSubtotal(row) > 0 ? `${rowSubtotal(row)} cajas` : '—'}
            </div>
            <button
              type="button"
              onClick={() => removeRow(row.tempId)}
              className="mb-0.5 rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
              aria-label="Quitar línea"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => addRow()}
        className="mt-2 flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-800"
      >
        <Plus className="h-3.5 w-3.5" />
        Agregar línea de pallets
      </button>

      <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-amber-200/80 pt-3">
        <div className="w-28">
          <label className="mb-1 block text-[10px] font-medium text-slate-500">
            Cajas sueltas
          </label>
          <input
            type="number"
            min={0}
            step={1}
            value={unidadesSueltas}
            onChange={(e) => {
              setUnidadesManual(true)
              setUnidadesSueltas(e.target.value)
            }}
            className="w-full rounded-md border border-surface-border px-2 py-1.5 text-xs"
          />
        </div>
        {!unidadesManual && (
          <span className="pb-1.5 text-[10px] text-slate-500">Se calcula del resto</span>
        )}
        {unidadesManual && (
          <button
            type="button"
            onClick={() => {
              setUnidadesManual(false)
              recalcUnidades(rows)
            }}
            className="pb-1.5 text-[10px] font-medium text-brand-700 hover:underline"
          >
            Recalcular cajas
          </button>
        )}
      </div>

      <div className="mt-3 space-y-1 text-xs">
        <p className={diferencia === 0 ? 'text-emerald-700' : 'text-red-700'}>
          Asignado: {asignadoTotal} / {total} cajas
          {diferencia !== 0 &&
            (diferencia > 0
              ? ` (faltan ${diferencia} cajas)`
              : ` (sobran ${Math.abs(diferencia)} cajas)`)}
        </p>
        {previewPartes && (
          <p className="text-amber-900">
            Resultado: <span className="font-medium">{previewPartes}</span>
          </p>
        )}
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          className="h-8 px-2.5 text-xs"
          disabled={loading}
          onClick={onCancel}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          className="h-8 px-2.5 text-xs"
          disabled={!canConfirm}
          onClick={handleConfirm}
        >
          {loading ? 'Aplicando...' : 'Confirmar reorganización'}
        </Button>
      </div>
    </div>
  )
}
