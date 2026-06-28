import { Boxes, Package, Search, Truck, Users, Warehouse, ClipboardList } from 'lucide-react'
import { Card, CardBody } from '@/components/ui/Card'
import { useAuth } from '@/context/AuthContext'

const modules = [
  {
    title: 'Productos',
    description: 'Catálogo, códigos e imágenes',
    icon: Package,
    status: 'Disponible'
  },
  {
    title: 'Sectores',
    description: 'Ubicaciones y sectores de descuento',
    icon: Warehouse,
    status: 'Disponible'
  },
  {
    title: 'Consulta',
    description: 'Buscar productos y ver stock por sector',
    icon: Search,
    status: 'Disponible'
  },
  {
    title: 'Camioneros',
    description: 'Transportistas, empresas y vehículos',
    icon: Truck,
    status: 'Disponible'
  },
  {
    title: 'Usuarios',
    description: 'Cuentas y permisos',
    icon: Users,
    status: 'Disponible'
  },
  {
    title: 'Ingresos',
    description: 'Entrada de mercadería por remito',
    icon: Boxes,
    status: 'Disponible'
  },
  {
    title: 'Planillas',
    description: 'Salidas con camionero asignado',
    icon: ClipboardList,
    status: 'Disponible'
  }
]

export function DashboardPage() {
  const { user } = useAuth()

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Hola, {user?.nombre?.split(' ')[0]}
        </h1>
        <p className="mt-1 text-slate-500">
          BodegaStock — desarrollo por secciones. Empezamos con usuarios y base del sistema.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {modules.map((mod) => (
          <Card key={mod.title}>
            <CardBody className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <mod.icon className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-slate-900">{mod.title}</h3>
                  <span
                    className={
                      mod.status === 'Disponible'
                        ? 'rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700'
                        : 'rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500'
                    }
                  >
                    {mod.status}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-500">{mod.description}</p>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      <Card>
        <CardBody>
          <h3 className="font-semibold text-slate-900">Plan de desarrollo</h3>
          <ol className="mt-3 space-y-2 text-sm text-slate-600">
            <li className="flex gap-2"><span className="font-medium text-brand-600">1.</span> Base + Login + Usuarios ✓</li>
            <li className="flex gap-2"><span className="font-medium text-brand-600">2.</span> Productos ✓</li>
            <li className="flex gap-2"><span className="font-medium text-brand-600">3.</span> Sectores ✓</li>
            <li className="flex gap-2"><span className="font-medium text-brand-600">4.</span> Consulta ✓</li>
            <li className="flex gap-2"><span className="font-medium text-brand-600">5.</span> Camioneros ✓</li>
            <li className="flex gap-2"><span className="font-medium text-brand-600">6.</span> Ingresos ✓</li>
            <li className="flex gap-2"><span className="font-medium text-brand-600">7.</span> Planillas ✓</li>
            <li className="flex gap-2"><span className="font-medium text-brand-600">8.</span> Retornos + Roturas ← <em>siguiente</em></li>
            <li className="flex gap-2"><span className="font-medium text-slate-400">9.</span> Reportes + Inventario + App móvil</li>
          </ol>
        </CardBody>
      </Card>
    </div>
  )
}
