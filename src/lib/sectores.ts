import type { Sector } from '@/types'

/** Sectores activos para ingresos: el marcado por defecto primero, luego por nombre. */
export function sortSectoresParaIngreso(sectores: Sector[]): Sector[] {
  return [...sectores].sort((a, b) => {
    const def = Number(b.ingreso_por_defecto) - Number(a.ingreso_por_defecto)
    if (def !== 0) return def
    return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
  })
}

export function idSectorIngresoPorDefecto(sectores: Sector[]): string {
  const s = sectores.find((x) => Boolean(x.ingreso_por_defecto))
  return s ? String(s.id) : ''
}

/** Mantiene el sector elegido si sigue activo; si no, usa el marcado por defecto. */
export function resolveSectorIdParaIngreso(sectores: Sector[], currentId: string): string {
  const normalized = currentId.trim()
  if (normalized && sectores.some((s) => String(s.id) === normalized)) {
    return normalized
  }
  return idSectorIngresoPorDefecto(sectores)
}

export function esSectorIngresoPorDefecto(sector: Pick<Sector, 'ingreso_por_defecto'>): boolean {
  return Boolean(sector.ingreso_por_defecto)
}

/** Sectores activos para retornos: el marcado por defecto primero, luego por nombre. */
export function sortSectoresParaRetorno(sectores: Sector[]): Sector[] {
  return [...sectores].sort((a, b) => {
    const def = Number(b.retorno_por_defecto) - Number(a.retorno_por_defecto)
    if (def !== 0) return def
    return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
  })
}

export function idSectorRetornoPorDefecto(sectores: Sector[]): string {
  const s = sectores.find((x) => Boolean(x.retorno_por_defecto))
  return s ? String(s.id) : ''
}

/** Mantiene el sector elegido si sigue activo; si no, usa el marcado por defecto. */
export function resolveSectorIdParaRetorno(sectores: Sector[], currentId: string): string {
  const normalized = currentId.trim()
  if (normalized && sectores.some((s) => String(s.id) === normalized)) {
    return normalized
  }
  return idSectorRetornoPorDefecto(sectores)
}

export function esSectorRetornoPorDefecto(sector: Pick<Sector, 'retorno_por_defecto'>): boolean {
  return Boolean(sector.retorno_por_defecto)
}
