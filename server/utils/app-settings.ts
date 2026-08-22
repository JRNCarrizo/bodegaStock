import type Database from 'better-sqlite3'

const KEY_RETORNOS_DOBLE_VERIFICACION = 'retornos_doble_verificacion'
const KEY_MOVIMIENTOS_DOBLE_VERIFICACION = 'movimientos_doble_verificacion'
/** Días no laborables de la agenda (índices Lun=0 … Dom=6). Default: sábado y domingo. */
const KEY_AGENDA_DIAS_INHABILES = 'agenda_turnos_dias_inhabiles'
const DEFAULT_AGENDA_DIAS_INHABILES = [5, 6]

function getBoolSetting(db: Database.Database, clave: string, defaultValue: boolean): boolean {
  const row = db.prepare(`
    SELECT valor FROM app_settings WHERE clave = ?
  `).get(clave) as { valor: string } | undefined

  if (!row) return defaultValue
  return row.valor !== '0'
}

function setBoolSetting(db: Database.Database, clave: string, enabled: boolean): void {
  db.prepare(`
    INSERT INTO app_settings (clave, valor, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(clave) DO UPDATE SET
      valor = excluded.valor,
      updated_at = datetime('now')
  `).run(clave, enabled ? '1' : '0')
}

function setStringSetting(db: Database.Database, clave: string, valor: string): void {
  db.prepare(`
    INSERT INTO app_settings (clave, valor, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(clave) DO UPDATE SET
      valor = excluded.valor,
      updated_at = datetime('now')
  `).run(clave, valor)
}

/** Por defecto: doble verificación activa (comportamiento histórico). */
export function getRetornosDobleVerificacion(db: Database.Database): boolean {
  return getBoolSetting(db, KEY_RETORNOS_DOBLE_VERIFICACION, true)
}

export function setRetornosDobleVerificacion(db: Database.Database, enabled: boolean): void {
  setBoolSetting(db, KEY_RETORNOS_DOBLE_VERIFICACION, enabled)
}

/** Por defecto: doble verificación activa (comportamiento histórico). */
export function getMovimientosDobleVerificacion(db: Database.Database): boolean {
  return getBoolSetting(db, KEY_MOVIMIENTOS_DOBLE_VERIFICACION, true)
}

export function setMovimientosDobleVerificacion(db: Database.Database, enabled: boolean): void {
  setBoolSetting(db, KEY_MOVIMIENTOS_DOBLE_VERIFICACION, enabled)
}

export function getAgendaDiasInhabiles(db: Database.Database): number[] {
  const row = db.prepare(`
    SELECT valor FROM app_settings WHERE clave = ?
  `).get(KEY_AGENDA_DIAS_INHABILES) as { valor: string } | undefined
  if (!row?.valor) return [...DEFAULT_AGENDA_DIAS_INHABILES]
  try {
    const parsed = JSON.parse(row.valor) as unknown
    if (!Array.isArray(parsed)) return [...DEFAULT_AGENDA_DIAS_INHABILES]
    return parsed
      .map((n) => Number(n))
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
  } catch {
    return [...DEFAULT_AGENDA_DIAS_INHABILES]
  }
}

export function setAgendaDiasInhabiles(db: Database.Database, dias: number[]): void {
  const clean = [...new Set(
    dias.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
  )].sort((a, b) => a - b)
  setStringSetting(db, KEY_AGENDA_DIAS_INHABILES, JSON.stringify(clean))
}

/** `fecha` YYYY-MM-DD; índices Lun=0 … Dom=6. */
export function isAgendaDiaInhabil(db: Database.Database, fechaIso: string): boolean {
  const [y, m, d] = fechaIso.split('-').map(Number)
  if (!y || !m || !d) return false
  const date = new Date(y, m - 1, d)
  const mondayIndex = (date.getDay() + 6) % 7
  return getAgendaDiasInhabiles(db).includes(mondayIndex)
}
