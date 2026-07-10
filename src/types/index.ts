export interface ConsultaResumen {
  id: number
  codigo_interno: string
  codigo_barras: string | null
  nombre: string
  descripcion: string | null
  imagen_path: string | null
  activo: number
  stock_total: number
  sectores_con_stock: number
}

export interface ReferenciaBulto {
  tipo_bulto: 'PALLET' | 'CAJA'
  unidades_por_bulto: number
}

export interface ReorganizarLineaInfo {
  puede: boolean
  motivo?: string
  total_unidades: number
  referencias_bulto: ReferenciaBulto[]
}

export interface ReorganizarDesglosePayload {
  bultos: Array<{
    tipo_bulto: 'PALLET' | 'CAJA'
    cantidad_bultos: number
    unidades_por_bulto: number
  }>
  unidades_sueltas: number
}

export interface StockLineaConsulta {
  id: number
  tipo_bulto: string
  cantidad_bultos: number | null
  unidades_por_bulto: number | null
  cantidad_suelta: number | null
  ubicacion: string | null
  total_unidades: number
  etiqueta: string
}

export interface SectorStockConsulta {
  stock_sector_id: number
  sector_id: number
  sector_codigo: string
  sector_nombre: string
  cantidad_total: number
  reorganizar: ReorganizarLineaInfo
  lineas: StockLineaConsulta[]
}

export interface ConsultaDetalle {
  producto: {
    id: number
    codigo_interno: string
    codigo_barras: string | null
    nombre: string
    descripcion: string | null
    imagen_path: string | null
    activo: number
    unidad: string
  }
  stock_total: number
  sectores: SectorStockConsulta[]
}

export interface Sector {
  id: number
  codigo: string
  nombre: string
  descripcion: string | null
  es_sector_descuento: number
  prioridad_descuento: number | null
  usa_ubicaciones: number
  activo: number
  created_at: string
  productos_con_stock: number
  stock_total_unidades: number
  ubicaciones_count: number
}

export interface SectorUbicacion {
  id: number
  sector_id: number
  codigo: string
  nombre: string
  orden: number
  activo: number
  created_at: string
}

export interface SectorForm {
  nombre: string
  descripcion: string
  es_sector_descuento: boolean
  prioridad_descuento: string
  usa_ubicaciones: boolean
  activo: boolean
}

export interface SectorStockLinea {
  id: number
  tipo_bulto: string
  cantidad_bultos: number | null
  unidades_por_bulto: number | null
  cantidad_suelta: number | null
  ubicacion: string | null
  ubicacion_id: number | null
  total_unidades: number
  etiqueta: string
}

export interface SectorStockProducto {
  producto_id: number
  codigo_interno: string
  nombre: string
  imagen_path: string | null
  unidad: string
  cantidad_total: number
  lineas: SectorStockLinea[]
}

export interface SectorStockDetalle {
  sector: {
    id: number
    codigo: string
    nombre: string
    usa_ubicaciones: boolean
  }
  ubicacion: { id: number; nombre: string; codigo: string } | null
  sin_ubicacion: boolean
  productos: SectorStockProducto[]
  total_productos: number
  total_stock: number
}

export interface Camionero {
  id: number
  numero_interno: string
  nombre: string
  empresa: string
  activo: number
  created_at: string
  vehiculos_count: number
}

export interface CamioneroVehiculo {
  id: number
  camionero_id: number
  marca: string
  modelo: string
  patente: string
  activo: number
  created_at: string
}

export interface CamioneroForm {
  numero_interno: string
  nombre: string
  empresa: string
  activo: boolean
}

export interface Producto {
  id: number
  codigo_interno: string
  codigo_barras: string | null
  nombre: string
  descripcion: string | null
  imagen_path: string | null
  unidad: string
  unidades_por_pallet_default: number | null
  unidades_por_caja_default: number | null
  activo: number
  created_at: string
  updated_at: string
}

export interface ProductoForm {
  codigo_interno: string
  codigo_barras: string
  nombre: string
  descripcion: string
  unidad: string
  unidades_por_pallet_default: number | ''
  unidades_por_caja_default: number | ''
  activo: boolean
}

export interface Usuario {
  id: number
  username: string
  nombre: string
  rol_id: number | null
  rol_nombre?: string | null
  es_admin?: boolean
  secciones?: string[]
  permisos: string[]
}

