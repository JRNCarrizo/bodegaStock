/**
 * API standalone (sin Electron) — para Railway / desarrollo cloud.
 *
 * Uso local:
 *   npm run start:api
 *
 * Variables:
 *   PORT              (default 3847; Railway lo inyecta)
 *   BODEGA_DATA_DIR   (default ./data) — imágenes (+ SQLite si no hay DATABASE_URL)
 *   JWT_SECRET        (recomendado en cloud)
 *   DATABASE_URL      (opcional) — Postgres; si está, no usa SQLite
 */
import { startServer } from './index'
import { getAppVersion, getUserDataDir } from './runtime-env'

async function main() {
  const port = Number(process.env.PORT) || 3847
  const host = process.env.HOST?.trim() || '0.0.0.0'
  const usingPg = Boolean(process.env.DATABASE_URL?.trim())

  console.log(`[ControlStock] API standalone v${getAppVersion()}`)
  console.log(`[ControlStock] DB: ${usingPg ? 'Postgres (DATABASE_URL)' : `SQLite en ${getUserDataDir()}`}`)
  if (!usingPg) console.log(`[ControlStock] Datos en: ${getUserDataDir()}`)

  await startServer({ host, port })
}

main().catch((err) => {
  console.error('[ControlStock] Error al iniciar API:', err)
  process.exit(1)
})
