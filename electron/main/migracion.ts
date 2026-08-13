import { ipcMain } from 'electron'
import Database from 'better-sqlite3'
import { existsSync } from 'fs'
import { getDbPath } from '../../server/db'
import { exportSqliteFileDump, summarizeDump } from '../../server/utils/migracion-dump'

export function setupMigracionIpc(): void {
  ipcMain.handle('migracion:export-local', () => {
    const dbPath = getDbPath()
    if (!existsSync(dbPath)) {
      return { ok: false as const, message: `No se encontró la base local: ${dbPath}` }
    }

    let db: Database.Database | null = null
    try {
      db = new Database(dbPath, { fileMustExist: true })
      const dump = exportSqliteFileDump(db)
      return {
        ok: true as const,
        dump,
        counts: summarizeDump(dump),
        dbPath,
      }
    } catch (err) {
      return {
        ok: false as const,
        message: err instanceof Error ? err.message : 'No se pudo leer la base local',
      }
    } finally {
      try {
        db?.close()
      } catch {
        /* ignore */
      }
    }
  })
}
