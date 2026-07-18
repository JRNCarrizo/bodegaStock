import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import { INVENTARIO_POLL_MS } from '@/hooks/usePolling'
import { api } from '@/lib/utils'
import { useAuth } from '@/context/AuthContext'

export type InventarioActivoInfo = {
  id: number
  nombre: string
  estado: string
  sectores_total: number
  sectores_ok: number
}

type InventarioActivoContextValue = {
  activo: InventarioActivoInfo | null
  refresh: () => Promise<void>
}

const InventarioActivoContext = createContext<InventarioActivoContextValue | null>(null)

export function InventarioActivoProvider({ children }: { children: ReactNode }) {
  const { user, offlineSession } = useAuth()
  const [activo, setActivo] = useState<InventarioActivoInfo | null>(null)

  const refresh = useCallback(async () => {
    if (!user) {
      setActivo(null)
      return
    }
    if (offlineSession || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      return
    }
    try {
      const data = await api<{ activo: InventarioActivoInfo | null }>(
        '/api/inventario/activo-banner',
        { timeoutMs: 3000 }
      )
      setActivo(data.activo)
    } catch {
      /* ignorar errores de red puntuales */
    }
  }, [user, offlineSession])

  useEffect(() => {
    void refresh()
    if (!user || offlineSession) return
    const id = setInterval(() => void refresh(), INVENTARIO_POLL_MS)
    return () => clearInterval(id)
  }, [user, refresh, offlineSession])

  const value = useMemo(
    () => ({
      activo,
      refresh
    }),
    [activo, refresh]
  )

  return (
    <InventarioActivoContext.Provider value={value}>{children}</InventarioActivoContext.Provider>
  )
}

export function useInventarioActivo() {
  const ctx = useContext(InventarioActivoContext)
  if (!ctx) {
    throw new Error('useInventarioActivo debe usarse dentro de InventarioActivoProvider')
  }
  return ctx
}
