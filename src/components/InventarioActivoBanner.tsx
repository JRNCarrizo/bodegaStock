import { useState } from 'react'
import { ChevronDown, ClipboardList } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useInventarioActivo } from '@/context/InventarioActivoContext'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/utils'

export function InventarioActivoBanner() {
  const { activo } = useInventarioActivo()
  const { hasPermiso } = useAuth()
  const navigate = useNavigate()
  const [abierto, setAbierto] = useState(false)

  if (!activo || activo.estado !== 'EN_PROGRESO') return null

  const puedeIrInventario =
    hasPermiso('inventario.ver') ||
    hasPermiso('inventario.contar') ||
    hasPermiso('inventario.supervisar') ||
    hasPermiso('inventario.crear_sesion')

  const progreso =
    activo.sectores_total > 0
      ? `${activo.sectores_ok} / ${activo.sectores_total} sectores OK`
      : null

  return (
    <div
      className="shrink-0 border-b border-amber-300 bg-amber-50 text-sm text-amber-950"
      role="status"
      aria-live="polite"
    >
      {/* Móvil: una línea + detalle desplegable */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className="flex w-full items-center gap-2 px-4 py-1.5 text-left"
          aria-expanded={abierto}
        >
          <ClipboardList className="h-4 w-4 shrink-0 text-amber-700" aria-hidden />
          <span className="min-w-0 flex-1 truncate">
            <strong>Inventario en curso:</strong> {activo.nombre}
          </span>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-amber-700 transition-transform',
              abierto && 'rotate-180'
            )}
            aria-hidden
          />
        </button>
        {abierto && (
          <div className="space-y-2 border-t border-amber-200/80 px-4 py-2">
            <p className="text-xs text-amber-800">Movimientos de stock suspendidos</p>
            {progreso && (
              <p className="inline-flex rounded-full bg-amber-100/80 px-2 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-amber-200/80">
                {progreso}
              </p>
            )}
            {puedeIrInventario && (
              <button
                type="button"
                onClick={() => navigate('/inventario')}
                className="block text-sm font-medium text-amber-900 underline decoration-amber-400/80 underline-offset-2 hover:text-amber-950"
              >
                Ir a inventario
              </button>
            )}
          </div>
        )}
      </div>

      {/* PC: banner completo como antes */}
      <div className="hidden px-4 py-2.5 lg:block lg:px-6">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <ClipboardList className="h-4 w-4 shrink-0 text-amber-700" aria-hidden />
            <span>
              <strong>Inventario en curso:</strong> {activo.nombre}
            </span>
            <span className="text-amber-800">— Movimientos de stock suspendidos</span>
            {progreso && (
              <span className="rounded-full bg-amber-100/80 px-2 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-amber-200/80">
                {progreso}
              </span>
            )}
          </p>
          {puedeIrInventario && (
            <button
              type="button"
              onClick={() => navigate('/inventario')}
              className="shrink-0 text-sm font-medium text-amber-900 underline decoration-amber-400/80 underline-offset-2 hover:text-amber-950"
            >
              Ir a inventario
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
