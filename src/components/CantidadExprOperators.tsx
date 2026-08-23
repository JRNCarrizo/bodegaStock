import { type RefObject } from 'react'
import { focusCantidadExprInput, insertCantidadExprToken } from '@/lib/cantidadExpr'
import { cn } from '@/lib/utils'

const OPERATORS = [
  { label: '+', token: '+' },
  { label: '−', token: '−' },
  { label: '×', token: '×' },
  { label: '÷', token: '÷' }
] as const

export type CantidadExprTarget = {
  inputRef: RefObject<HTMLInputElement | null>
  value: string
  onChange: (next: string) => void
}

type CantidadExprOperatorsProps = {
  target: CantidadExprTarget | null
  className?: string
}

export function CantidadExprOperators({ target, className }: CantidadExprOperatorsProps) {
  function applyToken(token: string) {
    if (!target) return
    const input = target.inputRef.current
    const { next, caret } = insertCantidadExprToken(input, target.value, token)
    target.onChange(next)
    requestAnimationFrame(() => focusCantidadExprInput(input, caret))
  }

  return (
    <div
      className={cn('flex h-[2.875rem] w-full items-stretch gap-1', className)}
      role="group"
      aria-label="Operadores de cuenta"
    >
      {OPERATORS.map(({ label, token }) => (
        <button
          key={token}
          type="button"
          disabled={!target}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyToken(token)}
          className="flex flex-1 items-center justify-center rounded-xl border border-surface-border bg-slate-50 text-base font-semibold text-slate-700 transition-colors active:bg-slate-100 disabled:opacity-40"
          aria-label={`Insertar ${label}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
