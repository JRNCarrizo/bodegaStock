import { readDraft, writeDraft } from '@/lib/draftStorage'

const REMITO_PREFIJO_KEY = 'bodegaStock:ingresoRemitoPrefijo:v1'

/** Prefijo tipo punto de venta: dígitos + guión al inicio (ej. 0001-). */
const REMITO_PREFIJO_RE = /^(\d+-)/

export function extractRemitoPrefijo(numero: string): string | null {
  const trimmed = numero.trim()
  const match = trimmed.match(REMITO_PREFIJO_RE)
  return match ? match[1] : null
}

export function isRemitoPrefijoOnly(numero: string): boolean {
  const trimmed = numero.trim()
  if (!trimmed) return false
  const prefijo = extractRemitoPrefijo(trimmed)
  return !!prefijo && trimmed === prefijo
}

export function readRemitoPrefijo(): string {
  return readDraft<{ prefijo: string }>(REMITO_PREFIJO_KEY)?.prefijo ?? ''
}

export function saveRemitoPrefijoFromNumero(numero: string): void {
  const prefijo = extractRemitoPrefijo(numero)
  if (!prefijo) return
  try {
    writeDraft(REMITO_PREFIJO_KEY, { prefijo })
  } catch {
    /* quota / private mode */
  }
}

export function initialRemitoConPrefijo(): string {
  return readRemitoPrefijo()
}
