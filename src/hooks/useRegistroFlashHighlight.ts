import { useEffect, useState } from 'react'
import { REGISTRO_NUEVO_FLASH } from '@/lib/listKeyboardHighlight'

/** Resalta un registro recién creado unos segundos en el listado. */
export function useRegistroFlashHighlight(durationMs = 2800) {
  const [flashId, setFlashId] = useState<number | null>(null)

  useEffect(() => {
    if (flashId == null) return
    const t = window.setTimeout(() => setFlashId(null), durationMs)
    return () => window.clearTimeout(t)
  }, [flashId, durationMs])

  function flashClass(id: number): string {
    return flashId === id ? REGISTRO_NUEVO_FLASH : ''
  }

  return { flashId, setFlashId, flashClass }
}
