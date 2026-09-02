import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

type MainLayoutContextValue = {
  fullHeight: boolean
  setFullHeight: (active: boolean) => void
}

const MainLayoutContext = createContext<MainLayoutContextValue | null>(null)

export function MainLayoutProvider({ children }: { children: ReactNode }) {
  const [fullHeight, setFullHeight] = useState(false)
  const value = useMemo(() => ({ fullHeight, setFullHeight }), [fullHeight])
  return <MainLayoutContext.Provider value={value}>{children}</MainLayoutContext.Provider>
}

export function useMainLayoutFullHeight(active: boolean) {
  const ctx = useContext(MainLayoutContext)
  useEffect(() => {
    if (!ctx) return
    ctx.setFullHeight(active)
    return () => ctx.setFullHeight(false)
  }, [active, ctx])
}

export function useMainLayoutFullHeightActive() {
  return useContext(MainLayoutContext)?.fullHeight ?? false
}
