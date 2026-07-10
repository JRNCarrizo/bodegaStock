import { useEffect, useRef } from 'react'
import { useSidebarNav } from '@/context/SidebarNavContext'

export function useEscHandler(active: boolean, handler: () => boolean) {
  const { registerEscHandler } = useSidebarNav()
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!active) return
    return registerEscHandler(() => handlerRef.current())
  }, [active, registerEscHandler])
}
