export const SCHEMA_SQL = `
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
  usa_ubicaciones INTEGER NOT NULL DEFAULT 0,
  activo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sector_ubicaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sector_id INTEGER NOT NULL REFERENCES sectores(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  orden INTEGER NOT NULL DEFAULT 0,
  activo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(sector_id, codigo)
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
  ubicacion_id INTEGER REFERENCES sector_ubicaciones(id) ON DELETE SET NULL,
  total_unidades REAL NOT NULL,
  orden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS camioneros (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero_interno TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  empresa TEXT NOT NULL,
  activo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS camionero_vehiculos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  camionero_id INTEGER NOT NULL REFERENCES camioneros(id) ON DELETE CASCADE,
  marca TEXT NOT NULL,
  modelo TEXT NOT NULL,
  patente TEXT NOT NULL UNIQUE,
  activo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ingresos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL,
  numero_remito TEXT NOT NULL,
  observacion TEXT,
  sector_id INTEGER NOT NULL REFERENCES sectores(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ingreso_lineas (
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
);

CREATE TABLE IF NOT EXISTS movimientos (
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
);

CREATE TABLE IF NOT EXISTS planillas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL,
  numero TEXT NOT NULL,
  observacion TEXT,
  camionero_id INTEGER NOT NULL REFERENCES camioneros(id),
  vehiculo_id INTEGER REFERENCES camionero_vehiculos(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS planilla_lineas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  planilla_id INTEGER NOT NULL REFERENCES planillas(id) ON DELETE CASCADE,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  tipo_bulto TEXT NOT NULL CHECK (tipo_bulto IN ('PALLET', 'CAJA', 'SUELTO')),
  cantidad_bultos INTEGER,
  unidades_por_bulto INTEGER,
  cantidad_suelta REAL,
  total_unidades REAL NOT NULL,
  orden INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS planilla_descuentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  planilla_id INTEGER NOT NULL REFERENCES planillas(id) ON DELETE CASCADE,
  planilla_linea_id INTEGER NOT NULL REFERENCES planilla_lineas(id) ON DELETE CASCADE,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  sector_id INTEGER NOT NULL REFERENCES sectores(id),
  stock_linea_id INTEGER REFERENCES stock_lineas(id) ON DELETE SET NULL,
  unidades REAL NOT NULL,
  etiqueta TEXT
);

CREATE TABLE IF NOT EXISTS retornos (
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
);

CREATE TABLE IF NOT EXISTS retorno_lineas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  retorno_id INTEGER NOT NULL REFERENCES retornos(id) ON DELETE CASCADE,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  sector_id INTEGER NOT NULL REFERENCES sectores(id),
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
);

CREATE TABLE IF NOT EXISTS roturas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL,
  observacion TEXT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rotura_lineas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rotura_id INTEGER NOT NULL REFERENCES roturas(id) ON DELETE CASCADE,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  sector_id INTEGER NOT NULL REFERENCES sectores(id),
  cantidad_cajas REAL NOT NULL,
  orden INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS rotura_descuentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rotura_id INTEGER NOT NULL REFERENCES roturas(id) ON DELETE CASCADE,
  rotura_linea_id INTEGER NOT NULL REFERENCES rotura_lineas(id) ON DELETE CASCADE,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  sector_id INTEGER NOT NULL REFERENCES sectores(id),
  stock_linea_id INTEGER REFERENCES stock_lineas(id) ON DELETE SET NULL,
  unidades REAL NOT NULL,
  etiqueta TEXT
);
`
