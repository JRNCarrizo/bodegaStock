import { useEffect, useRef } from 'react'

/** Intervalo de polling para inventario (conteo / supervisor). */
export const INVENTARIO_POLL_MS = 20_000

export function usePolling(
  callback: () => void | Promise<void>,
  enabled: boolean,
  intervalMs = INVENTARIO_POLL_MS
) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    if (!enabled) return

    const tick = () => {
      void callbackRef.current()
    }

    // Disparar al habilitar (si no, hay que esperar todo el intervalo).
    tick()
    const id = setInterval(tick, intervalMs)
    return () => clearInterval(id)
  }, [enabled, intervalMs])
}
