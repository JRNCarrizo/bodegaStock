import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  BarChart3,
  Boxes,
  ChevronRight,
  ClipboardList,
  LayoutGrid,
  Search,
  Sparkles
} from 'lucide-react'
import { NAV_ICONS, NAV_ITEMS } from '@/config/navigation'
import { useAuth } from '@/context/AuthContext'
import { useSidebarNav } from '@/context/SidebarNavContext'
import { Card } from '@/components/ui/Card'
import { shouldAbrirFormularioConEnter } from '@/hooks/useRegistroListKeyboard'
import { cn } from '@/lib/utils'
import { focusAndScrollIntoView } from '@/lib/scroll'
import type { NavItem } from '@/types'
import { navItemVisible } from '@/types'

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

const QUICK_LINK_IDS = ['consulta', 'planillas', 'reportes'] as const

const GROUP_STYLES: Record<
  string,
  { card: string; iconBox: string; hoverBorder: string }
> = {
  General: {
    card: 'border-brand-200/80 bg-white',
    iconBox: 'bg-brand-600 text-white shadow-sm',
    hoverBorder: 'hover:border-brand-300'
  },
  Catálogo: {
    card: 'border-violet-200/80 bg-white',
    iconBox: 'bg-violet-600 text-white shadow-sm',
    hoverBorder: 'hover:border-violet-300'
  },
  Movimientos: {
    card: 'border-emerald-200/80 bg-white',
    iconBox: 'bg-emerald-600 text-white shadow-sm',
    hoverBorder: 'hover:border-emerald-300'
  },
  Inventario: {
    card: 'border-amber-200/80 bg-white',
    iconBox: 'bg-amber-600 text-white shadow-sm',
    hoverBorder: 'hover:border-amber-300'
  },
  Administración: {
    card: 'border-slate-200 bg-white',
    iconBox: 'bg-slate-600 text-white shadow-sm',
    hoverBorder: 'hover:border-slate-300'
  },
  Reportes: {
    card: 'border-orange-200/80 bg-white',
    iconBox: 'bg-orange-600 text-white shadow-sm',
    hoverBorder: 'hover:border-orange-300'
  }
}

