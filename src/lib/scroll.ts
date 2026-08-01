export function scrollElementFullyIntoView(el: HTMLElement, margin = 20) {
  let scrollParent: HTMLElement | null = el.parentElement
  while (scrollParent) {
    const { overflowY } = getComputedStyle(scrollParent)
    if (/(auto|scroll|overlay)/.test(overflowY) && scrollParent.scrollHeight > scrollParent.clientHeight) {
      break
    }
    scrollParent = scrollParent.parentElement
  }

  const container = scrollParent
  if (!container) {
    el.scrollIntoView({ block: 'nearest' })
    return
  }

  const elRect = el.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  const overflowBottom = elRect.bottom - containerRect.bottom + margin
  const overflowTop = containerRect.top + margin - elRect.top

  if (overflowBottom > 0) {
    container.scrollTop += overflowBottom
  } else if (overflowTop > 0) {
    container.scrollTop -= overflowTop
  }
}

export function focusAndScrollIntoView(el: HTMLElement | null | undefined, margin = 20) {
  if (!el) return
  el.focus({ preventScroll: true })
  requestAnimationFrame(() => scrollElementFullyIntoView(el, margin))
}

function findScrollParent(el: HTMLElement): HTMLElement | null {
  let scrollParent: HTMLElement | null = el.parentElement
  while (scrollParent) {
    const { overflowY } = getComputedStyle(scrollParent)
    if (
      /(auto|scroll|overlay)/.test(overflowY) &&
      scrollParent.scrollHeight > scrollParent.clientHeight + 1
    ) {
      return scrollParent
    }
    scrollParent = scrollParent.parentElement
  }
  return null
}

/**
 * Deja el producto (último cargado) visible dentro de la lista aunque el teclado
 * virtual tape la parte baja de la pantalla. Alinea el bloque cerca del borde
 * inferior del área realmente visible (visualViewport).
 */
export function scrollProductoIntoListVisible(
  listEl: HTMLElement | null | undefined,
  productoId: number | null | undefined,
  opts?: { behavior?: ScrollBehavior; marginBottom?: number; delayMs?: number }
) {
  if (!listEl || productoId == null) return

  const behavior = opts?.behavior ?? 'smooth'
  const marginBottom = opts?.marginBottom ?? 20
  const delayMs = opts?.delayMs ?? 280

  const run = () => {
    const el = listEl.querySelector(
      `[data-producto-id="${productoId}"]`
    ) as HTMLElement | null
    if (!el) {
      listEl.scrollTo({ top: listEl.scrollHeight, behavior })
      return
    }

    const container = findScrollParent(el) ?? listEl
    const vv = window.visualViewport
    const visibleBottom = vv ? vv.offsetTop + vv.height : window.innerHeight
    const visibleTop = vv ? vv.offsetTop : 0

    const elRect = el.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    const targetBottom = Math.min(containerRect.bottom, visibleBottom) - marginBottom

    const delta = elRect.bottom - targetBottom
    if (Math.abs(delta) > 2) {
      const nextTop = container.scrollTop + delta
      if (behavior === 'smooth') {
        container.scrollTo({ top: nextTop, behavior: 'smooth' })
      } else {
        container.scrollTop = nextTop
      }
    }

    // Si el bloque es muy alto, al menos que se vea el inicio del producto
    requestAnimationFrame(() => {
      const after = el.getBoundingClientRect()
      const topLimit = Math.max(containerRect.top, visibleTop) + 8
      if (after.top < topLimit) {
        container.scrollTop -= topLimit - after.top
      }
    })
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(run)
  })
  window.setTimeout(run, delayMs)
}
