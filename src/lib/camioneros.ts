import type { CamioneroVehiculo } from '@/types'

type VehiculoOperativo = Pick<CamioneroVehiculo, 'alias' | 'marca' | 'modelo'>

/** Etiqueta para planillas/retornos: alias + marca/modelo (sin patente). */
export function labelVehiculoOperativo(v: VehiculoOperativo): string {
  const mm = [v.marca, v.modelo].filter(Boolean).join(' ').trim()
  const alias = v.alias?.trim()
  if (alias && mm) return `${alias} — ${mm}`
  if (alias) return alias
  return mm || '—'
}

type VehiculoDetalle = {
  vehiculo_marca?: string | null
  vehiculo_modelo?: string | null
  vehiculo_alias?: string | null
}

/** Etiqueta de vehículo en detalle de planilla/retorno (desde API). */
export function labelVehiculoDetalle(v: VehiculoDetalle): string | null {
  const mm = [v.vehiculo_marca, v.vehiculo_modelo].filter(Boolean).join(' ').trim()
  const alias = v.vehiculo_alias?.trim()
  if (!mm && !alias) return null
  if (alias && mm) return `${alias} — ${mm}`
  return alias || mm
}
