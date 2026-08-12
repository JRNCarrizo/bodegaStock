import { cn } from '@/lib/utils'
import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode
  error?: string
  leading?: ReactNode
  trailing?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, leading, trailing, className, id, ...props },
  ref
) {
  const inputId =
    id ?? (typeof label === 'string' ? label.toLowerCase().replace(/\s/g, '-') : undefined)
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-slate-700">
          {label}
        </label>
      )}
      <div className="relative">
        {leading && (
          <div className="pointer-events-none absolute inset-y-0 left-0 z-[1] flex items-center pl-2.5 text-slate-400">
            {leading}
          </div>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'w-full rounded-lg border border-surface-border bg-white py-2 text-sm text-slate-900',
            'placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20',
            error && 'border-red-400 focus:border-red-500 focus:ring-red-500/20',
            className,
            // Padding después de className para que no lo pise un `px-*` del caller
            leading ? 'pl-9' : 'pl-3',
            trailing ? 'pr-10' : 'pr-3'
          )}
          {...props}
        />
        {trailing && (
          <div className="absolute inset-y-0 right-0 z-[1] flex items-center pr-1.5">{trailing}</div>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
})
