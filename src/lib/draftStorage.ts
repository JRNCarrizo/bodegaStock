import { getActiveLogisticaId } from '@/lib/utils'

/** Clave de localStorage scoped a la logística activa (Esmeralda / NAKBE). */
export function draftStorageKey(baseKey: string): string {
  const logisticaId = getActiveLogisticaId()
  if (logisticaId != null && logisticaId > 0) {
    return `${baseKey}:log${logisticaId}`
  }
  return baseKey
}

export function readDraft<T>(baseKey: string): T | null {
  try {
    const raw = localStorage.getItem(draftStorageKey(baseKey))
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function writeDraft(baseKey: string, draft: unknown): void {
  try {
    localStorage.setItem(draftStorageKey(baseKey), JSON.stringify(draft))
  } catch {
    /* quota / private mode */
  }
}

export function clearDraft(baseKey: string): void {
  try {
    localStorage.removeItem(draftStorageKey(baseKey))
  } catch {
    /* ignore */
  }
}
