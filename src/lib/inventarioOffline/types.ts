/** Tipos del inventario offline (paquete local + sync entre celulares). */

export type TipoBultoOffline = 'PALLET' | 'CAJA' | 'SUELTO'

export interface OfflineProducto {
  id: number
  codigo_interno: string
  codigo_barras: string | null
  nombre: string
  unidad: string
  unidades_por_pallet_default: number | null
  unidades_por_caja_default: number | null
  botellas_por_caja: number
}

export interface OfflineUbicacion {
  id: number
  codigo: string
  nombre: string
  orden: number
}

export interface OfflinePaquete {
  version: number
  descargado_at: string
  sesion: {
    id: number
    nombre: string
    estado: string
    fecha_inicio: string | null
  }
  inventario_sector: {
    id: number
    sector_id: number
    sector_nombre: string
    sector_codigo: string
    modo_conectividad: 'OFFLINE'
    estado: string
    ronda_actual: number
    contador_1_id: number
    contador_2_id: number
    contador_1_nombre: string
    contador_2_nombre: string
    mi_rol: 1 | 2
    usa_ubicaciones: boolean
  }
  ubicaciones: OfflineUbicacion[]
  productos: OfflineProducto[]
  snapshot_sector: Array<{
    producto_id: number
    codigo_interno: string
    nombre: string
    cantidad_total: number
    lineas: Array<Record<string, unknown>>
  }>
}

export interface OfflineLinea {
  local_id: string
  producto_id: number
  contador_id: number
  ronda: number
  tipo_bulto: TipoBultoOffline
  cantidad_bultos: number | null
  unidades_por_bulto: number | null
  cantidad_suelta: number | null
  ubicacion: string | null
  ubicacion_id: number | null
  total_unidades: number
  total_cajas: number
  total_suelto: number
  orden: number
  etiqueta: string
  codigo_interno?: string
  nombre?: string
}

export interface OfflineEstadoLocal {
  inventario_sector_id: number
  ronda_actual: number
  mi_finalizo: boolean
  companero_finalizo: boolean
  /** Última ronda informada por el compañero en un sync (si avanzó a reconteo). */
  companero_ronda_actual?: number
  /** Líneas propias (todas las rondas). */
  mis_lineas: OfflineLinea[]
  /** Líneas del compañero recibidas por sync (todas las rondas). */
  lineas_companero: OfflineLinea[]
  actualizado_at: string
}

/** Payload que se intercambia entre celulares al sincronizar. */
export interface OfflineSyncPayload {
  version: 1
  inventario_sector_id: number
  sesion_id: number
  contador_id: number
  rol: 1 | 2
  ronda_actual: number
  finalizo: boolean
  lineas: OfflineLinea[]
  enviado_at: string
}
