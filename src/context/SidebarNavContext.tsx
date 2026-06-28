import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { NavItem } from '@/types'

type SidebarNavContextValue = {
  sidebarActive: boolean
  highlightIndex: number
  focusSidebar: () => void
  blurSidebar: () => void
  registerEscHandler: (handler: () => boolean) => () => void
  setNavLinkRef: (index: number, node: HTMLAnchorElement | null) => void
  isNavItemHighlighted: (index: number) => boolean
  handleNavLinkClick: (index: number, disabled?: boolean) => void
  activateNavItem: (index: number) => void
}

const SidebarNavContext = createContext<SidebarNavContextValue | null>(null)

function routeMatches(path: string, pathname: string): boolean {
  if (path === '/') return pathname === '/'
  return pathname === path || pathname.startsWith(`${path}/`)
}

function findActiveRouteIndex(items: NavItem[], pathname: string): number {
  return items.findIndex((item) => routeMatches(item.path, pathname))
}

function focusMainSearchOrContent() {
  requestAnimationFrame(() => {
    const main = document.querySelector('main')
    const search = main?.querySelector('input[type="search"]')
    if (search instanceof HTMLInputElement) {
      search.focus()
      return
    }
    const date = main?.querySelector('input[type="date"]')
    if (date instanceof HTMLInputElement) {
      date.focus()
      return
    }
    if (main instanceof HTMLElement) main.focus()
  })
}

export function SidebarNavProvider({
  visibleItems,
  children
}: {
  visibleItems: NavItem[]
  children: ReactNode
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarActive, setSidebarActive] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(0)
  const escHandlersRef = useRef<Set<() => boolean>>(new Set())
  const navLinkRefs = useRef<(HTMLAnchorElement | null)[]>([])

  const activeRouteIndex = useMemo(
    () => findActiveRouteIndex(visibleItems, location.pathname),
    [visibleItems, location.pathname]
  )

  const registerEscHandler = useCallback((handler: () => boolean) => {
    escHandlersRef.current.add(handler)
    return () => escHandlersRef.current.delete(handler)
  }, [])

  const setNavLinkRef = useCallback((index: number, node: HTMLAnchorElement | null) => {
    navLinkRefs.current[index] = node
  }, [])

  const focusSidebar = useCallback(() => {
    const idx = activeRouteIndex >= 0 ? activeRouteIndex : 0
    setHighlightIndex(idx)
    setSidebarActive(true)
  }, [activeRouteIndex])

  const blurSidebar = useCallback(() => {
    setSidebarActive(false)
    focusMainSearchOrContent()
  }, [])

  const moveHighlight = useCallback(
    (delta: 1 | -1) => {
      const enabledIndexes = visibleItems
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => !item.disabled)
        .map(({ index }) => index)

      if (enabledIndexes.length === 0) return

      setHighlightIndex((prev) => {
        const currentPos = enabledIndexes.indexOf(prev)
        const nextPos =
          currentPos < 0
            ? delta === 1
              ? 0
              : enabledIndexes.length - 1
            : (currentPos + delta + enabledIndexes.length) % enabledIndexes.length
        return enabledIndexes[nextPos]
      })
    },
    [visibleItems]
  )

  const activateNavItem = useCallback(
    (index: number) => {
      const item = visibleItems[index]
      if (!item || item.disabled) return
      navigate(item.path)
      setSidebarActive(false)
      requestAnimationFrame(() => focusMainSearchOrContent())
    },
    [navigate, visibleItems]
  )

  const handleNavLinkClick = useCallback(
    (index: number, disabled?: boolean) => {
      if (disabled) return
      setHighlightIndex(index)
      setSidebarActive(false)
    },
    []
  )

  useEffect(() => {
    if (!sidebarActive) return

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        moveHighlight(1)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        moveHighlight(-1)
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        activateNavItem(highlightIndex)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [sidebarActive, highlightIndex, moveHighlight, activateNavItem])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return

      if (sidebarActive) {
        e.preventDefault()
        blurSidebar()
        return
      }

      for (const handler of [...escHandlersRef.current].reverse()) {
        if (handler()) {
          e.preventDefault()
          return
        }
      }

      e.preventDefault()
      focusSidebar()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [sidebarActive, blurSidebar, focusSidebar])

  useLayoutEffect(() => {
    if (!sidebarActive) return
    navLinkRefs.current[highlightIndex]?.scrollIntoView({ block: 'nearest' })
    navLinkRefs.current[highlightIndex]?.focus()
  }, [sidebarActive, highlightIndex])

  useEffect(() => {
    if (sidebarActive) return
    const timer = setTimeout(() => focusMainSearchOrContent(), 100)
    return () => clearTimeout(timer)
  }, [location.pathname, sidebarActive])

  useEffect(() => {
    if (sidebarActive) return
    if (activeRouteIndex >= 0) setHighlightIndex(activeRouteIndex)
  }, [activeRouteIndex, sidebarActive])

  const value = useMemo<SidebarNavContextValue>(
    () => ({
      sidebarActive,
      highlightIndex,
      focusSidebar,
      blurSidebar,
      registerEscHandler,
      setNavLinkRef,
      isNavItemHighlighted: (index) => sidebarActive && index === highlightIndex,
      handleNavLinkClick,
      activateNavItem
    }),
    [
      sidebarActive,
      highlightIndex,
      focusSidebar,
      blurSidebar,
      registerEscHandler,
      setNavLinkRef,
      handleNavLinkClick,
      activateNavItem
    ]
  )

  return <SidebarNavContext.Provider value={value}>{children}</SidebarNavContext.Provider>
}

export function useSidebarNav() {
  const ctx = useContext(SidebarNavContext)
  if (!ctx) throw new Error('useSidebarNav must be used within SidebarNavProvider')
  return ctx
}
