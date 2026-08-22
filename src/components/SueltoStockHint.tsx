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
  const nombre = normalizarUnidadProducto(unidad)
  const label = `+ ${formatCantidad(cantidad || 0)} ${nombre}${cantidad === 1 ? '' : 's'}`

  // Siempre reserva la misma altura: sin botellerío el texto queda invisible
  // para que Reorganizar / totales queden alineados entre filas.
  if (!cantidad) {
    return (
      <p
        className={cn('invisible text-[11px] font-medium leading-snug', className)}
        aria-hidden
      >
        {label}
      </p>
    )
  }

  return (
    <p className={cn('text-[11px] font-medium leading-snug text-slate-500', className)}>
      {label}
    </p>
  )
}
