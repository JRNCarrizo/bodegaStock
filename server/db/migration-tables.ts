/** Orden de INSERT (padres antes que hijos). DELETE usa el inverso. */
export const MIGRATION_TABLES = [
  'roles',
  'permisos',
  'rol_permisos',
  'logisticas',
  'usuarios',
  'usuario_secciones',
  'app_settings',
  'productos',
  'sectores',
  'sector_ubicaciones',
  'stock_sector',
  'stock_lineas',
  'camioneros',
  'camionero_vehiculos',
  'ingresos',
  'ingreso_lineas',
  'movimientos',
  'planillas',
  'planilla_lineas',
  'planilla_descuentos',
  'retornos',
  'retorno_lineas',
  'roturas',
  'rotura_lineas',
  'rotura_descuentos',
  'movimientos_internos',
  'movimiento_interno_lineas',
  'movimiento_interno_descuentos',
  'inventario_sesiones',
  'inventario_sectores',
  'inventario_conteo_lineas',
  'inventario_sector_reconteo_productos',
  'inventario_snapshot',
  'inventario_snapshot_lineas',
  'inventario_diferencias',
  'inventario_reportes',
  'insumos_transportistas',
  'agenda_turnos',
] as const

export type MigrationTableName = (typeof MIGRATION_TABLES)[number]

export type MigrationDump = {
  version: 1
  exportedAt: string
  tables: Partial<Record<MigrationTableName, Record<string, unknown>[]>>
}
