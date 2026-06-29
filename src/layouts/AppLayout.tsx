import { NavLink } from 'react-router-dom'
import { Boxes, LogOut, Menu, PanelLeft, PanelLeftClose, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { SidebarNavProvider, useSidebarNav } from '@/context/SidebarNavContext'
import { CONFIG_NAV_ITEM, NAV_ICONS, NAV_ITEMS } from '@/config/navigation'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import type { NavItem } from '@/types'

const SIDEBAR_COLLAPSED_KEY = 'sidebar-collapsed'

function userInitials(name?: string): string {
  if (!name?.trim()) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function SidebarGroupLabel({ group, collapsed }: { group: string; collapsed?: boolean }) {
  if (collapsed) return null

  return (
    <div className="mb-2 flex items-center gap-2 px-3">
      <p className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {group}
      </p>
      <div className="h-px flex-1 bg-surface-border/80" />
    </div>
  )
}

function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [collapsed])

  function toggleCollapsed() {
    setCollapsed((prev) => !prev)
  }

  return { collapsed, toggleCollapsed }
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { hasPermiso } = useAuth()

  const visibleItems = useMemo(
    () => NAV_ITEMS.filter((item) => !item.permiso || hasPermiso(item.permiso)),
    [hasPermiso]
  )

  const sidebarItems = useMemo(() => [...visibleItems, CONFIG_NAV_ITEM], [visibleItems])

  return (
    <SidebarNavProvider visibleItems={sidebarItems}>
      <AppLayoutShell visibleItems={visibleItems} configIndex={visibleItems.length}>
        {children}
      </AppLayoutShell>
    </SidebarNavProvider>
  )
}

