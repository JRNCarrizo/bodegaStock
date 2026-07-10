import type Database from 'better-sqlite3'
import { ALL_PERMISOS } from '../db/roles-seed'

/** IDs alineados con la navegación (movimientos → permisos movimientos_internos). */
export const SECCIONES_ASIGNABLES = [
  { id: 'consulta', label: 'Consulta' },
  { id: 'productos', label: 'Productos' },
  { id: 'sectores', label: 'Sectores' },
  { id: 'ingresos', label: 'Ingresos' },
  { id: 'planillas', label: 'Carga de planillas' },
  { id: 'retornos', label: 'Retornos' },
  { id: 'roturas', label: 'Roturas y pérdidas' },
  { id: 'movimientos', label: 'Movimientos' },
  { id: 'inventario', label: 'Inventario (conteo)' },
  { id: 'camioneros', label: 'Camioneros' },
  { id: 'reportes', label: 'Movimientos del día' },
  { id: 'usuarios', label: 'Usuarios' }
] as const

export type SeccionId = (typeof SECCIONES_ASIGNABLES)[number]['id']

const SECCION_PERMISOS: Record<SeccionId, readonly string[]> = {
  consulta: ['consulta.ver'],
  productos: ['productos.ver', 'productos.crear', 'productos.editar'],
  sectores: ['sectores.ver', 'sectores.crear', 'sectores.editar'],
  ingresos: ['ingresos.ver', 'ingresos.crear'],
  planillas: ['planillas.ver', 'planillas.crear'],
  retornos: ['retornos.ver', 'retornos.crear', 'retornos.verificar'],
  roturas: ['roturas.ver', 'roturas.crear'],
  movimientos: ['movimientos_internos.ver', 'movimientos_internos.crear'],
  inventario: ['inventario.contar'],
  camioneros: ['camioneros.ver', 'camioneros.crear', 'camioneros.editar'],
  reportes: ['reportes.ver', 'reportes.exportar'],
  usuarios: ['usuarios.ver', 'usuarios.crear', 'usuarios.editar']
}

const ASSIGNABLE_IDS = new Set<string>(SECCIONES_ASIGNABLES.map((s) => s.id))

export function isSeccionAsignable(seccion: string): seccion is SeccionId {
  return ASSIGNABLE_IDS.has(seccion)
}

export function permisoToSeccionId(codigo: string): SeccionId | null {
  if (codigo.startsWith('ajustes.')) return 'inventario'
  const [seccion] = codigo.split('.')
  if (seccion === 'movimientos_internos') return 'movimientos'
  if (isSeccionAsignable(seccion)) return seccion
  return null
}

export function permisosFromSecciones(secciones: string[]): string[] {
  const out = new Set<string>()
  for (const seccion of secciones) {
    if (!isSeccionAsignable(seccion)) continue
    for (const p of SECCION_PERMISOS[seccion]) out.add(p)
  }
  return [...out]
}

export function seccionesFromPermisos(permisos: string[]): SeccionId[] {
  const out = new Set<SeccionId>()
  for (const p of permisos) {
    const s = permisoToSeccionId(p)
    if (s) out.add(s)
  }
  return [...out]
}

export function getRolNombre(db: Database.Database, rolId: number | null): string | null {
  if (!rolId) return null
  const row = db.prepare('SELECT nombre FROM roles WHERE id = ?').get(rolId) as { nombre: string } | undefined
  return row?.nombre ?? null
}

export function isAdministradorRol(db: Database.Database, rolId: number | null): boolean {
  return getRolNombre(db, rolId) === 'Administrador'
}

export function isUsuarioRol(db: Database.Database, rolId: number | null): boolean {
  return getRolNombre(db, rolId) === 'Usuario'
}

export function getSeccionesForUser(db: Database.Database, userId: number): string[] {
  const rows = db
    .prepare('SELECT seccion FROM usuario_secciones WHERE usuario_id = ? ORDER BY seccion')
    .all(userId) as { seccion: string }[]
  return rows.map((r) => r.seccion)
}

export function getPermisosForUser(db: Database.Database, userId: number, rolId: number | null): string[] {
  if (!rolId) return []
  if (isAdministradorRol(db, rolId)) return [...ALL_PERMISOS]
  if (isUsuarioRol(db, rolId)) return permisosFromSecciones(getSeccionesForUser(db, userId))
  return getPermisosForRolLegacy(db, rolId)
}

/** Permisos desde rol_permisos (roles legacy Operador/Supervisor). */
function getPermisosForRolLegacy(db: Database.Database, rolId: number): string[] {
  const rows = db
    .prepare(`
      SELECT p.codigo FROM permisos p
      JOIN rol_permisos rp ON rp.permiso_id = p.id
      WHERE rp.rol_id = ?
    `)
    .all(rolId) as { codigo: string }[]
  return rows.map((r) => r.codigo)
}

export function setUsuarioSecciones(db: Database.Database, userId: number, secciones: string[]): void {
  db.prepare('DELETE FROM usuario_secciones WHERE usuario_id = ?').run(userId)
  const insert = db.prepare('INSERT INTO usuario_secciones (usuario_id, seccion) VALUES (?, ?)')
  for (const seccion of secciones) {
    if (isSeccionAsignable(seccion)) insert.run(userId, seccion)
  }
}

export function validateSeccionesForRol(
  db: Database.Database,
  rolId: number,
  secciones: string[] | undefined
): { ok: true; secciones: string[] } | { ok: false; error: string } {
  const nombre = getRolNombre(db, rolId)
  if (nombre === 'Administrador') return { ok: true, secciones: [] }
  if (nombre === 'Usuario') {
    const list = secciones ?? []
    if (list.length === 0) {
      return { ok: false, error: 'Seleccioná al menos una sección para el usuario' }
    }
    const invalid = list.filter((s) => !isSeccionAsignable(s))
    if (invalid.length > 0) {
      return { ok: false, error: `Sección no válida: ${invalid[0]}` }
    }
    return { ok: true, secciones: list }
  }
  return { ok: true, secciones: secciones ?? [] }
}

export function migrateLegacyUsersToSecciones(db: Database.Database): void {
  const usuarioRol = db.prepare("SELECT id FROM roles WHERE nombre = 'Usuario'").get() as { id: number } | undefined
  if (!usuarioRol) return

  const users = db.prepare('SELECT id, rol_id FROM usuarios WHERE rol_id IS NOT NULL').all() as {
    id: number
    rol_id: number
  }[]

  for (const user of users) {
    const rolNombre = getRolNombre(db, user.rol_id)
    if (!rolNombre || rolNombre === 'Administrador') continue

    const existing = getSeccionesForUser(db, user.id)
    if (existing.length > 0 && rolNombre === 'Usuario') continue

    const permisos = getPermisosForRolLegacy(db, user.rol_id)
    const secciones = seccionesFromPermisos(permisos)

    db.prepare('UPDATE usuarios SET rol_id = ?, updated_at = datetime(\'now\') WHERE id = ?').run(
      usuarioRol.id,
      user.id
    )
    setUsuarioSecciones(db, user.id, secciones)
  }
}