const QUICK_LINK_STYLES = [
  {
    id: 'consulta',
    card: 'border-brand-200/80 bg-white',
    iconBox: 'bg-brand-600 text-white shadow-sm',
    hoverBorder: 'hover:border-brand-300',
    linkText: 'text-brand-600 group-hover:text-brand-700',
    icon: Search
  },
  {
    id: 'planillas',
    card: 'border-violet-200/80 bg-white',
    iconBox: 'bg-violet-600 text-white shadow-sm',
    hoverBorder: 'hover:border-violet-300',
    linkText: 'text-violet-600 group-hover:text-violet-700',
    icon: ClipboardList
  },
  {
    id: 'reportes',
    card: 'border-orange-200/80 bg-white',
    iconBox: 'bg-orange-600 text-white shadow-sm',
    hoverBorder: 'hover:border-orange-300',
    linkText: 'text-orange-600 group-hover:text-orange-700',
    icon: BarChart3
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

function SectionHeading({
  eyebrow,
  title,
  description
}: {
  eyebrow?: string
  title: string
  description?: string
}) {
  return (
    <div>
      {eyebrow && (
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{eyebrow}</p>
      )}
      <h2
        className={cn(
          'font-bold tracking-tight text-slate-900',
          eyebrow ? 'mt-1 text-xl sm:text-2xl' : 'text-sm font-semibold uppercase tracking-wider text-slate-400'
        )}
      >
        {title}
      </h2>
      {description && (
        <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-500">{description}</p>
      )}
    </div>
  )
}

const CARD_HIGHLIGHT =
  'ring-2 ring-brand-500 ring-offset-2 ring-offset-slate-100/80 z-[1]'

const CARD_SCROLL_MARGIN = 40

function ModuleCard({
  item,
  cardIndex,
  highlighted,
  onMouseEnterCard
}: {
  item: NavItem
  cardIndex?: number
  highlighted?: boolean
  onMouseEnterCard?: () => void
}) {
  const Icon = NAV_ICONS[item.id] ?? Boxes
  const styles = GROUP_STYLES[item.group] ?? GROUP_STYLES.General
  const description = MODULE_DESCRIPTIONS[item.id] ?? item.label

  if (item.disabled) {
    return (
      <div
        className={cn(
          'relative flex h-full flex-col rounded-xl border border-dashed border-surface-border bg-white/60 p-5 opacity-70'
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-400'
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
          <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 ring-1 ring-surface-border">
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
      data-dashboard-card={cardIndex}
      tabIndex={-1}
      onMouseEnter={onMouseEnterCard}
      className={cn(
        'group relative flex h-full flex-col rounded-xl border p-5 shadow-md transition-all duration-200 outline-none scroll-m-10',
        'hover:-translate-y-0.5 hover:shadow-lg',
        'focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
        styles.card,
        styles.hoverBorder,
        highlighted && CARD_HIGHLIGHT
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors',
            styles.iconBox
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-500" />
      </div>
      <h3 className="mt-4 font-semibold text-slate-900 group-hover:text-brand-700">{item.label}</h3>
      <p className="mt-1 text-sm leading-relaxed text-slate-500">{description}</p>
      <span className="mt-3 text-xs font-medium text-brand-600 opacity-0 transition-opacity group-hover:opacity-100">
        Abrir módulo →
      </span>
    </Link>
  )
}

export function DashboardPage() {
  const navigate = useNavigate()
  const { user, hasPermiso } = useAuth()
  const { registerEscHandler, registerMainContentFocus, focusSidebar, sidebarActive } =
    useSidebarNav()
  const firstName = user?.nombre?.split(' ')[0] ?? 'Usuario'
  const [cardHighlight, setCardHighlight] = useState(-1)
  const keyboardNavRef = useRef(false)
  const navigableCountRef = useRef(0)
  const sidebarActiveRef = useRef(sidebarActive)
  sidebarActiveRef.current = sidebarActive

  const visibleItems = useMemo(
    () =>
      NAV_ITEMS.filter(
        (item) => item.id !== 'dashboard' && navItemVisible(item, hasPermiso)
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

  const navigableCount = useMemo(() => {
    const moduleCount = visibleItems.filter((item) => !item.disabled).length
    return quickLinks.length + moduleCount
  }, [quickLinks, visibleItems])

  navigableCountRef.current = navigableCount

  const focusFirstCard = useCallback(() => {
    if (navigableCountRef.current === 0 || sidebarActiveRef.current) return false
    setCardHighlight(0)
    return true
  }, [])

  useEffect(() => {
    return registerMainContentFocus(focusFirstCard)
  }, [registerMainContentFocus, focusFirstCard])

  useEffect(() => {
    setCardHighlight(-1)
  }, [navigableCount])

  useLayoutEffect(() => {
    if (cardHighlight < 0) return
    keyboardNavRef.current = true
    const el = document.querySelector(
      `[data-dashboard-card="${cardHighlight}"]`
    ) as HTMLElement | null
    if (!el) return
    focusAndScrollIntoView(el, CARD_SCROLL_MARGIN)
  }, [cardHighlight])

  useEffect(() => {
    if (navigableCount === 0) return
    const onMouseMove = () => {
      keyboardNavRef.current = false
    }
    window.addEventListener('mousemove', onMouseMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMouseMove)
  }, [navigableCount])

  useEffect(() => {
    if (navigableCount === 0) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (sidebarActiveRef.current) return

      if (e.key === 'Escape' && cardHighlight >= 0) {
        e.preventDefault()
        setCardHighlight(-1)
        ;(document.activeElement as HTMLElement | null)?.blur()
        focusSidebar()
        return
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        if (cardHighlight < 0) {
          e.preventDefault()
          keyboardNavRef.current = true
          setCardHighlight(0)
          return
        }
        e.preventDefault()
        keyboardNavRef.current = true
        setCardHighlight((i) => Math.min(i + 1, navigableCountRef.current - 1))
        return
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        if (cardHighlight < 0) return
        e.preventDefault()
        keyboardNavRef.current = true
        setCardHighlight((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter' && cardHighlight >= 0) {
        if (!shouldAbrirFormularioConEnter(e.target)) return
        e.preventDefault()
        const el = document.querySelector(
          `[data-dashboard-card="${cardHighlight}"]`
        ) as HTMLAnchorElement | null
        const path = el?.getAttribute('href')
        if (path) navigate(path)
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [navigableCount, cardHighlight, navigate, focusSidebar])

  useEffect(() => {
    if (cardHighlight < 0) return
    return registerEscHandler(() => {
      setCardHighlight(-1)
      ;(document.activeElement as HTMLElement | null)?.blur()
      focusSidebar()
      return true
    })
  }, [cardHighlight, registerEscHandler, focusSidebar])

  function focusCard(index: number) {
    if (keyboardNavRef.current) return
    setCardHighlight(index)
  }

  let nextCardIndex = 0

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Card className="overflow-hidden shadow-panel">
        <div className="relative border-b border-brand-100 bg-gradient-to-br from-brand-100/90 via-brand-50/70 to-white px-5 py-5 sm:px-6 sm:py-6">
          <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-brand-300/25 blur-2xl" />
          <div className="pointer-events-none absolute bottom-0 left-1/3 h-24 w-24 rounded-full bg-brand-200/20 blur-xl" />

          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-md ring-4 ring-brand-600/15">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-brand-700/80">
                  General · ControlStock
                </p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                  {getGreeting()}, {firstName}
                </h1>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600">
                  Panel de operaciones diarias: consultá stock, registrá ingresos, armá planillas y
                  gestioná la bodega desde un solo lugar.
                </p>
                {visibleItems.length > 0 && (
                  <p className="mt-3 inline-flex rounded-full bg-white/80 px-2.5 py-0.5 text-xs font-medium text-brand-800 ring-1 ring-brand-200/80">
                    {visibleItems.length}{' '}
                    {visibleItems.length === 1 ? 'módulo disponible' : 'módulos disponibles'}
                  </p>
                )}
              </div>
            </div>

            <div className="shrink-0 rounded-xl border border-brand-200/60 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-sm sm:text-right">
              <p className="text-xs font-semibold uppercase tracking-wider text-brand-600/70">Hoy</p>
              <p className="mt-0.5 text-sm font-semibold capitalize text-slate-900">{formatToday()}</p>
            </div>
          </div>
        </div>
      </Card>

      <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-200/55 via-slate-100/70 to-brand-100/35 p-5 shadow-inner sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand-200/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-1/4 h-40 w-40 rounded-full bg-slate-300/20 blur-3xl" />

        <div className="relative space-y-8">
          {quickLinks.length > 0 && (
            <section>
              <SectionHeading
                eyebrow="Atajos"
                title="Accesos rápidos"
                description="Las tareas más frecuentes del día"
              />

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {quickLinks.map(({ id, card, iconBox, hoverBorder, linkText, icon: QuickIcon, item }) => {
                  const cardIndex = nextCardIndex++
                  return (
                  <Link
                    key={id}
                    to={item.path}
                    data-dashboard-card={cardIndex}
                    tabIndex={-1}
                    onMouseEnter={() => focusCard(cardIndex)}
                    className={cn(
                      'group relative flex flex-col rounded-xl border p-5 shadow-md transition-all duration-200 outline-none scroll-m-10',
                      'hover:-translate-y-0.5 hover:shadow-lg',
                      'focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
                      card,
                      hoverBorder,
                      cardHighlight === cardIndex && CARD_HIGHLIGHT
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Ir a</p>
                        <p className="mt-1 text-lg font-semibold text-slate-900">{item.label}</p>
                      </div>
                      <div
                        className={cn(
                          'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                          iconBox
                        )}
                      >
                        <QuickIcon className="h-5 w-5" />
                      </div>
                    </div>
                    <div
                      className={cn(
                        'mt-4 inline-flex items-center gap-1 text-sm font-medium',
                        linkText
                      )}
                    >
                      Abrir
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </Link>
                  )
                })}
              </div>
            </section>
          )}

          <section className="space-y-8">
            <SectionHeading
              eyebrow="Módulos"
              title="Todo el sistema"
              description="Accedé a cada sección según tus permisos"
            />

            {groups.map((group) => {
              const items = visibleItems.filter((item) => item.group === group)
              if (items.length === 0) return null

              return (
                <div key={group}>
                  <div className="mb-4 flex items-center gap-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      {group}
                    </h3>
                    <div className="h-px flex-1 bg-slate-300/60" />
                    <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-medium tabular-nums text-slate-600 ring-1 ring-slate-200/80">
                      {items.length}
                    </span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {items.map((item) => {
                      if (item.disabled) {
                        return <ModuleCard key={item.id} item={item} />
                      }
                      const cardIndex = nextCardIndex++
                      return (
                        <ModuleCard
                          key={item.id}
                          item={item}
                          cardIndex={cardIndex}
                          highlighted={cardHighlight === cardIndex}
                          onMouseEnterCard={() => focusCard(cardIndex)}
                        />
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </section>

          {visibleItems.length === 0 && (
            <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-300/80 bg-white/90 px-6 py-12 text-center shadow-md">
              <LayoutGrid className="h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm font-semibold text-slate-700">Sin módulos disponibles</p>
              <p className="mt-1 max-w-sm text-sm text-slate-500">
                Tu usuario no tiene permisos asignados. Contactá al administrador.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
