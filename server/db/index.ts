import bcrypt from 'bcryptjs'
import Database from 'better-sqlite3'
import { createRequire } from 'module'
import { existsSync, mkdirSync, rmSync, unlinkSync } from 'fs'
import { join } from 'path'
import { SCHEMA_SQL } from './schema'
import { runMigrations } from './migrate'
import { ensureSystemRoles } from './roles-seed'
import { getUserDataDir } from '../runtime-env'
import { recalcStockTotalsEnCajas, syncAllUnidadesPorCajaDefaultsFromStock, normalizeCajaStockLineaTotales } from '../utils/stock'
import { sqliteSchemaToPostgres } from './sql-dialect'

const require = createRequire(import.meta.url)

let db: Database.Database | null = null
let usingPostgres = false

export function isPostgresMode(): boolean {
  return usingPostgres
}

export function getDbPath(): string {
  const userData = getUserDataDir()
  const dbDir = join(userData, 'data')
  if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true })
  return join(dbDir, 'bodegastock.db')
}

export function initDatabase(): Database.Database {
  if (db) return db

  const databaseUrl = process.env.DATABASE_URL?.trim()
  if (databaseUrl) {
    const { openPgDatabase } = require('./pg-shim') as typeof import('./pg-shim')
    db = openPgDatabase(databaseUrl, sqliteSchemaToPostgres(SCHEMA_SQL)) as unknown as Database.Database
    usingPostgres = true
    seedIfEmpty(db)
    recalcStockTotalsEnCajas(db)
    syncAllUnidadesPorCajaDefaultsFromStock(db)
    normalizeCajaStockLineaTotales(db)
    return db
  }

  db = new Database(getDbPath())
  usingPostgres = false
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(SCHEMA_SQL)
  runMigrations(db)
  seedIfEmpty(db)

  recalcStockTotalsEnCajas(db)
  syncAllUnidadesPorCajaDefaultsFromStock(db)
  normalizeCajaStockLineaTotales(db)

  return db
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized')
  return db
}

export function closeDatabase(): void {
  if (!db) return
  try {
    db.close()
  } catch {
    // ignore close errors before wipe
  }
  db = null
  usingPostgres = false
}

/** Borra el archivo SQLite (y WAL) e imágenes de productos. Conserva network-config.json. */
export function wipeDatabaseFiles(): void {
  if (usingPostgres || process.env.DATABASE_URL?.trim()) {
    throw new Error('wipeDatabaseFiles no aplica en modo Postgres')
  }

  const dbPath = getDbPath()
  for (const path of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    if (existsSync(path)) unlinkSync(path)
  }

  const imagesDir = join(getUserDataDir(), 'images', 'productos')
  if (existsSync(imagesDir)) {
    rmSync(imagesDir, { recursive: true, force: true })
  }
}

function seedIfEmpty(database: Database.Database): void {
  ensureSystemRoles(database)

  const count = database.prepare('SELECT COUNT(*) as c FROM usuarios').get() as { c: number }
  if (count.c > 0) return

  const adminHash = bcrypt.hashSync('admin123', 10)
  const rol = database.prepare('SELECT id FROM roles WHERE nombre = ?').get('Administrador') as { id: number }

  database.prepare(`
    INSERT INTO usuarios (username, password_hash, nombre, rol_id, activo)
    VALUES (?, ?, ?, ?, 1)
  `).run('admin', adminHash, 'Administrador', rol.id)
}
