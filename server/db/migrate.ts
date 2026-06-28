import type Database from 'better-sqlite3'
import { ensureSystemRoles } from './roles-seed'

function columnExists(db: Database.Database, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  return cols.some((c) => c.name === column)
}

function columnNotNull(db: Database.Database, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string; notnull: number }[]
  return cols.find((c) => c.name === column)?.notnull === 1
}

function tableExists(db: Database.Database, table: string): boolean {
  const row = db.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?
  `).get(table)
  return !!row
}

export function runMigrations(db: Database.Database): void {
  if (!columnExists(db, 'sectores', 'usa_ubicaciones')) {
    db.exec('ALTER TABLE sectores ADD COLUMN usa_ubicaciones INTEGER NOT NULL DEFAULT 0')
  }

  if (!tableExists(db, 'sector_ubicaciones')) {
    db.exec(`
      CREATE TABLE sector_ubicaciones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sector_id INTEGER NOT NULL REFERENCES sectores(id) ON DELETE CASCADE,
        codigo TEXT NOT NULL,
        nombre TEXT NOT NULL,
        orden INTEGER NOT NULL DEFAULT 0,
        activo INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(sector_id, codigo)
      )
    `)
  }

  if (!columnExists(db, 'stock_lineas', 'ubicacion_id')) {
    db.exec(`
      ALTER TABLE stock_lineas
      ADD COLUMN ubicacion_id INTEGER REFERENCES sector_ubicaciones(id) ON DELETE SET NULL
    `)
  }

  if (tableExists(db, 'camioneros')) {
    if (!columnExists(db, 'camioneros', 'numero_interno')) {
      db.exec('ALTER TABLE camioneros ADD COLUMN numero_interno TEXT')
    }
    if (!columnExists(db, 'camioneros', 'empresa')) {
      db.exec('ALTER TABLE camioneros ADD COLUMN empresa TEXT')
    }
    if (columnExists(db, 'camioneros', 'codigo')) {
      db.exec(`
        UPDATE camioneros
        SET numero_interno = codigo
        WHERE (numero_interno IS NULL OR TRIM(numero_interno) = '')
          AND codigo IS NOT NULL AND TRIM(codigo) != ''
      `)
    }
    db.exec(`
      UPDATE camioneros
      SET numero_interno = 'CAM-' || id
      WHERE numero_interno IS NULL OR TRIM(numero_interno) = ''
    `)
    db.exec(`
      UPDATE camioneros SET empresa = '' WHERE empresa IS NULL
    `)
  }

  if (!tableExists(db, 'camionero_vehiculos')) {
    db.exec(`
      CREATE TABLE camionero_vehiculos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        camionero_id INTEGER NOT NULL REFERENCES camioneros(id) ON DELETE CASCADE,
        marca TEXT NOT NULL,
        modelo TEXT NOT NULL,
        patente TEXT NOT NULL UNIQUE,
        activo INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
  }

  if (!tableExists(db, 'ingresos')) {
    db.exec(`
      CREATE TABLE ingresos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha TEXT NOT NULL,
        numero_remito TEXT NOT NULL,
        observacion TEXT,
        sector_id INTEGER NOT NULL REFERENCES sectores(id),
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
  }

  if (!tableExists(db, 'ingreso_lineas')) {
    db.exec(`
      CREATE TABLE ingreso_lineas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ingreso_id INTEGER NOT NULL REFERENCES ingresos(id) ON DELETE CASCADE,
        producto_id INTEGER NOT NULL REFERENCES productos(id),
        sector_id INTEGER NOT NULL REFERENCES sectores(id),
        ubicacion_id INTEGER REFERENCES sector_ubicaciones(id) ON DELETE SET NULL,
        tipo_bulto TEXT NOT NULL CHECK (tipo_bulto IN ('PALLET', 'CAJA', 'SUELTO')),
        cantidad_bultos INTEGER,
        unidades_por_bulto INTEGER,
        cantidad_suelta REAL,
        total_unidades REAL NOT NULL,
        orden INTEGER NOT NULL DEFAULT 0
      )
    `)
  }

  if (!tableExists(db, 'movimientos')) {
    db.exec(`
      CREATE TABLE movimientos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo TEXT NOT NULL,
        producto_id INTEGER NOT NULL REFERENCES productos(id),
        cantidad REAL NOT NULL,
        sector_origen_id INTEGER REFERENCES sectores(id),
        sector_destino_id INTEGER REFERENCES sectores(id),
        documento_tipo TEXT NOT NULL,
        documento_id INTEGER NOT NULL,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
        camionero_id INTEGER REFERENCES camioneros(id),
        observacion TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
  }

  if (!tableExists(db, 'planillas')) {
    db.exec(`
      CREATE TABLE planillas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha TEXT NOT NULL,
        numero TEXT NOT NULL,
        observacion TEXT,
        camionero_id INTEGER NOT NULL REFERENCES camioneros(id),
        vehiculo_id INTEGER REFERENCES camionero_vehiculos(id),
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
  }

  if (!tableExists(db, 'planilla_lineas')) {
    db.exec(`
      CREATE TABLE planilla_lineas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        planilla_id INTEGER NOT NULL REFERENCES planillas(id) ON DELETE CASCADE,
        producto_id INTEGER NOT NULL REFERENCES productos(id),
        tipo_bulto TEXT NOT NULL CHECK (tipo_bulto IN ('PALLET', 'CAJA', 'SUELTO')),
        cantidad_bultos INTEGER,
        unidades_por_bulto INTEGER,
        cantidad_suelta REAL,
        total_unidades REAL NOT NULL,
        orden INTEGER NOT NULL DEFAULT 0
      )
    `)
  }

  if (!tableExists(db, 'planilla_descuentos')) {
    db.exec(`
      CREATE TABLE planilla_descuentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        planilla_id INTEGER NOT NULL REFERENCES planillas(id) ON DELETE CASCADE,
        planilla_linea_id INTEGER NOT NULL REFERENCES planilla_lineas(id) ON DELETE CASCADE,
        producto_id INTEGER NOT NULL REFERENCES productos(id),
        sector_id INTEGER NOT NULL REFERENCES sectores(id),
        stock_linea_id INTEGER REFERENCES stock_lineas(id) ON DELETE SET NULL,
        unidades REAL NOT NULL,
        etiqueta TEXT
      )
    `)
  }

  if (!tableExists(db, 'retornos')) {
    db.exec(`
      CREATE TABLE retornos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha TEXT NOT NULL,
        numero_planilla TEXT,
        observacion TEXT,
        camionero_id INTEGER REFERENCES camioneros(id),
        vehiculo_id INTEGER REFERENCES camionero_vehiculos(id),
        sector_id INTEGER REFERENCES sectores(id),
        estado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'VERIFICADO')),
        cargado_por_id INTEGER NOT NULL REFERENCES usuarios(id),
        verificado_por_id INTEGER REFERENCES usuarios(id),
        observacion_verificacion TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        verificado_at TEXT
      )
    `)
  }

  if (!tableExists(db, 'retorno_lineas')) {
    db.exec(`
      CREATE TABLE retorno_lineas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        retorno_id INTEGER NOT NULL REFERENCES retornos(id) ON DELETE CASCADE,
        producto_id INTEGER NOT NULL REFERENCES productos(id),
        sector_id INTEGER REFERENCES sectores(id),
        tipo_bulto TEXT NOT NULL DEFAULT 'CAJA' CHECK (tipo_bulto IN ('PALLET', 'CAJA', 'SUELTO')),
        cantidad_bultos INTEGER,
        unidades_por_bulto INTEGER,
        cantidad_suelta REAL,
        total_unidades REAL NOT NULL,
        estado_condicion TEXT NOT NULL CHECK (estado_condicion IN ('BUEN_ESTADO', 'INCOMPLETA', 'MAL_ESTADO')),
        linea_verificada INTEGER NOT NULL DEFAULT 0,
        cantidad_verificada REAL,
        estado_verificado TEXT CHECK (estado_verificado IN ('BUEN_ESTADO', 'INCOMPLETA', 'MAL_ESTADO')),
        orden INTEGER NOT NULL DEFAULT 0
      )
    `)
  }

  if (tableExists(db, 'retorno_lineas') && !columnExists(db, 'retorno_lineas', 'sector_id')) {
    db.exec(`
      ALTER TABLE retorno_lineas
      ADD COLUMN sector_id INTEGER REFERENCES sectores(id)
    `)
    db.exec(`
      UPDATE retorno_lineas
      SET sector_id = (
        SELECT sector_id FROM retornos WHERE retornos.id = retorno_lineas.retorno_id
      )
      WHERE sector_id IS NULL
    `)
  }

  if (
    tableExists(db, 'retornos') &&
    (columnNotNull(db, 'retornos', 'sector_id') || columnNotNull(db, 'retornos', 'camionero_id'))
  ) {
    db.exec(`
      CREATE TABLE retornos_flexible (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha TEXT NOT NULL,
        numero_planilla TEXT,
        observacion TEXT,
        camionero_id INTEGER REFERENCES camioneros(id),
        vehiculo_id INTEGER REFERENCES camionero_vehiculos(id),
        sector_id INTEGER REFERENCES sectores(id),
        estado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'VERIFICADO')),
        cargado_por_id INTEGER NOT NULL REFERENCES usuarios(id),
        verificado_por_id INTEGER REFERENCES usuarios(id),
        observacion_verificacion TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        verificado_at TEXT
      )
    `)
    db.exec(`
      INSERT INTO retornos_flexible (
        id, fecha, numero_planilla, observacion, camionero_id, vehiculo_id, sector_id,
        estado, cargado_por_id, verificado_por_id, observacion_verificacion, created_at, verificado_at
      )
      SELECT
        id, fecha, numero_planilla, observacion, camionero_id, vehiculo_id, sector_id,
        estado, cargado_por_id, verificado_por_id, observacion_verificacion, created_at, verificado_at
      FROM retornos
    `)
    db.exec('DROP TABLE retornos')
    db.exec('ALTER TABLE retornos_flexible RENAME TO retornos')
  }

  if (!tableExists(db, 'roturas')) {
    db.exec(`
      CREATE TABLE roturas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha TEXT NOT NULL,
        observacion TEXT,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
  }

  if (!tableExists(db, 'rotura_lineas')) {
    db.exec(`
      CREATE TABLE rotura_lineas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rotura_id INTEGER NOT NULL REFERENCES roturas(id) ON DELETE CASCADE,
        producto_id INTEGER NOT NULL REFERENCES productos(id),
        sector_id INTEGER NOT NULL REFERENCES sectores(id),
        cantidad_cajas REAL NOT NULL,
        orden INTEGER NOT NULL DEFAULT 0
      )
    `)
  }

  if (!tableExists(db, 'rotura_descuentos')) {
    db.exec(`
      CREATE TABLE rotura_descuentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rotura_id INTEGER NOT NULL REFERENCES roturas(id) ON DELETE CASCADE,
        rotura_linea_id INTEGER NOT NULL REFERENCES rotura_lineas(id) ON DELETE CASCADE,
        producto_id INTEGER NOT NULL REFERENCES productos(id),
        sector_id INTEGER NOT NULL REFERENCES sectores(id),
        stock_linea_id INTEGER REFERENCES stock_lineas(id) ON DELETE SET NULL,
        unidades REAL NOT NULL,
        etiqueta TEXT
      )
    `)
  }

  ensureSystemRoles(db)
}
