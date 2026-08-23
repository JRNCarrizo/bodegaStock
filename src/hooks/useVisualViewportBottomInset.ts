import { useEffect, useRef, useState } from 'react'

/**
 * Distancia (px) que el teclado / chrome del viewport tapa desde abajo.
 * Sirve para subir un bottom-sheet y que no quede detrás del teclado móvil.
 *
 * Con `adjustResize` suele ser ~0 (el layout ya se achicó); el sheet se apoya
 * en el borde inferior del viewport redimensionado.
 */
export function useVisualViewportBottomInset(): number {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const update = () => {
      const covered = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
      setInset(covered)
    }

    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  return inset
}

/**
 * Cuánto achicó el layout por el teclado (`adjustResize`: baseline − innerHeight).
 * Sirve para anclar un footer al borde físico de la pantalla (debajo del teclado)
 * con `transform: translateY(layoutShrink)`.
 */
export function useKeyboardLayoutShrink(): number {
  const [shrink, setShrink] = useState(0)
  const baselineRef = useRef(0)

  useEffect(() => {
    baselineRef.current = window.innerHeight

    const update = () => {
      const h = window.innerHeight
      if (h > baselineRef.current) baselineRef.current = h
      setShrink(Math.max(0, Math.round(baselineRef.current - h)))
    }

    const resetBaseline = () => {
      baselineRef.current = window.innerHeight
      setShrink(0)
    }

    update()
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', resetBaseline)
    const vv = window.visualViewport
    vv?.addEventListener('resize', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', resetBaseline)
      vv?.removeEventListener('resize', update)
    }
  }, [])

  return shrink
}

/** Tras abrir el teclado, centra el campo enfocado dentro del sheet. */
export function scrollFocusedFieldIntoSheet(el: HTMLElement | null, delayMs = 280) {
  if (!el) return
  window.setTimeout(() => {
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, delayMs)
}
