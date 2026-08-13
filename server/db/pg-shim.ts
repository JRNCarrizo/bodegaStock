/**
 * Shim sync compatible con better-sqlite3 usando Postgres + synckit.
 * Solo para modo cloud (DATABASE_URL). Electron sigue con better-sqlite3.
 */
import { createRequire } from 'module'
import { createSyncFn } from 'synckit'
import { translateSqliteSql } from './sql-dialect'

const require = createRequire(import.meta.url)
const callPg = createSyncFn(require.resolve('./pg-worker.cjs')) as (msg: Record<string, unknown>) => {
  rows?: Record<string, unknown>[]
  rowCount?: number
  ok?: boolean
}

export type PgRunResult = { changes: number; lastInsertRowid: number | bigint }

class PgStatement {
  constructor(private readonly sql: string) {}

  private exec(params: unknown[]) {
    const text = translateSqliteSql(this.sql)
    return callPg({ op: 'query', sql: text, params })
  }

  get(...params: unknown[]): unknown {
    const { rows } = this.exec(params)
    return rows?.[0]
  }

  all(...params: unknown[]): unknown[] {
    const { rows } = this.exec(params)
    return rows ?? []
  }

  run(...params: unknown[]): PgRunResult {
    const { rows, rowCount } = this.exec(params)
    const first = rows?.[0]
    const id = first && typeof first === 'object' && 'id' in first ? Number((first as { id: unknown }).id) : 0
    return {
      changes: rowCount ?? 0,
      lastInsertRowid: Number.isFinite(id) ? id : 0,
    }
  }
}

export class PgDatabase {
  prepare(sql: string): PgStatement {
    return new PgStatement(sql)
  }

  exec(sql: string): this {
    // better-sqlite3 acepta varios statements; pg también en query simple
    callPg({ op: 'exec', sql: translateSqliteSqlForExec(sql) })
    return this
  }

  pragma(_source: string, _options?: unknown): unknown {
    return undefined
  }

  transaction<T>(fn: (...args: unknown[]) => T): (...args: unknown[]) => T {
    return (...args: unknown[]) => {
      callPg({ op: 'begin' })
      try {
        const result = fn(...args)
        callPg({ op: 'commit' })
        return result
      } catch (err) {
        try {
          callPg({ op: 'rollback' })
        } catch {
          /* ignore */
        }
        throw err
      }
    }
  }

  close(): void {
    callPg({ op: 'close' })
  }
}

/** exec() puede traer varios CREATE; no reescribir ? ni RETURNING por statement suelto. */
function translateSqliteSqlForExec(sql: string): string {
  return sql
    .replace(/datetime\('now'\)/gi, "to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')")
    .replace(/\s+COLLATE\s+NOCASE/gi, '')
}

export function openPgDatabase(databaseUrl: string, schemaSql: string): PgDatabase {
  callPg({ op: 'init', databaseUrl })
  callPg({ op: 'exec', sql: schemaSql })
  return new PgDatabase()
}
