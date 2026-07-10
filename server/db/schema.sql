-- BodegaStock schema v0.1

CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  descripcion TEXT
);

CREATE TABLE IF NOT EXISTS permisos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  seccion TEXT NOT NULL,
  accion TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rol_permisos (
  rol_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permiso_id INTEGER NOT NULL REFERENCES permisos(id) ON DELETE CASCADE,
  PRIMARY KEY (rol_id, permiso_id)
);

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nombre TEXT NOT NULL,
  rol_id INTEGER REFERENCES roles(id),
  activo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS productos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo_interno TEXT NOT NULL UNIQUE,
  codigo_barras TEXT UNIQUE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  imagen_path TEXT,
  unidad TEXT NOT NULL DEFAULT 'unidad',
  unidades_por_pallet_default INTEGER,
  unidades_por_caja_default INTEGER,
  activo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sectores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  es_sector_descuento INTEGER NOT NULL DEFAULT 0,
  prioridad_descuento INTEGER,
  activo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stock_sector (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  sector_id INTEGER NOT NULL REFERENCES sectores(id),
  cantidad_total REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(producto_id, sector_id)
);

CREATE TABLE IF NOT EXISTS stock_lineas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stock_sector_id INTEGER NOT NULL REFERENCES stock_sector(id) ON DELETE CASCADE,
  tipo_bulto TEXT NOT NULL CHECK (tipo_bulto IN ('PALLET', 'CAJA', 'SUELTO')),
  cantidad_bultos INTEGER,
  unidades_por_bulto INTEGER,
  cantidad_suelta REAL,
  ubicacion TEXT,
  total_unidades REAL NOT NULL,
  orden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS camioneros (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT UNIQUE,
  nombre TEXT NOT NULL,
  telefono TEXT,
  observaciones TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
