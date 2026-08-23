import type Database from 'better-sqlite3'

export function isPostgresDb(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim())
}

export function columnExists(db: Database.Database, table: string, column: string): boolean {
  if (isPostgresDb()) {
    const row = db
      .prepare(
        `SELECT 1 AS ok FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = ? AND column_name = ?`
      )
      .get(table, column) as { ok: number } | undefined
    return Boolean(row)
  }
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  return cols.some((c) => c.name === column)
}

export function columnNotNull(db: Database.Database, table: string, column: string): boolean {
  if (isPostgresDb()) {
    const row = db
      .prepare(
        `SELECT is_nullable FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = ? AND column_name = ?`
      )
      .get(table, column) as { is_nullable: string } | undefined
    return row?.is_nullable === 'NO'
  }
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string; notnull: number }[]
  return cols.find((c) => c.name === column)?.notnull === 1
}

export function tableExists(db: Database.Database, table: string): boolean {
  if (isPostgresDb()) {
    const row = db
      .prepare(
        `SELECT 1 AS ok FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = ?`
      )
      .get(table) as { ok: number } | undefined
    return Boolean(row)
  }
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(table)
  return !!row
}
