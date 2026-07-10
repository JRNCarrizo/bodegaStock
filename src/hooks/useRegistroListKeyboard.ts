import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { useSidebarNav } from '@/context/SidebarNavContext'
import { cn } from '@/lib/utils'
import { focusAndScrollIntoView } from '@/lib/scroll'

export function shouldAbrirFormularioConEnter(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return true
  if (target.closest('button, a, textarea, [contenteditable="true"]')) return false
  if (target instanceof HTMLInputElement && target.type === 'date') return false
  if (target instanceof HTMLSelectElement) return false
  return true
}

export function useRegistroListKeyboard<T extends { id: number }>(options: {
  enabled: boolean
  items: T[]
  listSearchRef: RefObject<HTMLInputElement | null>
  canCreate?: boolean
  onCreate?: () => void
  onOpenDetail: (item: T) => void
  /** Enter en el buscador (ej. movimientos → selector Enviar/Recibir) */
  onEnterFromSearch?: () => void
  /** Si hay ítems, Enter en el buscador posiciona en el primero (ej. movimientos del día) */
  enterPrioritizesListNavigation?: boolean
  /** Esc con resaltado activo: true = consumido sin volver al buscador */
  onEscFromHighlight?: () => boolean
}) {
  const {
    enabled,
    items,
    listSearchRef,
    canCreate = false,
    onCreate,
    onOpenDetail,
    onEnterFromSearch,
    onEscFromHighlight,
    enterPrioritizesListNavigation = false
  } = options

  const [highlightIndex, setHighlightIndex] = useState(-1)
  const keyboardNavRef = useRef(false)
  const { registerEscHandler, registerMainContentFocus } = useSidebarNav()

  const onCreateRef = useRef(onCreate)
  const onOpenDetailRef = useRef(onOpenDetail)
  const onEnterFromSearchRef = useRef(onEnterFromSearch)
  const onEscFromHighlightRef = useRef(onEscFromHighlight)
  const enterPrioritizesListRef = useRef(enterPrioritizesListNavigation)
  const itemsRef = useRef(items)
  const highlightRef = useRef(-1)

  onCreateRef.current = onCreate
  onOpenDetailRef.current = onOpenDetail
  onEnterFromSearchRef.current = onEnterFromSearch
  onEscFromHighlightRef.current = onEscFromHighlight
  enterPrioritizesListRef.current = enterPrioritizesListNavigation
  itemsRef.current = items
  highlightRef.current = highlightIndex

  useEffect(() => {
    setHighlightIndex(-1)
  }, [items])

  useEffect(() => {
    if (!enabled) setHighlightIndex(-1)
  }, [enabled])

  useLayoutEffect(() => {
    if (highlightIndex < 0) return
    keyboardNavRef.current = true
    const row = document.querySelector(`[data-registro-index="${highlightIndex}"]`)
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [highlightIndex])

  useEffect(() => {
    if (!enabled) return
    const onMouseMove = () => {
      keyboardNavRef.current = false
    }
    window.addEventListener('mousemove', onMouseMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMouseMove)
  }, [enabled])

  function focusSearch() {
    focusAndScrollIntoView(listSearchRef.current)
  }

  useLayoutEffect(() => {
    const el = listSearchRef.current
    if (!el || !enabled) return
    el.dataset.listSearch = 'true'
  }, [enabled, listSearchRef, items.length])

  useEffect(() => {
    if (!enabled) return
    return registerMainContentFocus(() => {
      const el = listSearchRef.current
      if (!el || el.disabled || el.readOnly) return false
      focusAndScrollIntoView(el)
      return true
    })
  }, [enabled, registerMainContentFocus, listSearchRef])

  useEffect(() => {
    if (!enabled || highlightIndex < 0) return
    return registerEscHandler(() => {
      if (onEscFromHighlightRef.current?.()) return true
      setHighlightIndex(-1)
      focusSearch()
      return true
    })
  }, [enabled, highlightIndex, registerEscHandler, listSearchRef])

  function startListNavigation() {
    if (itemsRef.current.length === 0) return false
    keyboardNavRef.current = true
    setHighlightIndex(0)
    listSearchRef.current?.blur()
    return true
  }

  function triggerEnterFromSearch() {
    if (enterPrioritizesListRef.current && startListNavigation()) return
    if (onEnterFromSearchRef.current) {
      onEnterFromSearchRef.current()
      return
    }
    if (canCreate && onCreateRef.current) {
      onCreateRef.current()
    }
  }

  function handleListSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      if (itemsRef.current.length === 0 || highlightRef.current >= 0) return
      e.preventDefault()
      startListNavigation()
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      triggerEnterFromSearch()
    }
  }

  useEffect(() => {
    if (!enabled) return

    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      const currentItems = itemsRef.current
      const idx = highlightRef.current

      if (idx >= 0 && currentItems.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          keyboardNavRef.current = true
          setHighlightIndex((i) => Math.min(i + 1, currentItems.length - 1))
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          keyboardNavRef.current = true
          if (idx <= 0) {
            setHighlightIndex(-1)
            focusSearch()
          } else {
            setHighlightIndex((i) => i - 1)
          }
          return
        }
        if (e.key === 'Enter') {
          e.preventDefault()
          const item = currentItems[idx]
          if (item) onOpenDetailRef.current(item)
          return
        }
        return
      }

      if (e.key === 'ArrowDown' && currentItems.length > 0) {
        if (e.target === listSearchRef.current) {
          e.preventDefault()
          startListNavigation()
        }
        return
      }

      if (e.key === 'Enter' && !e.repeat) {
        if (!shouldAbrirFormularioConEnter(e.target)) return
        e.preventDefault()
        triggerEnterFromSearch()
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [enabled, listSearchRef])

  function listItemProps(index: number, className?: string) {
    return {
      'data-registro-index': index,
      className: cn(
        className,
        highlightIndex === index && 'bg-brand-50 ring-2 ring-inset ring-brand-200'
      ),
      onMouseEnter: () => {
        if (keyboardNavRef.current) return
        setHighlightIndex(index)
      }
    }
  }

  return {
    highlightIndex,
    handleListSearchKeyDown,
    listItemProps,
    clearHighlight: () => setHighlightIndex(-1)
  }
}
