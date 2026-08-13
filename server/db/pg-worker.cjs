'use strict'

const { Pool, types } = require('pg')

// COUNT(*) / BIGINT → number (SQLite devuelve number)
types.setTypeParser(types.builtins.INT8, (v) => parseInt(v, 10))
types.setTypeParser(types.builtins.NUMERIC, (v) => parseFloat(v))

/** @type {import('pg').Pool | null} */
let pool = null
/** @type {import('pg').PoolClient | null} */
let txClient = null
let txDepth = 0

function q(sql, params) {
  const client = txClient || pool
  if (!client) throw new Error('Postgres pool not initialized')
  return client.query(sql, params ?? [])
}

/**
 * @param {{ op: string, sql?: string, params?: unknown[], schemaSql?: string, databaseUrl?: string }} msg
 */
module.exports = async function pgWorker(msg) {
  switch (msg.op) {
    case 'init': {
      if (pool) return { ok: true }
      pool = new Pool({
        connectionString: msg.databaseUrl,
        max: 10,
        idleTimeoutMillis: 30_000,
      })
      await pool.query('SELECT 1')
      return { ok: true }
    }
    case 'exec': {
      await q(msg.sql)
      return { ok: true }
    }
    case 'query': {
      const result = await q(msg.sql, msg.params)
      return {
        rows: result.rows,
        rowCount: result.rowCount ?? 0,
      }
    }
    case 'begin': {
      if (!pool) throw new Error('Postgres pool not initialized')
      if (txDepth === 0) {
        txClient = await pool.connect()
        await txClient.query('BEGIN')
      } else {
        await txClient.query(`SAVEPOINT sp_${txDepth}`)
      }
      txDepth += 1
      return { ok: true }
    }
    case 'commit': {
      if (!txClient || txDepth === 0) throw new Error('No active transaction')
      txDepth -= 1
      if (txDepth === 0) {
        await txClient.query('COMMIT')
        txClient.release()
        txClient = null
      } else {
        await txClient.query(`RELEASE SAVEPOINT sp_${txDepth}`)
      }
      return { ok: true }
    }
    case 'rollback': {
      if (!txClient || txDepth === 0) throw new Error('No active transaction')
      txDepth -= 1
      if (txDepth === 0) {
        await txClient.query('ROLLBACK')
        txClient.release()
        txClient = null
      } else {
        await txClient.query(`ROLLBACK TO SAVEPOINT sp_${txDepth}`)
      }
      return { ok: true }
    }
    case 'close': {
      if (txClient) {
        try {
          await txClient.query('ROLLBACK')
        } catch {
          /* ignore */
        }
        txClient.release()
        txClient = null
        txDepth = 0
      }
      if (pool) {
        await pool.end()
        pool = null
      }
      return { ok: true }
    }
    default:
      throw new Error(`Unknown pg worker op: ${msg.op}`)
  }
}