export interface UsuarioListItem {
  id: number
  username: string
  nombre: string
  activo: number
  created_at: string
  rol_id: number | null
  rol_nombre: string | null
  secciones: string[]
}

export interface Rol {
  id: number
  nombre: string
  descripcion: string | null
}

export interface IngresoLineaDraft {
  tempId: string
  producto_id: number
  codigo_interno: string
  nombre: string
  tipo_bulto: 'PALLET' | 'CAJA' | 'SUELTO'
  cantidad_bultos?: number
  unidades_por_bulto?: number
  cantidad_suelta?: number
  total_unidades: number
  etiqueta: string
  ubicacion_id?: number | null
  ubicacion_nombre?: string | null
}

export interface IngresoListItem {
  id: number
  fecha: string
  numero_remito: string
  observacion: string | null
  sector_id: number
  sector_nombre: string
  usuario_nombre: string
  total_unidades: number
  lineas_count: number
  productos_count: number
  created_at: string
}

export interface IngresoDetalleLinea {
  id: number
  producto_id: number
  codigo_interno: string
  nombre: string
  sector_nombre: string
  ubicacion_nombre: string | null
  etiqueta: string
  total_unidades: number
}

export interface IngresoDetalle {
  ingreso: {
    id: number
    fecha: string
    numero_remito: string
    observacion: string | null
    sector_nombre: string
    usuario_nombre: string
    created_at: string
  }
  lineas: IngresoDetalleLinea[]
  total_unidades: number
}

export interface PlanillaLineaDraft {
  tempId: string
  producto_id: number
  codigo_interno: string
  nombre: string
  modo_salida: 'CAJA' | 'BOTELLA'
  cantidad: number
  total_unidades: number
  etiqueta: string
}

export interface PlanillaListItem {
  id: number
  fecha: string
  numero: string
  observacion: string | null
  camionero_id: number
  camionero_nombre: string
  camionero_numero: string
  vehiculo_id: number | null
  vehiculo_modelo: string | null
  usuario_nombre: string
  total_unidades: number
  lineas_count: number
  created_at: string
}

export interface PlanillaDescuentoDetalle {
  id: number
  planilla_linea_id: number
  sector_id: number
  sector_nombre: string
  unidades: number
  etiqueta: string | null
}

export interface PlanillaDetalleLinea {
  id: number
  producto_id: number
  codigo_interno: string
  nombre: string
  etiqueta: string
  total_unidades: number
  descuentos: PlanillaDescuentoDetalle[]
}

export interface PlanillaPreviewLinea {
  producto_id: number
  codigo_interno: string
  nombre: string
  total_solicitado: number
  etiqueta: string
  descuentos: {
    sector_id: number
    sector_nombre: string
    unidades: number
    etiqueta: string
  }[]
  error?: string
}

export interface PlanillaDetalle {
  planilla: {
    id: number
    fecha: string
    numero: string
    observacion: string | null
    camionero_nombre: string
    camionero_numero: string
    camionero_empresa: string
    vehiculo_marca: string | null
    vehiculo_modelo: string | null
    vehiculo_patente: string | null
    usuario_nombre: string
    created_at: string
  }
  lineas: PlanillaDetalleLinea[]
  total_unidades: number
}

export type RetornoEstadoCondicion = 'BUEN_ESTADO' | 'INCOMPLETA' | 'MAL_ESTADO'
export type RetornoEstado = 'PENDIENTE' | 'VERIFICADO'

export interface RetornoLineaDraft {
  tempId: string
  producto_id: number
  codigo_interno: string
  nombre: string
  sector_id: number
  sector_nombre: string
  cantidad_cajas: number
  estado_condicion: RetornoEstadoCondicion
}

export interface RetornoListItem {
  id: number
  fecha: string
  numero_planilla: string | null
  observacion: string | null
  estado: RetornoEstado
  sector_nombre: string
  camionero_nombre: string | null
  camionero_numero: string | null
  usuario_nombre: string
  verificado_por_nombre: string | null
  total_cajas: number
  lineas_count: number
  created_at: string
  verificado_at: string | null
}

export interface RetornoDetalleLinea {
  id: number
  producto_id: number
  codigo_interno: string
  nombre: string
  sector_id: number
  sector_nombre: string
  cantidad_cajas: number
  cantidad_efectiva: number
  estado_condicion: RetornoEstadoCondicion
  estado_efectivo: RetornoEstadoCondicion
  linea_verificada: boolean
  cantidad_verificada: number | null
  estado_verificado: RetornoEstadoCondicion | null
  etiqueta: string
  orden: number
}

