import type Database from 'better-sqlite3'

const KEY_RETORNOS_DOBLE_VERIFICACION = 'retornos_doble_verificacion'
const KEY_MOVIMIENTOS_DOBLE_VERIFICACION = 'movimientos_doble_verificacion'

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
