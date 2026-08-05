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
  cantidad_bultos: string
  unidades_por_bulto: string
}

function newTempId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function emptyRow(): BultoRow {
  return {
    tempId: newTempId(),
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
  const sueltoOriginal = Number(info.total_suelto ?? 0)
  const capacidadInicial = Number(info.botellas_por_caja ?? 6)
  const totalInicial =
    info.total_unidades +
    Math.floor(sueltoOriginal / (capacidadInicial > 0 ? capacidadInicial : 6))
  const [botellasPorCaja, setBotellasPorCaja] = useState(String(capacidadInicial))
  const [rows, setRows] = useState<BultoRow[]>(() =>
    buildInitialRows({ ...info, total_unidades: totalInicial })
  )
  const [unidadesSueltas, setUnidadesSueltas] = useState(() =>
    String(
      calcRestoUnidades(
        totalInicial,
        buildInitialRows({ ...info, total_unidades: totalInicial })
      )
    )
  )
  const [unidadesManual, setUnidadesManual] = useState(false)

  const capacidadNum = Number(botellasPorCaja)
  const capacidadValida =
    Number.isInteger(capacidadNum) && capacidadNum > 0 ? capacidadNum : null
  const cajasArmadasDesdeSuelto = capacidadValida
    ? Math.floor(sueltoOriginal / capacidadValida)
    : 0
  const botellasRestantes = capacidadValida
    ? sueltoOriginal % capacidadValida
    : sueltoOriginal
  const total = info.total_unidades + cajasArmadasDesdeSuelto
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
            tipo_bulto: 'PALLET',
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

  function updateBotellasPorCaja(value: string) {
    setBotellasPorCaja(value)
    const capacidad = Number(value)
    if (!Number.isInteger(capacidad) || capacidad <= 0) return

    const nextTotal = info.total_unidades + Math.floor(sueltoOriginal / capacidad)
    const nextRows = buildInitialRows({ ...info, total_unidades: nextTotal })
    setRows(nextRows)
    setUnidadesSueltas(String(calcRestoUnidades(nextTotal, nextRows)))
    setUnidadesManual(false)
  }

  function updateRow(tempId: string, patch: Partial<BultoRow>) {
    const next = rows.map((r) => (r.tempId === tempId ? { ...r, ...patch } : r))
    setRows(next)
    if (!unidadesManual) recalcUnidades(next)
  }

  function addRow(ref?: ReferenciaBulto) {
    const palletRef = ref?.tipo_bulto === 'PALLET' ? ref : undefined
    const next = [
      ...rows,
      palletRef
        ? {
            tempId: newTempId(),
            cantidad_bultos: '',
            unidades_por_bulto: String(palletRef.unidades_por_bulto)
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
        tipo_bulto: 'PALLET' as const,
        cantidad_bultos: Number(row.cantidad_bultos),
        unidades_por_bulto: Number(row.unidades_por_bulto)
      }))
      .filter((b) => b.cantidad_bultos > 0 && b.unidades_por_bulto > 0)

    onConfirm({
      bultos,
      unidades_sueltas: Number.isFinite(unidadesNum) && unidadesNum >= 0 ? unidadesNum : 0,
      botellas_por_caja: capacidadNum
    })
  }

  const canConfirm =
    diferencia === 0 &&
    capacidadValida !== null &&
    (rows.some((r) => rowSubtotal(r) > 0) || unidadesNum > 0) &&
    !loading

  return (
    <div className="mt-2 rounded-md border border-amber-200 bg-amber-50/80 p-3">
      <p className="text-xs font-semibold text-amber-950">
        Reorganizar {titulo} — total fijo: {total} cajas
      </p>
      <p className="mt-1 text-[11px] text-amber-900/80">
        Se agrupan las unidades sueltas, se arman cajas completas y solo queda visible el remanente.
      </p>

      {sueltoOriginal > 0 && (
        <div className="mt-3 rounded-md border border-amber-200/80 bg-white p-2">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-32">
              <label className="mb-1 block text-[10px] font-medium text-slate-500">
                Unidades por caja
              </label>
              <input
                type="number"
                min={1}
                step={1}
                value={botellasPorCaja}
                onChange={(e) => updateBotellasPorCaja(e.target.value)}
                className="w-full rounded-md border border-surface-border px-2 py-1.5 text-xs"
              />
            </div>
            {capacidadValida && (
              <p className="pb-1 text-[11px] text-slate-600">
                {sueltoOriginal} sueltas → {cajasArmadasDesdeSuelto}{' '}
                {cajasArmadasDesdeSuelto === 1 ? 'caja nueva' : 'cajas nuevas'}
                {botellasRestantes > 0 ? ` + ${botellasRestantes} sueltas` : ''}
              </p>
            )}
          </div>
          {!capacidadValida && (
            <p className="mt-1 text-[10px] text-red-600">
              Indicá una cantidad entera mayor a cero.
            </p>
          )}
        </div>
      )}

      {info.referencias_bulto.some((ref) => ref.tipo_bulto === 'PALLET') && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="self-center text-[10px] font-medium uppercase tracking-wide text-amber-800/70">
            Referencias:
          </span>
          {info.referencias_bulto
            .filter((ref) => ref.tipo_bulto === 'PALLET')
            .map((ref) => (
              <button
                key={`${ref.tipo_bulto}-${ref.unidades_por_bulto}`}
                type="button"
                className="rounded-full border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-medium text-amber-900 hover:bg-amber-100"
                onClick={() => addRow(ref)}
              >
                + Pallet × {ref.unidades_por_bulto}
              </button>
            ))}
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
            <div className="w-16">
              <label className="mb-1 block text-[10px] font-medium text-slate-500">
                Pallets #{idx + 1}
              </label>
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
