import type Database from 'better-sqlite3'

export const ALL_PERMISOS = [
  'productos.ver', 'productos.crear', 'productos.editar',
  'consulta.ver',
  'ingresos.ver', 'ingresos.crear',
  'planillas.ver', 'planillas.crear',
  'retornos.ver', 'retornos.crear', 'retornos.verificar',
  'roturas.ver', 'roturas.crear',
  'sectores.ver', 'sectores.crear', 'sectores.editar',
  'movimientos_internos.ver', 'movimientos_internos.crear',
  'camioneros.ver', 'camioneros.crear', 'camioneros.editar',
  'reportes.ver', 'reportes.exportar',
  'inventario.ver', 'inventario.crear_sesion', 'inventario.contar', 'inventario.supervisar', 'inventario.cerrar',
  'usuarios.ver', 'usuarios.crear', 'usuarios.editar',
  'ajustes.crear'
] as const

function linkPermisos(db: Database.Database, rolId: number, codigos: readonly string[]): void {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO rol_permisos (rol_id, permiso_id)
    SELECT ?, id FROM permisos WHERE codigo = ?
  `)
  for (const codigo of codigos) {
    stmt.run(rolId, codigo)
  }
}

function ensureRole(db: Database.Database, nombre: string, descripcion: string): number {
  db.prepare(`
    INSERT OR IGNORE INTO roles (nombre, descripcion) VALUES (?, ?)
  `).run(nombre, descripcion)
  const row = db.prepare('SELECT id FROM roles WHERE nombre = ?').get(nombre) as { id: number }
  return row.id
}

export function ensureSystemRoles(db: Database.Database): void {
  const insertPermiso = db.prepare(`
    INSERT OR IGNORE INTO permisos (codigo, seccion, accion) VALUES (?, ?, ?)
  `)
  for (const codigo of ALL_PERMISOS) {
    const [seccion, accion] = codigo.split('.')
    insertPermiso.run(codigo, seccion, accion)
  }

  const adminId = ensureRole(db, 'Administrador', 'Acceso total al sistema')
  linkPermisos(db, adminId, ALL_PERMISOS)

  ensureRole(
    db,
    'Usuario',
    'Acceso según las secciones que asigne el administrador'
  )
}
