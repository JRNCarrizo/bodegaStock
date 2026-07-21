import { useEffect, useState } from 'react'

/**
 * Distancia (px) que el teclado / chrome del viewport tapa desde abajo.
 * Sirve para subir un bottom-sheet y que no quede detrás del teclado móvil.
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

/** Tras abrir el teclado, centra el campo enfocado dentro del sheet. */
export function scrollFocusedFieldIntoSheet(el: HTMLElement | null, delayMs = 280) {
  if (!el) return
  window.setTimeout(() => {
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, delayMs)
}
