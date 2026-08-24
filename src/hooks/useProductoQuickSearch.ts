import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { searchDelayMs } from '@/lib/searchDelay'
import { sortProductosBySearchRelevance } from '@/lib/productoSearch'
import { api } from '@/lib/utils'
import type { Producto } from '@/types'

/**
 * Búsqueda de productos para combobox de carga (planillas, ingresos, etc.).
 * Más reactiva que el debounce fijo de 250–300 ms.
 */
export function useProductoQuickSearch(
  query: string,
  options?: { enabled?: boolean; limit?: number }
): {
  results: Producto[]
  searching: boolean
  setResults: Dispatch<SetStateAction<Producto[]>>
} {
  const enabled = options?.enabled !== false
  const limit = options?.limit ?? 12
  const [results, setResults] = useState<Producto[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    const q = query.trim()
    if (!enabled || !q) {
      setResults([])
      setSearching(false)
      return
    }

    let cancelled = false
    setSearching(true)
    const timer = window.setTimeout(async () => {
      try {
        const data = await api<Producto[]>(
          `/api/productos?q=${encodeURIComponent(q)}&activo=1`
        )
        if (!cancelled) {
          setResults(sortProductosBySearchRelevance(data, q).slice(0, limit))
        }
      } catch {
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, searchDelayMs(q))

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query, enabled, limit])

  return { results, searching, setResults }
}
