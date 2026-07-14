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

CREATE TABLE IF NOT EXISTS usuario_secciones (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  seccion TEXT NOT NULL,
  PRIMARY KEY (usuario_id, seccion)
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
  modo_salida TEXT NOT NULL DEFAULT 'CAJA' CHECK (modo_salida IN ('CAJA', 'BOTELLA')),
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

CREATE TABLE IF NOT EXISTS movimientos_internos (
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
);

CREATE TABLE IF NOT EXISTS movimiento_interno_lineas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  movimiento_interno_id INTEGER NOT NULL REFERENCES movimientos_internos(id) ON DELETE CASCADE,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  sector_origen_id INTEGER NOT NULL REFERENCES sectores(id),
  sector_destino_id INTEGER NOT NULL REFERENCES sectores(id),
  cantidad_cajas REAL NOT NULL,
  tipo_bulto TEXT CHECK (tipo_bulto IS NULL OR tipo_bulto IN ('PALLET', 'CAJA', 'SUELTO')),
  cantidad_bultos REAL,
  unidades_por_bulto REAL,
  etiqueta TEXT,
  cancelada INTEGER NOT NULL DEFAULT 0,
  ubicacion_destino_id INTEGER REFERENCES sector_ubicaciones(id) ON DELETE SET NULL,
  ubicacion_origen_id INTEGER REFERENCES sector_ubicaciones(id) ON DELETE SET NULL,
  orden INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS movimiento_interno_descuentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  movimiento_interno_id INTEGER NOT NULL REFERENCES movimientos_internos(id) ON DELETE CASCADE,
  movimiento_interno_linea_id INTEGER NOT NULL REFERENCES movimiento_interno_lineas(id) ON DELETE CASCADE,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  sector_id INTEGER NOT NULL REFERENCES sectores(id),
  stock_linea_id INTEGER REFERENCES stock_lineas(id) ON DELETE SET NULL,
  unidades REAL NOT NULL,
  etiqueta TEXT
);

CREATE TABLE IF NOT EXISTS inventario_sesiones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'ABIERTA' CHECK (estado IN ('ABIERTA', 'EN_PROGRESO', 'CERRADA', 'CANCELADA')),
  creado_por_id INTEGER NOT NULL REFERENCES usuarios(id),
  cerrado_por_id INTEGER REFERENCES usuarios(id),
  fecha_inicio TEXT,
  fecha_cierre TEXT,
  observacion TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inventario_sectores (
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
);

CREATE TABLE IF NOT EXISTS inventario_conteo_lineas (
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
);

CREATE TABLE IF NOT EXISTS inventario_snapshot (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sesion_id INTEGER NOT NULL REFERENCES inventario_sesiones(id) ON DELETE CASCADE,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  sector_id INTEGER NOT NULL REFERENCES sectores(id),
  cantidad_total REAL NOT NULL DEFAULT 0,
  UNIQUE(sesion_id, producto_id, sector_id)
);

CREATE TABLE IF NOT EXISTS inventario_snapshot_lineas (
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
);

CREATE TABLE IF NOT EXISTS inventario_diferencias (
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
);

CREATE TABLE IF NOT EXISTS inventario_reportes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sesion_id INTEGER NOT NULL UNIQUE REFERENCES inventario_sesiones(id) ON DELETE CASCADE,
  cerrado_por_id INTEGER NOT NULL REFERENCES usuarios(id),
  resumen TEXT NOT NULL,
  detalle TEXT NOT NULL,
  ajustes_aplicados TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`
