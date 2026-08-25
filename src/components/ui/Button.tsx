import { cn } from '@/lib/utils'
import { useLogisticaTheme } from '@/context/LogisticaThemeContext'
import { forwardRef, type ButtonHTMLAttributes } from 'react'

const variants = {
  primary: '', // se completa con el tema de logística
  secondary: 'bg-white text-slate-700 border border-surface-border hover:bg-slate-50',
  ghost: 'text-slate-600 hover:bg-slate-100',
  danger: 'bg-red-600 text-white hover:bg-red-700'
} as const

const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base'
} as const

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants
  size?: keyof typeof sizes
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', ...props },
  ref
) {
  const theme = useLogisticaTheme()
  const variantClass =
    variant === 'primary' ? theme.btnPrimary : variants[variant]
  const focusClass =
    variant === 'primary' ? theme.btnPrimaryFocus : 'focus-visible:ring-brand-500'

  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        focusClass,
        'disabled:pointer-events-none disabled:opacity-50',
        variantClass,
        sizes[size],
        className
      )}
      {...props}
    />
  )
})