export interface RetornoDetalle {
  retorno: {
    id: number
    fecha: string
    numero_planilla: string | null
    observacion: string | null
    sector_id: number | null
    sector_nombre: string | null
    estado: RetornoEstado
    camionero_id: number | null
    camionero_nombre: string | null
    camionero_numero: string | null
    camionero_empresa: string | null
    vehiculo_marca: string | null
    vehiculo_modelo: string | null
    vehiculo_patente: string | null
    cargado_por_id: number
    cargado_por_nombre: string
    verificado_por_id: number | null
    verificado_por_nombre: string | null
    observacion_verificacion: string | null
    created_at: string
    verificado_at: string | null
  }
  lineas: RetornoDetalleLinea[]
  total_cajas: number
  lineas_verificadas: number
}

export interface RoturaLineaDraft {
  tempId: string
  producto_id: number
  codigo_interno: string
  nombre: string
  sector_id: number
  sector_nombre: string
  cantidad_cajas: number
}

export interface RoturaListItem {
  id: number
  fecha: string
  observacion: string | null
  usuario_nombre: string
  total_cajas: number
  lineas_count: number
  created_at: string
}

export interface RoturaDetalleLinea {
  id: number
  producto_id: number
  codigo_interno: string
  nombre: string
  sector_id: number
  sector_nombre: string
  cantidad_cajas: number
  orden: number
}

export interface RoturaDetalle {
  rotura: {
    id: number
    fecha: string
    observacion: string | null
    usuario_id: number
    usuario_nombre: string
    created_at: string
  }
  lineas: RoturaDetalleLinea[]
  total_cajas: number
}

export interface RoturaResumenDia {
  fecha: string
  registros: number
  total_cajas: number
  productos: Array<{
    producto_id: number
    codigo_interno: string
    nombre: string
    total_cajas: number
    sectores_count: number
  }>
}

export interface MovimientosDiaReport {
  fecha_desde: string
  fecha_hasta: string
  stock_inicial: number
  ingresos: number
  retornos: number
  planillas: number
  roturas: number
  balance_final: number
  perdidos_retornos: number
}

export interface RetornoPerdidoDiaItem {
  retorno_id: number
  codigo_interno: string
  nombre: string
  sector_nombre: string
  cantidad_cajas: number
  estado: string
}

export type ReporteDetalleTipo =
  | 'ingresos'
  | 'retornos'
  | 'planillas'
  | 'roturas'
  | 'stock_inicial'
  | 'balance_final'

export interface ReporteDetalleItem {
  codigo_interno: string
  nombre: string
  cantidad_cajas: number
}

export interface ReporteDetalle {
  tipo: ReporteDetalleTipo
  titulo: string
  fecha_desde: string
  fecha_hasta: string
  total: number
  items: ReporteDetalleItem[]
}

export type MovimientoInternoTipo = 'ENVIAR' | 'RECIBIR'
export type MovimientoInternoEstado = 'PENDIENTE' | 'COMPLETADO' | 'CANCELADO'

export interface MovimientoInternoProductoStock {
  id: number
  codigo_interno: string
  codigo_barras: string | null
  nombre: string
  imagen_path: string | null
  unidad: string | null
  unidades_por_pallet_default: number | null
  unidades_por_caja_default: number | null
  stock_cajas: number
}

export interface MovimientoInternoSectorStock {
  sector_id: number
  sector_nombre: string
  stock_cajas: number
}

export interface MovimientoInternoLineaDraft {
  tempId: string
  producto_id: number
  codigo_interno: string
  nombre: string
  cantidad_cajas: number
  tipo_bulto: 'PALLET' | 'CAJA'
  cantidad_bultos: number
  unidades_por_bulto: number
  etiqueta: string
  sector_origen_id: number
  sector_origen_nombre: string
  sector_destino_id: number
  sector_destino_nombre: string
  ubicacion_destino_id: number | null
  ubicacion_destino_nombre: string | null
}

export interface MovimientoInternoListItem {
  id: number
  fecha: string
  tipo: MovimientoInternoTipo
  estado: MovimientoInternoEstado
  observacion: string | null
  sector_origen_nombre: string
  sector_destino_nombre: string
  creado_por_nombre: string
  recibido_por_nombre: string | null
  total_cajas: number
  lineas_count: number
  created_at: string
}

