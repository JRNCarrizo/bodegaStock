import type { getDb } from '../db'

type Db = ReturnType<typeof getDb>

export function normalizeNumeroDocumento(value: string): string {
  return value.trim()
}

function findDuplicado(
  db: Db,
  sql: string,
  params: (string | number)[]
): { id: number } | undefined {
  return db.prepare(sql).get(...params) as { id: number } | undefined
}

export function isPlanillaNumeroDisponible(
  db: Db,
  logisticaId: number,
  numero: string,
  excludeId?: number
): boolean {
  const n = normalizeNumeroDocumento(numero)
  if (!n) return true

  return !findDuplicado(
    db,
    `
      SELECT id FROM planillas
      WHERE logistica_id = ?
        AND UPPER(TRIM(numero)) = UPPER(?)
        ${excludeId ? 'AND id != ?' : ''}
      LIMIT 1
    `,
    excludeId ? [logisticaId, n, excludeId] : [logisticaId, n]
  )
}

export function assertPlanillaNumeroDisponible(
  db: Db,
  logisticaId: number,
  numero: string,
  excludeId?: number
): void {
  if (!isPlanillaNumeroDisponible(db, logisticaId, numero, excludeId)) {
    throw new Error('Ya existe una planilla con ese número')
  }
}

export function isRetornoPlanillaDisponible(
  db: Db,
  logisticaId: number,
  numeroPlanilla: string | null | undefined,
  excludeId?: number
): boolean {
  const n = normalizeNumeroDocumento(numeroPlanilla ?? '')
  if (!n) return true

  return !findDuplicado(
    db,
    `
      SELECT id FROM retornos
      WHERE logistica_id = ?
        AND numero_planilla IS NOT NULL
        AND TRIM(numero_planilla) != ''
        AND UPPER(TRIM(numero_planilla)) = UPPER(?)
        ${excludeId ? 'AND id != ?' : ''}
      LIMIT 1
    `,
    excludeId ? [logisticaId, n, excludeId] : [logisticaId, n]
  )
}

export function assertRetornoPlanillaDisponible(
  db: Db,
  logisticaId: number,
  numeroPlanilla: string | null | undefined,
  excludeId?: number
): void {
  if (!isRetornoPlanillaDisponible(db, logisticaId, numeroPlanilla, excludeId)) {
    throw new Error('Ya existe un retorno con ese número de planilla')
  }
}

export function isIngresoRemitoDisponible(
  db: Db,
  logisticaId: number,
  numeroRemito: string,
  excludeId?: number
): boolean {
  const n = normalizeNumeroDocumento(numeroRemito)
  if (!n) return true

  return !findDuplicado(
    db,
    `
      SELECT id FROM ingresos
      WHERE logistica_id = ?
        AND UPPER(TRIM(numero_remito)) = UPPER(?)
        ${excludeId ? 'AND id != ?' : ''}
      LIMIT 1
    `,
    excludeId ? [logisticaId, n, excludeId] : [logisticaId, n]
  )
}

export function assertIngresoRemitoDisponible(
  db: Db,
  logisticaId: number,
  numeroRemito: string,
  excludeId?: number
): void {
  if (!isIngresoRemitoDisponible(db, logisticaId, numeroRemito, excludeId)) {
    throw new Error('Ya existe un ingreso con ese número de remito')
  }
}
