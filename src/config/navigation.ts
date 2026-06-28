import {
  ArrowLeftRight,
  AlertTriangle,
  BarChart3,
  Boxes,
  ClipboardList,
  LayoutDashboard,
  Package,
  RotateCcw,
  Search,
  Settings,
  Truck,
  Users,
  Warehouse
} from 'lucide-react'
import type { NavItem } from '@/types'

export const CONFIG_NAV_ITEM: NavItem = {
  id: 'configuracion',
  label: 'Configuración',
  path: '/configuracion',
  group: ''
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Inicio', path: '/', group: 'General' },
  { id: 'consulta', label: 'Consulta', path: '/consulta', permiso: 'consulta.ver', group: 'General' },
  { id: 'productos', label: 'Productos', path: '/productos', permiso: 'productos.ver', group: 'Catálogo' },
  { id: 'sectores', label: 'Sectores', path: '/sectores', permiso: 'sectores.ver', group: 'Catálogo' },
  { id: 'ingresos', label: 'Ingresos', path: '/ingresos', permiso: 'ingresos.ver', group: 'Movimientos' },
  { id: 'planillas', label: 'Carga de planillas', path: '/planillas', permiso: 'planillas.ver', group: 'Movimientos' },
  { id: 'retornos', label: 'Retornos', path: '/retornos', permiso: 'retornos.ver', group: 'Movimientos' },
  { id: 'roturas', label: 'Roturas y pérdidas', path: '/roturas', permiso: 'roturas.ver', group: 'Movimientos' },
  { id: 'movimientos', label: 'Movimientos', path: '/movimientos', permiso: 'movimientos_internos.ver', group: 'Movimientos' },
  { id: 'inventario', label: 'Inventario', path: '/inventario', permiso: 'inventario.ver', group: 'Inventario', disabled: true },
  { id: 'camioneros', label: 'Camioneros', path: '/camioneros', permiso: 'camioneros.ver', group: 'Administración' },
  { id: 'usuarios', label: 'Usuarios', path: '/usuarios', permiso: 'usuarios.ver', group: 'Administración' },
  { id: 'reportes', label: 'Movimientos del día', path: '/reportes', permiso: 'reportes.ver', group: 'Reportes' }
]

export const NAV_ICONS: Record<string, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  consulta: Search,
  productos: Package,
  sectores: Warehouse,
  ingresos: Boxes,
  planillas: ClipboardList,
  retornos: RotateCcw,
  roturas: AlertTriangle,
  movimientos: ArrowLeftRight,
  inventario: BarChart3,
  camioneros: Truck,
  reportes: BarChart3,
  usuarios: Users,
  configuracion: Settings
}
