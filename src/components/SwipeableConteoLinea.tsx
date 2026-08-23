import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type SwipeableLineaLeftAction = {
  onClick: () => void
  ariaLabel: string
  icon?: ReactNode
  className?: string
}

const REVEAL_PX = 72
const ACTION_PX = 140
const TAP_SLOP_PX = 14
const AXIS_LOCK_PX = 8

type SwipeableConteoLineaProps = {
  children: ReactNode
  disabled?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onEdit: () => void
  onDelete?: () => void
  /** Reemplaza borrar (ej. poner cantidad en 0 en verificación de retornos). */
  leftAction?: SwipeableLineaLeftAction
  className?: string
  /** Fondo del panel deslizable (por defecto blanco). */
  contentClassName?: string
}

/**
 * Fila de conteo:
 * - Deslizar a la derecha → editar
 * - Deslizar a la izquierda → borrar
 */
export function SwipeableConteoLinea({
  children,
  disabled = false,
  open = false,
  onOpenChange,
  onEdit,
  onDelete,
  leftAction,
  className,
  contentClassName
}: SwipeableConteoLineaProps) {
  const leftHandler = leftAction?.onClick ?? onDelete
  const leftAriaLabel = leftAction?.ariaLabel ?? 'Borrar línea'
  const leftIcon = leftAction?.icon ?? <Trash2 className="h-5 w-5" />
  const leftClassName = leftAction?.className ?? 'bg-red-600 text-white'
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const startX = useRef(0)
  const startY = useRef(0)
  const startOffset = useRef(0)
  const axisLock = useRef<'x' | 'y' | null>(null)
  const offsetRef = useRef(0)
  const activePointer = useRef<number | null>(null)

  useEffect(() => {
    offsetRef.current = offset
  }, [offset])

  useEffect(() => {
    if (disabled) {
      setOffset(0)
      return
    }
    if (!open && !dragging) {
      setOffset(0)
    }
  }, [open, disabled, dragging])

  function commitOffset(next: number) {
    const clamped = Math.max(-(ACTION_PX + 40), Math.min(ACTION_PX + 40, next))
    setOffset(clamped)
    offsetRef.current = clamped
  }

  function finishSwipe() {
    setDragging(false)
    const x = offsetRef.current

    // Derecha → editar
    if (x >= ACTION_PX) {
      onOpenChange?.(false)
      setOffset(Math.max(ACTION_PX + 80, 220))
      window.setTimeout(() => {
        setOffset(0)
        onEdit()
      }, 140)
      return
    }
    if (x >= REVEAL_PX / 2) {
      setOffset(REVEAL_PX)
      onOpenChange?.(true)
      return
    }

    // Izquierda → acción secundaria (borrar o poner en 0)
    if (x <= -ACTION_PX) {
      onOpenChange?.(false)
      setOffset(-Math.max(ACTION_PX + 80, 220))
      window.setTimeout(() => leftHandler?.(), 140)
      return
    }
    if (x <= -REVEAL_PX / 2) {
      setOffset(-REVEAL_PX)
      onOpenChange?.(true)
      return
    }

    setOffset(0)
    onOpenChange?.(false)
  }

  function onPointerDown(e: React.PointerEvent) {
    if (disabled || e.button !== 0) return
    activePointer.current = e.pointerId
    startX.current = e.clientX
    startY.current = e.clientY
    startOffset.current = offsetRef.current
    axisLock.current = null
    setDragging(true)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging || disabled || activePointer.current !== e.pointerId) return
    const dx = e.clientX - startX.current
    const dy = e.clientY - startY.current

    if (!axisLock.current) {
      if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return
      axisLock.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      if (axisLock.current === 'y') return
    }
    if (axisLock.current !== 'x') return

    e.preventDefault()
    commitOffset(startOffset.current + dx)
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!dragging || activePointer.current !== e.pointerId) return
    activePointer.current = null
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }

    const dx = e.clientX - startX.current
    const dy = e.clientY - startY.current
    const dist = Math.hypot(dx, dy)
    const isTap = dist < TAP_SLOP_PX && axisLock.current !== 'x'

    setDragging(false)

    if (isTap) {
      // Tap con acción revelada → cerrar; tap normal → no hace nada
      if (Math.abs(startOffset.current) >= REVEAL_PX / 2) {
        setOffset(0)
        onOpenChange?.(false)
      }
      return
    }

    if (axisLock.current === 'x') {
      finishSwipe()
      return
    }

    axisLock.current = null
    setOffset(startOffset.current !== 0 ? startOffset.current : 0)
  }

  if (disabled) {
    return (
      <li
        className={cn(
          'flex items-center justify-between gap-3 rounded-lg border border-surface-border bg-white px-3 py-2.5 text-sm',
          className,
          contentClassName
        )}
      >
        {children}
      </li>
    )
  }

  return (
    <li
      className={cn(
        'relative overflow-hidden rounded-lg border border-surface-border bg-white text-sm',
        className
      )}
    >
      {/* Editar (derecha) */}
      <div
        className="absolute inset-y-0 left-0 flex w-[72px] items-center justify-center bg-brand-600 text-white"
        aria-hidden
      >
        <button
          type="button"
          className="flex h-full w-full items-center justify-center"
          aria-label="Editar línea"
          onClick={(e) => {
            e.stopPropagation()
            onOpenChange?.(false)
            setOffset(0)
            onEdit()
          }}
        >
          <Pencil className="h-5 w-5" />
        </button>
      </div>

      {/* Acción izquierda (borrar / poner en 0) */}
      {leftHandler && (
        <div
          className={cn(
            'absolute inset-y-0 right-0 flex w-[72px] items-center justify-center',
            leftClassName
          )}
          aria-hidden
        >
          <button
            type="button"
            className="flex h-full w-full items-center justify-center"
            aria-label={leftAriaLabel}
            onClick={(e) => {
              e.stopPropagation()
              onOpenChange?.(false)
              setOffset(0)
              leftHandler()
            }}
          >
            {leftIcon}
          </button>
        </div>
      )}

      <div
        className={cn(
          'relative z-10 flex items-center justify-between gap-3 bg-white px-3 py-2.5',
          'select-none',
          !dragging && 'transition-transform duration-200 ease-out',
          contentClassName
        )}
        style={{ transform: `translateX(${offset}px)`, touchAction: 'pan-y' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {children}
      </div>
    </li>
  )
}
