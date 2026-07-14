import type Database from 'better-sqlite3'
import { ensureSystemRoles } from './roles-seed'
import { migrateLegacyUsersToSecciones } from '../utils/secciones'
import { recalcStockTotalsEnCajas } from '../utils/stock'

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
        modo_salida TEXT NOT NULL DEFAULT 'CAJA' CHECK (modo_salida IN ('CAJA', 'BOTELLA')),
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

  if (!tableExists(db, 'movimientos_internos')) {
    db.exec(`
      CREATE TABLE movimientos_internos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha TEXT NOT NULL,
        tipo TEXT NOT NULL CHECK (tipo IN ('ENVIAR', 'RECIBIR')),
        sector_origen_id INTEGER REFERENCES sectores(id),
        sector_destino_id INTEGER REFERENCES sectores(id),
        observacion TEXT,
        estado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'COMPLETADO', 'CANCELADO')),
        creado_por_id INTEGER NOT NULL REFERENCES usuarios(id),
        recibido_por_id INTEGER REFERENCES usuarios(id),
        cancelado_por_id INTEGER REFERENCES usuarios(id),
        recibido_at TEXT,
        cancelado_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
  }

  if (!tableExists(db, 'movimiento_interno_lineas')) {
    db.exec(`
      CREATE TABLE movimiento_interno_lineas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        movimiento_interno_id INTEGER NOT NULL REFERENCES movimientos_internos(id) ON DELETE CASCADE,
        producto_id INTEGER NOT NULL REFERENCES productos(id),
        sector_origen_id INTEGER NOT NULL REFERENCES sectores(id),
        sector_destino_id INTEGER NOT NULL REFERENCES sectores(id),
        cantidad_cajas REAL NOT NULL,
        cancelada INTEGER NOT NULL DEFAULT 0,
        orden INTEGER NOT NULL DEFAULT 0
      )
    `)
  }

  if (!tableExists(db, 'movimiento_interno_descuentos')) {
    db.exec(`
      CREATE TABLE movimiento_interno_descuentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        movimiento_interno_id INTEGER NOT NULL REFERENCES movimientos_internos(id) ON DELETE CASCADE,
        movimiento_interno_linea_id INTEGER NOT NULL REFERENCES movimiento_interno_lineas(id) ON DELETE CASCADE,
        producto_id INTEGER NOT NULL REFERENCES productos(id),
        sector_id INTEGER NOT NULL REFERENCES sectores(id),
        stock_linea_id INTEGER REFERENCES stock_lineas(id) ON DELETE SET NULL,
        unidades REAL NOT NULL,
        etiqueta TEXT
      )
    `)
  }

  db.exec(`
    UPDATE movimientos_internos SET estado = 'PENDIENTE' WHERE estado = 'EN_TRANSITO'
  `)

  if (tableExists(db, 'movimiento_interno_lineas') && !columnExists(db, 'movimiento_interno_lineas', 'sector_origen_id')) {
    db.exec(`
      ALTER TABLE movimiento_interno_lineas ADD COLUMN sector_origen_id INTEGER REFERENCES sectores(id)
    `)
    db.exec(`
      ALTER TABLE movimiento_interno_lineas ADD COLUMN sector_destino_id INTEGER REFERENCES sectores(id)
    `)
    db.exec(`
      ALTER TABLE movimiento_interno_lineas ADD COLUMN cancelada INTEGER NOT NULL DEFAULT 0
    `)
    db.exec(`
      UPDATE movimiento_interno_lineas
      SET
        sector_origen_id = (
          SELECT sector_origen_id FROM movimientos_internos m
          WHERE m.id = movimiento_interno_lineas.movimiento_interno_id
        ),
        sector_destino_id = (
          SELECT sector_destino_id FROM movimientos_internos m
          WHERE m.id = movimiento_interno_lineas.movimiento_interno_id
        )
      WHERE sector_origen_id IS NULL OR sector_destino_id IS NULL
    `)
  }

  if (tableExists(db, 'movimientos_internos')) {
    const ddl = db.prepare(`
      SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'movimientos_internos'
    `).get() as { sql: string } | undefined

    if (ddl?.sql.includes("'ENVIO'") || ddl?.sql.includes('despachado_por_id')) {
      db.exec(`
        CREATE TABLE movimientos_internos_v2 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          fecha TEXT NOT NULL,
          tipo TEXT NOT NULL CHECK (tipo IN ('ENVIAR', 'RECIBIR')),
          sector_origen_id INTEGER REFERENCES sectores(id),
          sector_destino_id INTEGER REFERENCES sectores(id),
          observacion TEXT,
          estado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'COMPLETADO', 'CANCELADO')),
          creado_por_id INTEGER NOT NULL REFERENCES usuarios(id),
          recibido_por_id INTEGER REFERENCES usuarios(id),
          cancelado_por_id INTEGER REFERENCES usuarios(id),
          recibido_at TEXT,
          cancelado_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `)
      db.exec(`
        INSERT INTO movimientos_internos_v2 (
          id, fecha, tipo, sector_origen_id, sector_destino_id, observacion, estado,
          creado_por_id, recibido_por_id, cancelado_por_id, recibido_at, cancelado_at, created_at
        )
        SELECT
          id, fecha,
          CASE tipo WHEN 'ENVIO' THEN 'ENVIAR' WHEN 'SOLICITUD' THEN 'RECIBIR' ELSE tipo END,
          sector_origen_id, sector_destino_id, observacion,
          CASE estado WHEN 'EN_TRANSITO' THEN 'PENDIENTE' ELSE estado END,
          creado_por_id, recibido_por_id, cancelado_por_id, recibido_at, cancelado_at, created_at
        FROM movimientos_internos
      `)
      db.exec('DROP TABLE movimientos_internos')
      db.exec('ALTER TABLE movimientos_internos_v2 RENAME TO movimientos_internos')
    } else if (ddl?.sql.includes("'ENVIO'") === false && ddl?.sql.includes("'ENVIAR'")) {
      db.exec(`
        UPDATE movimientos_internos SET tipo = 'ENVIAR' WHERE tipo = 'ENVIO'
      `)
      db.exec(`
        UPDATE movimientos_internos SET tipo = 'RECIBIR' WHERE tipo = 'SOLICITUD'
      `)
    }
  }

  if (tableExists(db, 'movimiento_interno_lineas') && !columnExists(db, 'movimiento_interno_lineas', 'etiqueta')) {
    db.exec(`ALTER TABLE movimiento_interno_lineas ADD COLUMN tipo_bulto TEXT`)
    db.exec(`ALTER TABLE movimiento_interno_lineas ADD COLUMN cantidad_bultos REAL`)
    db.exec(`ALTER TABLE movimiento_interno_lineas ADD COLUMN unidades_por_bulto REAL`)
    db.exec(`ALTER TABLE movimiento_interno_lineas ADD COLUMN etiqueta TEXT`)
  }

  if (tableExists(db, 'movimiento_interno_lineas') && !columnExists(db, 'movimiento_interno_lineas', 'ubicacion_destino_id')) {
    db.exec(`
      ALTER TABLE movimiento_interno_lineas
      ADD COLUMN ubicacion_destino_id INTEGER REFERENCES sector_ubicaciones(id) ON DELETE SET NULL
    `)
  }

  if (tableExists(db, 'movimiento_interno_lineas') && !columnExists(db, 'movimiento_interno_lineas', 'ubicacion_origen_id')) {
    db.exec(`
      ALTER TABLE movimiento_interno_lineas
      ADD COLUMN ubicacion_origen_id INTEGER REFERENCES sector_ubicaciones(id) ON DELETE SET NULL
    `)
  }

  if (!tableExists(db, 'inventario_sesiones')) {
    db.exec(`
      CREATE TABLE inventario_sesiones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        estado TEXT NOT NULL DEFAULT 'ABIERTA' CHECK (estado IN ('ABIERTA', 'EN_PROGRESO', 'CERRADA', 'CANCELADA')),
        creado_por_id INTEGER NOT NULL REFERENCES usuarios(id),
        cerrado_por_id INTEGER REFERENCES usuarios(id),
        fecha_inicio TEXT,
        fecha_cierre TEXT,
        observacion TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
  }

  if (!tableExists(db, 'inventario_sectores')) {
    db.exec(`
      CREATE TABLE inventario_sectores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sesion_id INTEGER NOT NULL REFERENCES inventario_sesiones(id) ON DELETE CASCADE,
        sector_id INTEGER NOT NULL REFERENCES sectores(id),
        contador_1_id INTEGER NOT NULL REFERENCES usuarios(id),
        contador_2_id INTEGER NOT NULL REFERENCES usuarios(id),
        estado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'EN_CONTEO', 'ESPERANDO_COMPANERO', 'CON_DIFERENCIAS', 'CERRADO_OK')),
        ronda_actual INTEGER NOT NULL DEFAULT 1,
        contador_1_finalizo INTEGER NOT NULL DEFAULT 0,
        contador_2_finalizo INTEGER NOT NULL DEFAULT 0,
        UNIQUE(sesion_id, sector_id)
      )
    `)
  }

  if (!tableExists(db, 'inventario_conteo_lineas')) {
    db.exec(`
      CREATE TABLE inventario_conteo_lineas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        inventario_sector_id INTEGER NOT NULL REFERENCES inventario_sectores(id) ON DELETE CASCADE,
        producto_id INTEGER NOT NULL REFERENCES productos(id),
        contador_id INTEGER NOT NULL REFERENCES usuarios(id),
        ronda INTEGER NOT NULL DEFAULT 1,
        tipo_bulto TEXT NOT NULL CHECK (tipo_bulto IN ('PALLET', 'CAJA', 'SUELTO')),
        cantidad_bultos INTEGER,
        unidades_por_bulto INTEGER,
        cantidad_suelta REAL,
        ubicacion TEXT,
        ubicacion_id INTEGER REFERENCES sector_ubicaciones(id) ON DELETE SET NULL,
        total_unidades REAL NOT NULL,
        orden INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
  }

  if (!tableExists(db, 'inventario_snapshot')) {
    db.exec(`
      CREATE TABLE inventario_snapshot (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sesion_id INTEGER NOT NULL REFERENCES inventario_sesiones(id) ON DELETE CASCADE,
        producto_id INTEGER NOT NULL REFERENCES productos(id),
        sector_id INTEGER NOT NULL REFERENCES sectores(id),
        cantidad_total REAL NOT NULL DEFAULT 0,
        UNIQUE(sesion_id, producto_id, sector_id)
      )
    `)
  }

  if (!tableExists(db, 'inventario_snapshot_lineas')) {
    db.exec(`
      CREATE TABLE inventario_snapshot_lineas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        snapshot_id INTEGER NOT NULL REFERENCES inventario_snapshot(id) ON DELETE CASCADE,
        tipo_bulto TEXT NOT NULL CHECK (tipo_bulto IN ('PALLET', 'CAJA', 'SUELTO')),
        cantidad_bultos INTEGER,
        unidades_por_bulto INTEGER,
        cantidad_suelta REAL,
        ubicacion TEXT,
        ubicacion_id INTEGER,
        total_unidades REAL NOT NULL,
        orden INTEGER NOT NULL DEFAULT 0
      )
    `)
  }

  if (!tableExists(db, 'inventario_diferencias')) {
    db.exec(`
      CREATE TABLE inventario_diferencias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sesion_id INTEGER NOT NULL REFERENCES inventario_sesiones(id) ON DELETE CASCADE,
        inventario_sector_id INTEGER REFERENCES inventario_sectores(id) ON DELETE SET NULL,
        producto_id INTEGER NOT NULL REFERENCES productos(id),
        tipo TEXT NOT NULL CHECK (tipo IN ('ENTRE_CONTADORES', 'CANTIDAD', 'REORGANIZACION', 'FALTANTE', 'SOBRANTE')),
        sector_id INTEGER REFERENCES sectores(id),
        sector_origen_id INTEGER REFERENCES sectores(id),
        sector_destino_id INTEGER REFERENCES sectores(id),
        cantidad_contador_1 REAL,
        cantidad_contador_2 REAL,
        cantidad_contada REAL,
        cantidad_sistema REAL,
        diferencia REAL,
        desglose_sistema TEXT,
        desglose_contado TEXT,
        resuelta INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
  }

  if (!tableExists(db, 'inventario_reportes')) {
    db.exec(`
      CREATE TABLE inventario_reportes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sesion_id INTEGER NOT NULL UNIQUE REFERENCES inventario_sesiones(id) ON DELETE CASCADE,
        cerrado_por_id INTEGER NOT NULL REFERENCES usuarios(id),
        resumen TEXT NOT NULL,
        detalle TEXT NOT NULL,
        ajustes_aplicados TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
  }

  if (!tableExists(db, 'usuario_secciones')) {
    db.exec(`
      CREATE TABLE usuario_secciones (
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        seccion TEXT NOT NULL,
        PRIMARY KEY (usuario_id, seccion)
      )
    `)
  }

  ensureSystemRoles(db)

  if (!tableExists(db, '_migration_legacy_secciones')) {
    migrateLegacyUsersToSecciones(db)
    db.exec(`
      CREATE TABLE _migration_legacy_secciones (
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
  }

  if (!tableExists(db, '_migration_caja_cuenta_bultos')) {
    recalcStockTotalsEnCajas(db)
    db.exec(`
      CREATE TABLE _migration_caja_cuenta_bultos (
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
  }

  if (tableExists(db, 'planilla_lineas') && !columnExists(db, 'planilla_lineas', 'modo_salida')) {
    db.exec(`ALTER TABLE planilla_lineas ADD COLUMN modo_salida TEXT NOT NULL DEFAULT 'CAJA'`)
  }

  if (!tableExists(db, '_migration_planilla_botella_suelto')) {
    db.exec(`
      UPDATE planilla_lineas
      SET
        tipo_bulto = 'SUELTO',
        cantidad_suelta = total_unidades,
        cantidad_bultos = NULL,
        unidades_por_bulto = NULL,
        modo_salida = 'BOTELLA'
      WHERE tipo_bulto = 'CAJA'
        AND cantidad_bultos = 1
        AND unidades_por_bulto IS NOT NULL
        AND unidades_por_bulto != COALESCE(
          (SELECT p.unidades_por_caja_default FROM productos p WHERE p.id = planilla_lineas.producto_id),
          6
        )
    `)
    db.exec(`
      CREATE TABLE _migration_planilla_botella_suelto (
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
  }
}
