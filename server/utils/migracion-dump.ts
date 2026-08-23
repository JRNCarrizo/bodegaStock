import type Database from 'better-sqlite3'
import { MIGRATION_TABLES, type MigrationDump, type MigrationTableName } from '../db/migration-tables'
import { isPostgresMode } from '../db'
import { ensureLogisticasSeed } from './logisticas'

function tableExists(db: Database.Database, name: string): boolean {
  if (isPostgresMode()) {
    const row = db
      .prepare(
        `SELECT 1 AS ok FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ?`
      )
      .get(name) as { ok: number } | undefined
    return Boolean(row)
  }
  const row = db
    .prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(name) as { ok: number } | undefined
  return Boolean(row)
}

export function exportSqliteFileDump(db: Database.Database): MigrationDump {
  const tables: MigrationDump['tables'] = {}
  for (const name of MIGRATION_TABLES) {
    const exists = db
      .prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?`)
      .get(name) as { ok: number } | undefined
    if (!exists) {
      tables[name] = []
      continue
    }
    tables[name] = db.prepare(`SELECT * FROM ${name}`).all() as Record<string, unknown>[]
  }
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    tables,
  }
}

export function exportDatabaseDump(db: Database.Database): MigrationDump {
  if (!isPostgresMode()) return exportSqliteFileDump(db)

  const tables: MigrationDump['tables'] = {}
  for (const name of MIGRATION_TABLES) {
    if (!tableExists(db, name)) {
      tables[name] = []
      continue
    }
    tables[name] = db.prepare(`SELECT * FROM ${name}`).all() as Record<string, unknown>[]
  }
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    tables,
  }
}

export function summarizeDump(dump: MigrationDump): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const name of MIGRATION_TABLES) {
    counts[name] = dump.tables[name]?.length ?? 0
  }
  return counts
}

/** Reemplaza el contenido de las tablas migrables con el dump (transacción). */
export function importDatabaseDump(db: Database.Database, dump: MigrationDump): { imported: Record<string, number> } {
  if (dump.version !== 1 || !dump.tables || typeof dump.tables !== 'object') {
    throw new Error('Dump inválido: se espera version 1 con tables')
  }

  const imported: Record<string, number> = {}
  const deleteOrder = [...MIGRATION_TABLES].reverse()

  const run = db.transaction(() => {
    for (const name of deleteOrder) {
      if (!tableExists(db, name)) continue
      db.prepare(`DELETE FROM ${name}`).run()
    }

    for (const name of MIGRATION_TABLES) {
      const rows = dump.tables[name as MigrationTableName]
      if (name === 'logisticas' && !rows?.length) {
        ensureLogisticasSeed(db)
        imported[name] = (
          db.prepare('SELECT COUNT(*) AS n FROM logisticas').get() as { n: number }
        ).n
        continue
      }
      if (!rows?.length) {
        imported[name] = 0
        continue
      }
      if (!tableExists(db, name)) {
        throw new Error(`Falta la tabla ${name} en el destino`)
      }

      const cols = Object.keys(rows[0])
      if (!cols.length) {
        imported[name] = 0
        continue
      }

      const colList = cols.map((c) => `"${c}"`).join(', ')
      const placeholders = cols.map(() => '?').join(', ')
      const sql = `INSERT INTO ${name} (${colList}) VALUES (${placeholders})`
      const stmt = db.prepare(sql)
      for (const row of rows) {
        stmt.run(...cols.map((c) => row[c] ?? null))
      }
      imported[name] = rows.length
    }

    if (isPostgresMode()) {
      for (const name of MIGRATION_TABLES) {
        if (!tableExists(db, name)) continue
        const hasId = db
          .prepare(
            `SELECT 1 AS ok FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = ? AND column_name = 'id'`
          )
          .get(name) as { ok: number } | undefined
        if (!hasId) continue
        db.prepare(
          `SELECT setval(
             pg_get_serial_sequence('${name}', 'id'),
             COALESCE((SELECT MAX(id) FROM ${name}), 1),
             true
           )`
        ).get()
      }
    }
  })

  run()
  return { imported }
}