export interface MovimientoInternoDetalleLinea {
  id: number
  producto_id: number
  codigo_interno: string
  nombre: string
  unidad: string | null
  cantidad_cajas: number
  tipo_bulto: 'PALLET' | 'CAJA' | 'SUELTO' | null
  cantidad_bultos: number | null
  unidades_por_bulto: number | null
  etiqueta: string | null
  sector_origen_id: number
  sector_origen_nombre: string
  sector_destino_id: number
  sector_destino_nombre: string
  ubicacion_destino_id: number | null
  ubicacion_destino_nombre: string | null
  cancelada: boolean
  orden: number
}

export interface MovimientoInternoDetalle {
  movimiento: {
    id: number
    fecha: string
    tipo: MovimientoInternoTipo
    estado: MovimientoInternoEstado
    observacion: string | null
    sector_origen_id: number | null
    sector_origen_nombre: string | null
    sector_destino_id: number | null
    sector_destino_nombre: string | null
    creado_por_id: number
    creado_por_nombre: string
    recibido_por_id: number | null
    recibido_por_nombre: string | null
    cancelado_por_id: number | null
    cancelado_por_nombre: string | null
    recibido_at: string | null
    cancelado_at: string | null
    created_at: string
  }
  lineas: MovimientoInternoDetalleLinea[]
  total_cajas: number
  lineas_activas: number
}

export interface NavItem {
  id: string
  label: string
  path: string
  /** Requiere este permiso (si no hay `permisos`). */
  permiso?: string
  /** Visible si el usuario tiene al menos uno de estos permisos. */
  permisos?: string[]
  group: string
  disabled?: boolean
}

export function navItemVisible(item: NavItem, hasPermiso: (codigo: string) => boolean): boolean {
  if (item.permisos?.length) return item.permisos.some(hasPermiso)
  if (item.permiso) return hasPermiso(item.permiso)
  return true
}

export type InventarioSesionEstado = 'ABIERTA' | 'EN_PROGRESO' | 'CERRADA' | 'CANCELADA'
export type InventarioSectorEstado =
  | 'PENDIENTE'
  | 'EN_CONTEO'
  | 'ESPERANDO_COMPANERO'
  | 'CON_DIFERENCIAS'
  | 'CERRADO_OK'

export interface InventarioSesionListItem {
  id: number
  nombre: string
  estado: InventarioSesionEstado
  creado_por_nombre: string
  fecha_inicio: string | null
  fecha_cierre: string | null
  sectores_total: number
  sectores_ok: number
  created_at: string
}

export interface InventarioSectorResumen {
  id: number
  sector_id: number
  sector_nombre: string
  sector_codigo: string
  contador_1_id: number
  contador_2_id: number
  contador_1_nombre: string
  contador_2_nombre: string
  estado: InventarioSectorEstado
  ronda_actual: number
  contador_1_finalizo: boolean
  contador_2_finalizo: boolean
}

export interface InventarioSesionDetalle {
  sesion: {
    id: number
    nombre: string
    estado: InventarioSesionEstado
    observacion: string | null
    creado_por_nombre: string
    fecha_inicio: string | null
    fecha_cierre: string | null
    created_at: string
  }
  sectores: InventarioSectorResumen[]
  reporte: {
    resumen: Record<string, number>
    detalle: Array<Record<string, unknown>>
    ajustes_aplicados: Array<Record<string, unknown>>
    created_at: string
  } | null
}

export interface InventarioConteoLinea {
  id: number
  producto_id: number
  contador_id: number
  ronda: number
  tipo_bulto: string
  cantidad_bultos: number | null
  unidades_por_bulto: number | null
  cantidad_suelta: number | null
  ubicacion: string | null
  total_cajas?: number
  total_suelto?: number
  total_unidades: number
  orden: number
  codigo_interno?: string
  nombre?: string
  etiqueta: string
}

export interface InventarioMisSector {
  id: number
  sesion_id: number
  sector_id: number
  sector_nombre: string
  sector_codigo: string
  estado: InventarioSectorEstado
  ronda_actual: number
  contador_1_id: number
  contador_2_id: number
  contador_1_nombre: string
  contador_2_nombre: string
  contador_1_finalizo: boolean
  contador_2_finalizo: boolean
  soy_contador_1: boolean
}

export interface InventarioUsuarioOption {
  id: number
  username: string
  nombre: string
  rol_nombre: string | null
}
