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
