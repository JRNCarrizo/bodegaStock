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
import { focusAndScrollIntoView } from '@/lib/scroll'
import type { NavItem } from '@/types'

type SidebarNavContextValue = {
  sidebarActive: boolean
  highlightIndex: number
  focusSidebar: () => void
  blurSidebar: () => void
  registerEscHandler: (handler: () => boolean) => () => void
  registerMainContentFocus: (handler: () => boolean) => () => void
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

function blurFocusOutsideMain(main: HTMLElement) {
  const active = document.activeElement
  if (!(active instanceof HTMLElement)) return
  if (main.contains(active)) return
  active.blur()
}

function focusMainSearchOrContent(mainFocusHandlers: Set<() => boolean>) {
  const main = document.querySelector('main')
  if (!main) return

  blurFocusOutsideMain(main)

  const active = document.activeElement
  if (active instanceof HTMLElement && main.contains(active)) {
    if (active.closest('[data-reporte-card]')) return
    if (active.closest('[data-list-search]')) return
    const input = active instanceof HTMLInputElement ? active : null
    if (input?.type === 'search' && !input.disabled && !input.readOnly) return
  }

  const tryFocus = (): boolean => {
    for (const handler of [...mainFocusHandlers].reverse()) {
      if (handler()) return true
    }
    const search =
      main.querySelector<HTMLInputElement>('[data-list-search]') ??
      main.querySelector<HTMLInputElement>('input[type="search"]')
    if (search && !search.disabled && !search.readOnly) {
      focusAndScrollIntoView(search)
      return true
    }
    return false
  }

  let attempts = 0
  const retry = () => {
    if (tryFocus()) return
    attempts += 1
    if (attempts < 6) requestAnimationFrame(retry)
  }

  requestAnimationFrame(retry)
  window.setTimeout(tryFocus, 50)
  window.setTimeout(tryFocus, 150)
  window.setTimeout(tryFocus, 350)
  window.setTimeout(tryFocus, 600)
}

export function SidebarNavProvider({
  visibleItems,
  children,
  sidebarCollapsed = false,
  setSidebarCollapsed
}: {
  visibleItems: NavItem[]
  children: ReactNode
  sidebarCollapsed?: boolean
  setSidebarCollapsed?: (collapsed: boolean) => void
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarActive, setSidebarActive] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(0)
  const escHandlersRef = useRef<Set<() => boolean>>(new Set())
  const mainFocusHandlersRef = useRef<Set<() => boolean>>(new Set())
  const navLinkRefs = useRef<(HTMLAnchorElement | null)[]>([])

  const activeRouteIndex = useMemo(
    () => findActiveRouteIndex(visibleItems, location.pathname),
    [visibleItems, location.pathname]
  )

  const registerEscHandler = useCallback((handler: () => boolean) => {
    escHandlersRef.current.add(handler)
    return () => escHandlersRef.current.delete(handler)
  }, [])

  const registerMainContentFocus = useCallback((handler: () => boolean) => {
    mainFocusHandlersRef.current.add(handler)
    return () => mainFocusHandlersRef.current.delete(handler)
  }, [])

  const setNavLinkRef = useCallback((index: number, node: HTMLAnchorElement | null) => {
    navLinkRefs.current[index] = node
  }, [])

  const focusSidebar = useCallback(() => {
    const idx = activeRouteIndex >= 0 ? activeRouteIndex : 0
    setHighlightIndex(idx)
    setSidebarActive(true)
    requestAnimationFrame(() => {
      navLinkRefs.current[idx]?.focus({ preventScroll: true })
    })
  }, [activeRouteIndex])

  const blurSidebar = useCallback(() => {
    setSidebarActive(false)
    focusMainSearchOrContent(mainFocusHandlersRef.current)
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
      ;(document.activeElement as HTMLElement | null)?.blur()
      requestAnimationFrame(() => focusMainSearchOrContent(mainFocusHandlersRef.current))
    },
    [navigate, visibleItems]
  )

  const handleNavLinkClick = useCallback(
    (index: number, disabled?: boolean) => {
      if (disabled) return
      setHighlightIndex(index)
      setSidebarActive(false)
      ;(document.activeElement as HTMLElement | null)?.blur()
      requestAnimationFrame(() => focusMainSearchOrContent(mainFocusHandlersRef.current))
    },
    []
  )

  useEffect(() => {
    function onFocusIn(e: FocusEvent) {
      if (!(e.target instanceof HTMLElement)) return
      const main = document.querySelector('main')
      if (!main?.contains(e.target)) return
      setSidebarActive(false)
    }

    document.addEventListener('focusin', onFocusIn)
    return () => document.removeEventListener('focusin', onFocusIn)
  }, [])

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
      if (e.key === 'ArrowLeft' && setSidebarCollapsed) {
        if (window.matchMedia('(min-width: 1024px)').matches && !sidebarCollapsed) {
          e.preventDefault()
          setSidebarCollapsed(true)
        }
        return
      }
      if (e.key === 'ArrowRight' && setSidebarCollapsed) {
        if (window.matchMedia('(min-width: 1024px)').matches && sidebarCollapsed) {
          e.preventDefault()
          setSidebarCollapsed(false)
        }
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        activateNavItem(highlightIndex)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    sidebarActive,
    highlightIndex,
    moveHighlight,
    activateNavItem,
    sidebarCollapsed,
    setSidebarCollapsed
  ])

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

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [sidebarActive, blurSidebar, focusSidebar])

  useLayoutEffect(() => {
    if (!sidebarActive) return
    navLinkRefs.current[highlightIndex]?.scrollIntoView({ block: 'nearest' })
    navLinkRefs.current[highlightIndex]?.focus()
  }, [sidebarActive, highlightIndex])

  useLayoutEffect(() => {
    if (sidebarActive) return
    focusMainSearchOrContent(mainFocusHandlersRef.current)
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
      registerMainContentFocus,
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
      registerMainContentFocus,
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
