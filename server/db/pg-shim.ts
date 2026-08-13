/**
 * Shim sync compatible con better-sqlite3 usando Postgres + worker_threads.
 * Solo para modo cloud (DATABASE_URL). Electron sigue con better-sqlite3.
 */
import { createRequire } from 'module'
import {
  Worker,
  MessageChannel,
  receiveMessageOnPort,
  type MessagePort,
} from 'worker_threads'
import { translateSqliteSql } from './sql-dialect'

const require = createRequire(import.meta.url)
const workerPath = require.resolve('./pg-worker.cjs')

type WorkerResult = {
  rows?: Record<string, unknown>[]
  rowCount?: number
  ok?: boolean
}

type WorkerReply = {
  ok: boolean
  result?: WorkerResult
  error?: string
}

let worker: Worker | null = null
let port: MessagePort | null = null
let signal: Int32Array | null = null

function ensureWorker(): void {
  if (worker && port && signal) return

  const channel = new MessageChannel()
  const sharedBuffer = new SharedArrayBuffer(4)
  signal = new Int32Array(sharedBuffer)
  port = channel.port1

  worker = new Worker(workerPath, {
    workerData: { port: channel.port2, sharedBuffer },
    transferList: [channel.port2],
  })

  worker.on('error', (err) => {
    console.error('[ControlStock] Postgres worker error:', err)
  })
  worker.on('exit', (code) => {
    if (code !== 0) console.error(`[ControlStock] Postgres worker exit ${code}`)
    worker = null
    port = null
    signal = null
  })
}

function callPg(msg: Record<string, unknown>): WorkerResult {
  ensureWorker()
  if (!port || !signal) throw new Error('Postgres worker not ready')

  Atomics.store(signal, 0, 0)
  port.postMessage(msg)

  const wait = Atomics.wait(signal, 0, 0, 60_000)
  if (wait === 'timed-out') {
    throw new Error('Timeout esperando Postgres worker')
  }

  const reply = receiveMessageOnPort(port)?.message as WorkerReply | undefined
  if (!reply) throw new Error('Sin respuesta del Postgres worker')
  if (!reply.ok) throw new Error(reply.error || 'Error Postgres worker')
  return reply.result ?? { ok: true }
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
    try {
      callPg({ op: 'close' })
    } catch {
      /* ignore */
    }
    if (worker) {
      void worker.terminate()
      worker = null
      port = null
      signal = null
    }
  }
}

function translateSqliteSqlForExec(sql: string): string {
  return sql
    .replace(/datetime\('now'\)/gi, "to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')")
    .replace(/\s+COLLATE\s+NOCASE/gi, '')
}

export function openPgDatabase(databaseUrl: string, schemaSql: string): PgDatabase {
  console.log('[ControlStock] Conectando a Postgres...')
  callPg({ op: 'init', databaseUrl })
  console.log('[ControlStock] Aplicando schema Postgres...')
  const statements = schemaSql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('/*'))
  for (const statement of statements) {
    callPg({ op: 'exec', sql: statement })
  }
  console.log('[ControlStock] Postgres listo')
  return new PgDatabase()
}
