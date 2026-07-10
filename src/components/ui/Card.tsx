import { cn } from '@/lib/utils'
import type { HTMLAttributes, ReactNode } from 'react'

export function Card({
  children,
  className,
  ...props
}: {
  children: ReactNode
  className?: string
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-xl border border-surface-border bg-white shadow-card', className)}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({
  title,
  description,
  action
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-surface-border px-6 py-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('p-6', className)}>{children}</div>
}

export function Badge({
  children,
  variant = 'default'
}: {
  children: ReactNode
  variant?: 'default' | 'success' | 'warning' | 'muted'
}) {
  const styles = {
    default: 'bg-brand-50 text-brand-700',
    success: 'bg-emerald-50 text-emerald-700',
    warning: 'bg-amber-50 text-amber-700',
    muted: 'bg-slate-100 text-slate-600'
  }
  return (
    <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium', styles[variant])}>
      {children}
    </span>
  )
}
