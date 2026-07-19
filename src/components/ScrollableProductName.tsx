import { cn } from '@/lib/utils'

/** Nombre de producto con scroll horizontal (sin barra visible). El código queda fuera. */
export function ScrollableProductName({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('scrollbar-none-x min-w-0 overflow-x-auto whitespace-nowrap', className)}>
      {children}
    </div>
  )
}
