import { api } from './utils'

type DisponibilidadResponse = { disponible: boolean; error?: string }

export async function checkPlanillaNumero(numero: string): Promise<string | null> {
  const res = await api<DisponibilidadResponse>(
    `/api/planillas/disponibilidad-numero?numero=${encodeURIComponent(numero.trim())}`
  )
  return res.disponible ? null : (res.error ?? 'Ya existe una planilla con ese número')
}

export async function checkRetornoPlanilla(numero: string): Promise<string | null> {
  const n = numero.trim()
  if (!n) return null

  const res = await api<DisponibilidadResponse>(
    `/api/retornos/disponibilidad-numero?numero=${encodeURIComponent(n)}`
  )
  return res.disponible ? null : (res.error ?? 'Ya existe un retorno con ese número de planilla')
}

export async function checkIngresoRemito(numero: string): Promise<string | null> {
  const res = await api<DisponibilidadResponse>(
    `/api/ingresos/disponibilidad-numero?numero=${encodeURIComponent(numero.trim())}`
  )
  return res.disponible ? null : (res.error ?? 'Ya existe un ingreso con ese número de remito')
}
