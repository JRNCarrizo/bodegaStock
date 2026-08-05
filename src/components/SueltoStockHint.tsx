import { formatCantidad, normalizarUnidadProducto } from '@/lib/desglose'
import { cn } from '@/lib/utils'

export function SueltoStockHint({
  cantidad,
  unidad,
  className
}: {
  cantidad: number
  unidad?: string | null
  className?: string
}) {
  if (!cantidad) return null
  const nombre = normalizarUnidadProducto(unidad)
  return (
    <p className={cn('text-[11px] font-medium text-slate-500', className)}>
      + {formatCantidad(cantidad)} {nombre}
      {cantidad === 1 ? '' : 's'} suelta{cantidad === 1 ? '' : 's'}
    </p>
  )
}
