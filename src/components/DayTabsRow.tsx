import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatDayTabLabel } from '@/lib/desglose'

type DayTabsRowProps = {
  days: string[]
  selectedDay: string
  onSelectDay: (day: string) => void
  getCount?: (day: string) => number
  /** Cantidad sin verificar — muestra un punto ámbar en la pestaña */
  getPendingCount?: (day: string) => number
  /** En este día no se muestra el punto (ej. hoy) */
  hidePendingDotOnDay?: string
}

export function DayTabsRow({
  days,
  selectedDay,
  onSelectDay,
  getCount,
  getPendingCount,
  hidePendingDotOnDay
}: DayTabsRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateScrollButtons = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const { scrollLeft, scrollWidth, clientWidth } = el
    setCanScrollLeft(scrollLeft > 2)
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 2)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    updateScrollButtons()
    const ro = new ResizeObserver(updateScrollButtons)
    ro.observe(el)
    el.addEventListener('scroll', updateScrollButtons, { passive: true })
    return () => {
      ro.disconnect()
      el.removeEventListener('scroll', updateScrollButtons)
    }
  }, [days, updateScrollButtons])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const tab = el.querySelector(`[data-day-tab="${selectedDay}"]`)
    if (tab instanceof HTMLElement) {
      tab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    }
  }, [selectedDay, days])

  function scrollBy(direction: 'left' | 'right') {
    scrollRef.current?.scrollBy({ left: direction === 'left' ? -220 : 220, behavior: 'smooth' })
  }

  if (days.length === 0) return null

  return (
    <div className="flex min-w-0 items-center gap-0.5">
      {canScrollLeft && (
        <button
          type="button"
          aria-label="Ver días anteriores"
          onClick={() => scrollBy('left')}
          className="flex h-9 w-8 shrink-0 items-center justify-center rounded-lg border border-surface-border bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}

      <div
        ref={scrollRef}
        className="flex min-w-0 flex-1 flex-nowrap gap-1 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {days.map((dia) => {
          const active = dia === selectedDay
          const count = getCount?.(dia) ?? 0
          const pending = getPendingCount?.(dia) ?? 0
          const showPendingDot = pending > 0 && dia !== hidePendingDotOnDay
          return (
            <button
              key={dia}
              type="button"
              data-day-tab={dia}
              onClick={() => onSelectDay(dia)}
              className={`relative flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                active
                  ? 'border-brand-500 bg-brand-50 font-semibold text-brand-800 shadow-sm'
                  : pending > 0
                    ? 'border-amber-200 bg-amber-50/60 text-slate-700 hover:border-amber-300 hover:bg-amber-50'
                    : 'border-surface-border bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              {showPendingDot && (
                <span
                  className="inline-flex h-2 w-2 shrink-0 rounded-full bg-amber-500"
                  title={`${pending} sin verificar`}
                  aria-hidden
                />
              )}
              <span>{formatDayTabLabel(dia)}</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${
                  active ? 'bg-brand-200 text-brand-900' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {canScrollRight && (
        <button
          type="button"
          aria-label="Ver días siguientes"
          onClick={() => scrollBy('right')}
          className="flex h-9 w-8 shrink-0 items-center justify-center rounded-lg border border-surface-border bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
