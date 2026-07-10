import { ClipboardList } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useInventarioActivo } from '@/context/InventarioActivoContext'
import { useAuth } from '@/context/AuthContext'

export function InventarioActivoBanner() {
  const { activo } = useInventarioActivo()
  const { hasPermiso } = useAuth()
  const navigate = useNavigate()

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
      className="shrink-0 border-b border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-950 lg:px-6"
      role="status"
      aria-live="polite"
    >
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
  )
}
