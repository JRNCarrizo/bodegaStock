/** IDs alineados con la navegación y con usuario_secciones en el backend. */
export const SECCIONES_ASIGNABLES = [
  { id: 'consulta', label: 'Consulta', group: 'General' },
  { id: 'productos', label: 'Productos', group: 'Catálogo' },
  { id: 'sectores', label: 'Sectores', group: 'Catálogo' },
  { id: 'ingresos', label: 'Ingresos', group: 'Movimientos' },
  { id: 'planillas', label: 'Carga de planillas', group: 'Movimientos' },
  { id: 'retornos', label: 'Retornos', group: 'Movimientos' },
  { id: 'roturas', label: 'Roturas y pérdidas', group: 'Movimientos' },
  { id: 'movimientos', label: 'Movimientos', group: 'Movimientos' },
  { id: 'inventario', label: 'Inventario (conteo)', group: 'Inventario' },
  { id: 'camioneros', label: 'Camioneros', group: 'Administración' },
  { id: 'reportes', label: 'Movimientos del día', group: 'Reportes' },
  { id: 'usuarios', label: 'Usuarios', group: 'Administración' }
] as const

export type SeccionId = (typeof SECCIONES_ASIGNABLES)[number]['id']

export const SECCION_LABELS: Record<SeccionId, string> = Object.fromEntries(
  SECCIONES_ASIGNABLES.map((s) => [s.id, s.label])
) as Record<SeccionId, string>

export const SECCION_GROUPS = [...new Set(SECCIONES_ASIGNABLES.map((s) => s.group))]