function AppLayoutShell({
  visibleItems,
  configIndex,
  children
}: {
  visibleItems: NavItem[]
  configIndex: number
  children: React.ReactNode
}) {
  const { user, logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const { collapsed, toggleCollapsed } = useSidebarCollapsed()
  const { sidebarActive } = useSidebarNav()

  const groups = [...new Set(visibleItems.map((i) => i.group))]

  return (
    <div className="flex h-screen bg-surface-muted">
      <aside
        className={cn(
          'hidden shrink-0 flex-col border-r border-surface-border bg-gradient-to-b from-white via-white to-slate-50/70 shadow-sm transition-[width] duration-200 ease-in-out lg:flex',
          collapsed ? 'w-[4.25rem]' : 'w-64',
          sidebarActive && 'ring-2 ring-inset ring-brand-200/80'
        )}
      >
        <SidebarHeader collapsed={collapsed} onToggle={toggleCollapsed} />

        <nav
          className={cn(
            'flex flex-1 flex-col overflow-hidden py-4',
            collapsed ? 'px-2' : 'px-3'
          )}
          aria-label="Menú principal"
        >
          <div className="scrollbar-thin flex-1 overflow-y-auto overflow-x-hidden">
            {groups.map((group, groupIndex) => (
              <div key={group} className={cn(!collapsed && 'mb-5')}>
                {!collapsed ? (
                  <SidebarGroupLabel group={group} />
                ) : (
                  groupIndex > 0 && <div className="mx-1 my-2.5 border-t border-surface-border/80" />
                )}

                <ul className="space-y-0.5">
                  {visibleItems
                    .map((item, index) => ({ item, index }))
                    .filter(({ item }) => item.group === group)
                    .map(({ item, index }) => (
                      <SidebarNavItem
                        key={item.id}
                        item={item}
                        index={index}
                        collapsed={collapsed}
                        end={item.path === '/'}
                        onNavigate={() => setMobileOpen(false)}
                      />
                    ))}
                </ul>
              </div>
            ))}

            {!collapsed && (
              <p className="mx-1 mt-3 rounded-lg bg-slate-50 px-2.5 py-2 text-[10px] leading-relaxed text-slate-400 ring-1 ring-surface-border/60">
                ↑↓ navegar · Enter abrir · Esc volver al menú
              </p>
            )}
          </div>

          <div
            className={cn(
              'mt-2 shrink-0 border-t border-surface-border',
              collapsed ? 'pt-2' : 'pt-3'
            )}
          >
            <ul className="space-y-0.5">
              <SidebarNavItem
                item={CONFIG_NAV_ITEM}
                index={configIndex}
                collapsed={collapsed}
                onNavigate={() => setMobileOpen(false)}
              />
            </ul>
          </div>
        </nav>

        <SidebarFooter
          collapsed={collapsed}
          userName={user?.nombre}
          onLogout={logout}
        />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} />

          <aside className="relative flex h-full w-72 flex-col bg-gradient-to-b from-white via-white to-slate-50/70 shadow-panel">
            <div className="flex items-center justify-between border-b border-brand-100/80 bg-gradient-to-r from-brand-50/50 via-white to-white p-4">
              <SidebarHeader compact />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg p-1 hover:bg-slate-100"
                aria-label="Cerrar menú"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex flex-1 flex-col overflow-hidden px-3 py-4" aria-label="Menú principal">
              <div className="scrollbar-thin flex-1 overflow-y-auto">
                {groups.map((group) => (
                  <div key={group} className="mb-5">
                    <SidebarGroupLabel group={group} />
                    <ul className="space-y-0.5">
                      {visibleItems
                        .map((item, index) => ({ item, index }))
                        .filter(({ item }) => item.group === group)
                        .map(({ item, index }) => (
                          <SidebarNavItem
                            key={item.id}
                            item={item}
                            index={index}
                            end={item.path === '/'}
                            onNavigate={() => setMobileOpen(false)}
                            mobile
                          />
                        ))}
                    </ul>
                  </div>
                ))}
              </div>

              <div className="mt-2 shrink-0 border-t border-surface-border pt-3">
                <SidebarNavItem
                  item={CONFIG_NAV_ITEM}
                  index={configIndex}
                  onNavigate={() => setMobileOpen(false)}
                  mobile
                />
              </div>
            </nav>

            <SidebarFooter userName={user?.nombre} onLogout={logout} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-surface-border bg-white px-4 lg:px-6">
          <button
            type="button"
            className="rounded-lg p-2 hover:bg-slate-100 lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="lg:hidden">
            <SidebarHeader compact />
          </div>

          <button
            type="button"
            className="ml-auto hidden rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 lg:inline-flex"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expandir menú lateral' : 'Contraer menú lateral'}
            title={collapsed ? 'Expandir menú' : 'Contraer menú'}
          >
            {collapsed ? <PanelLeft className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-4 outline-none lg:p-6">{children}</main>
      </div>
    </div>
  )
}

function SidebarNavItem({
  item,
  index,
  end,
  onNavigate,
  mobile = false,
  collapsed = false
}: {
  item: NavItem
  index: number
  end?: boolean
  onNavigate?: () => void
  mobile?: boolean
  collapsed?: boolean
}) {
  const Icon = NAV_ICONS[item.id] ?? Boxes
  const { setNavLinkRef, isNavItemHighlighted, handleNavLinkClick, activateNavItem } =
    useSidebarNav()
  const keyboardFocused = isNavItemHighlighted(index)

  const link = (
    <NavLink
      ref={(node) => setNavLinkRef(index, node)}
      to={item.disabled ? '#' : item.path}
      end={end}
      title={collapsed && !mobile ? item.label : undefined}
      onClick={(e) => {
        if (item.disabled) {
          e.preventDefault()
          return
        }
        handleNavLinkClick(index, item.disabled)
        onNavigate?.()
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' || item.disabled || !keyboardFocused) return
        e.preventDefault()
        e.stopPropagation()
        activateNavItem(index)
        onNavigate?.()
      }}
      className={({ isActive }) =>
        cn(
          'relative flex items-center rounded-xl text-sm font-medium transition-all duration-150',
          collapsed && !mobile ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2',
          mobile ? 'mb-0.5' : '',
          item.disabled
            ? 'cursor-not-allowed text-slate-300 [&>svg]:text-slate-300'
            : keyboardFocused
              ? 'bg-brand-100 text-brand-800 shadow-sm ring-2 ring-brand-500/40 ring-offset-1 [&>svg]:text-brand-600'
              : isActive
                ? cn(
                    'bg-brand-50 text-brand-800 shadow-sm ring-1 ring-brand-100/90 [&>svg]:text-brand-600',
                    !collapsed || mobile
                      ? 'before:absolute before:inset-y-1.5 before:left-0 before:w-1 before:rounded-r-full before:bg-brand-600'
                      : 'ring-2 ring-brand-200'
                  )
                : 'text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-sm hover:ring-1 hover:ring-surface-border/80 [&>svg]:text-slate-400'
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0 transition-colors" />
      {(!collapsed || mobile) && (
        <>
          <span className="truncate">{item.label}</span>
          {item.disabled && (
            <span className="ml-auto shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 ring-1 ring-surface-border">
              pronto
            </span>
          )}
        </>
      )}
    </NavLink>
  )

  if (mobile) return link

  return <li>{link}</li>
}

function SidebarHeader({
  compact = false,
  collapsed = false,
  onToggle
}: {
  compact?: boolean
  collapsed?: boolean
  onToggle?: () => void
}) {
  if (compact) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm ring-4 ring-brand-600/10">
          <Boxes className="h-5 w-5" />
        </div>
      </div>
    )
  }

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-2 border-b border-surface-border/80 bg-gradient-to-b from-brand-50/40 to-white px-2 py-3">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm ring-4 ring-brand-600/10"
          title="ControlStock"
        >
          <Boxes className="h-5 w-5" />
        </div>
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Expandir menú lateral"
            title="Expandir menú"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 border-b border-surface-border/80 bg-gradient-to-r from-brand-50/50 via-white to-white p-5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm ring-4 ring-brand-600/10">
        <Boxes className="h-5 w-5" />
      </div>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-bold tracking-tight text-slate-900">ControlStock</h1>
        <p className="truncate text-xs text-slate-500">Bodega Esmeralda</p>
      </div>

      {onToggle && (
        <button
          type="button"
          onClick={onToggle}
          className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Contraer menú lateral"
          title="Contraer menú"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

function SidebarFooter({
  userName,
  onLogout,
  collapsed = false
}: {
  userName?: string
  onLogout: () => void
  collapsed?: boolean
}) {
  if (collapsed) {
    return (
      <div className="border-t border-surface-border/80 bg-white/60 p-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-center rounded-xl px-2 text-slate-500 hover:text-slate-800"
          onClick={onLogout}
          title="Cerrar sesión"
          aria-label="Cerrar sesión"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  return (
    <div className="border-t border-surface-border/80 bg-white/60 p-4">
      <div className="flex items-center gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800 ring-2 ring-brand-50"
          aria-hidden
        >
          {userInitials(userName)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{userName}</p>
          <p className="truncate text-xs text-slate-500">Sesión activa</p>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="mt-3 w-full justify-start rounded-xl px-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        onClick={onLogout}
      >
        <LogOut className="h-4 w-4" />
        Cerrar sesión
      </Button>
    </div>
  )
}
