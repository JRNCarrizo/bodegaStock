import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Boxes,
  ChevronRight,
  ClipboardList,
  Search,
  Sparkles
} from 'lucide-react'
import { NAV_ICONS, NAV_ITEMS } from '@/config/navigation'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/utils'
import type { NavItem } from '@/types'

const MODULE_DESCRIPTIONS: Record<string, string> = {
  consulta: 'Buscar productos y ver stock por sector',
  productos: 'Catálogo, códigos de barras e imágenes',
  sectores: 'Ubicaciones y sectores de descuento',
  ingresos: 'Entrada de mercadería por remito',
  planillas: 'Salidas con camionero asignado',
  retornos: 'Devoluciones y mercadería que vuelve',
  roturas: 'Pérdidas, roturas y mermas',
  movimientos: 'Traslados y ajustes entre sectores',
  inventario: 'Conteo físico y cierre de inventario',
  camioneros: 'Transportistas, empresas y vehículos',
  usuarios: 'Cuentas, roles y permisos',
  reportes: 'Resumen de movimientos del día'
}

const QUICK_LINK_IDS = ['consulta', 'ingresos', 'planillas'] as const

const GROUP_STYLES: Record<
  string,
  { iconBg: string; iconText: string; hoverBorder: string }
> = {
  General: {
    iconBg: 'bg-brand-50 group-hover:bg-brand-100',
    iconText: 'text-brand-600',
    hoverBorder: 'hover:border-brand-200'
  },
  Catálogo: {
    iconBg: 'bg-violet-50 group-hover:bg-violet-100',
    iconText: 'text-violet-600',
    hoverBorder: 'hover:border-violet-200'
  },
  Movimientos: {
    iconBg: 'bg-emerald-50 group-hover:bg-emerald-100',
    iconText: 'text-emerald-600',
    hoverBorder: 'hover:border-emerald-200'
  },
  Inventario: {
    iconBg: 'bg-amber-50 group-hover:bg-amber-100',
    iconText: 'text-amber-600',
    hoverBorder: 'hover:border-amber-200'
  },
  Administración: {
    iconBg: 'bg-slate-100 group-hover:bg-slate-200/70',
    iconText: 'text-slate-600',
    hoverBorder: 'hover:border-slate-300'
  },
  Reportes: {
    iconBg: 'bg-orange-50 group-hover:bg-orange-100',
    iconText: 'text-orange-600',
    hoverBorder: 'hover:border-orange-200'
  }
}

const QUICK_LINK_STYLES = [
  {
    id: 'consulta',
    gradient: 'from-brand-600 to-brand-700',
    icon: Search
  },
  {
    id: 'ingresos',
    gradient: 'from-emerald-600 to-emerald-700',
    icon: Boxes
  },
  {
    id: 'planillas',
    gradient: 'from-violet-600 to-violet-700',
    icon: ClipboardList
  }
] as const

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Buenos días'
  if (hour < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

function formatToday(): string {
  return new Date().toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  })
}

function ModuleCard({ item }: { item: NavItem }) {
  const Icon = NAV_ICONS[item.id] ?? Boxes
  const styles = GROUP_STYLES[item.group] ?? GROUP_STYLES.General
  const description = MODULE_DESCRIPTIONS[item.id] ?? item.label

  if (item.disabled) {
    return (
      <div
        className={cn(
          'relative flex h-full flex-col rounded-xl border border-dashed border-surface-border bg-white/60 p-4 opacity-70',
          styles.hoverBorder
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors',
              styles.iconBg
            )}
          >
            <Icon className={cn('h-5 w-5', styles.iconText)} />
          </div>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Próximamente
          </span>
        </div>
        <h3 className="mt-4 font-semibold text-slate-700">{item.label}</h3>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">{description}</p>
      </div>
    )
  }

  return (
    <Link
      to={item.path}
      className={cn(
        'group relative flex h-full flex-col rounded-xl border border-surface-border bg-white p-4 shadow-card transition-all duration-200',
        'hover:-translate-y-0.5 hover:shadow-panel',
        styles.hoverBorder
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors',
            styles.iconBg
          )}
        >
          <Icon className={cn('h-5 w-5', styles.iconText)} />
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-500" />
      </div>
      <h3 className="mt-4 font-semibold text-slate-900 group-hover:text-brand-700">{item.label}</h3>
      <p className="mt-1 text-sm leading-relaxed text-slate-500">{description}</p>
    </Link>
  )
}

