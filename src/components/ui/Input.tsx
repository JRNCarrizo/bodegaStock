import { cn } from '@/lib/utils'
import { forwardRef, type InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, className, id, ...props },
  ref
) {
  const inputId = id ?? label?.toLowerCase().replace(/\s/g, '-')
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-slate-700">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={cn(
          'w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-sm text-slate-900',
          'placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20',
          error && 'border-red-400 focus:border-red-500 focus:ring-red-500/20',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
})