export function DashboardPage() {
  const { user, hasPermiso } = useAuth()
  const firstName = user?.nombre?.split(' ')[0] ?? 'Usuario'

  const visibleItems = useMemo(
    () =>
      NAV_ITEMS.filter(
        (item) => item.id !== 'dashboard' && (!item.permiso || hasPermiso(item.permiso))
      ),
    [hasPermiso]
  )

  const quickLinks = useMemo(
    () =>
      QUICK_LINK_STYLES.map((quick) => {
        const item = visibleItems.find((nav) => nav.id === quick.id && !nav.disabled)
        return item ? { ...quick, item } : null
      }).filter(Boolean) as Array<(typeof QUICK_LINK_STYLES)[number] & { item: NavItem }>,
    [visibleItems]
  )

  const groups = useMemo(
    () => [...new Set(visibleItems.map((item) => item.group))],
    [visibleItems]
  )

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <section className="relative overflow-hidden rounded-2xl border border-brand-200/50 bg-gradient-to-br from-brand-800 via-brand-600 to-brand-700 px-6 py-8 text-white shadow-panel sm:px-8 sm:py-10">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 15% 25%, white 1px, transparent 1px), radial-gradient(circle at 85% 70%, white 1px, transparent 1px)',
            backgroundSize: '40px 40px'
          }}
        />
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-1/4 h-48 w-48 rounded-full bg-brand-400/20 blur-3xl" />

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-brand-50 ring-1 ring-white/15">
              <Sparkles className="h-3.5 w-3.5" />
              ControlStock · Bodega Esmeralda
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
              {getGreeting()}, {firstName}
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-brand-50/90 sm:text-base">
              Panel de operaciones diarias: consultá stock, registrá ingresos, armá planillas y
              gestioná la bodega desde un solo lugar.
            </p>
          </div>

          <div className="shrink-0 rounded-xl bg-white/10 px-4 py-3 ring-1 ring-white/15 backdrop-blur-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-100">
              Hoy
            </p>
            <p className="mt-0.5 text-sm font-medium capitalize text-white">{formatToday()}</p>
          </div>
        </div>
      </section>

      {quickLinks.length > 0 && (
        <section>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
                Accesos rápidos
              </h2>
              <p className="mt-0.5 text-sm text-slate-500">Las tareas más frecuentes del día</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {quickLinks.map(({ id, gradient, icon: QuickIcon, item }) => (
              <Link
                key={id}
                to={item.path}
                className={cn(
                  'group relative overflow-hidden rounded-xl bg-gradient-to-br p-5 text-white shadow-panel transition-transform duration-200 hover:-translate-y-0.5',
                  gradient
                )}
              >
                <div className="pointer-events-none absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
                <div className="relative flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-white/75">
                      Ir a
                    </p>
                    <p className="mt-1 text-lg font-semibold">{item.label}</p>
                  </div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
                    <QuickIcon className="h-5 w-5" />
                  </div>
                </div>
                <div className="relative mt-4 inline-flex items-center gap-1 text-sm font-medium text-white/90">
                  Abrir
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-8">
        {groups.map((group) => {
          const items = visibleItems.filter((item) => item.group === group)
          if (items.length === 0) return null

          return (
            <div key={group}>
              <div className="mb-4 flex items-center gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
                  {group}
                </h2>
                <div className="h-px flex-1 bg-surface-border" />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((item) => (
                  <ModuleCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          )
        })}
      </section>

      {visibleItems.length === 0 && (
        <div className="rounded-xl border border-dashed border-surface-border bg-white px-6 py-10 text-center">
          <p className="text-sm font-medium text-slate-700">Sin módulos disponibles</p>
          <p className="mt-1 text-sm text-slate-500">
            Tu usuario no tiene permisos asignados. Contactá al administrador.
          </p>
        </div>
      )}
    </div>
  )
}
