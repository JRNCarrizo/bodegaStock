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
          'hidden shrink-0 flex-col border-r border-surface-border bg-white transition-[width] duration-200 ease-in-out lg:flex',
          collapsed ? 'w-[4.25rem]' : 'w-64',
          sidebarActive && 'ring-2 ring-inset ring-brand-200'
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
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            {groups.map((group, groupIndex) => (
              <div key={group} className={cn(!collapsed && 'mb-5')}>
                {!collapsed ? (
                  <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {group}
                  </p>
                ) : (
                  groupIndex > 0 && <div className="mx-1 my-2 border-t border-surface-border" />
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
              <p className="mt-2 px-3 text-[11px] text-slate-400">
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

          <aside className="relative flex h-full w-72 flex-col bg-white shadow-panel">
            <div className="flex items-center justify-between border-b border-surface-border p-4">
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
              <div className="flex-1 overflow-y-auto">
                {visibleItems.map((item, index) => (
                  <SidebarNavItem
                    key={item.id}
                    item={item}
                    index={index}
                    end={item.path === '/'}
                    onNavigate={() => setMobileOpen(false)}
                    mobile
                  />
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
          'flex items-center rounded-lg text-sm font-medium transition-colors',
          collapsed && !mobile ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2',
          mobile ? 'mb-0.5' : '',
          item.disabled
            ? 'cursor-not-allowed text-slate-300'
            : keyboardFocused
              ? 'bg-brand-100 text-brand-800 ring-2 ring-brand-500 ring-offset-1'
              : isActive
                ? 'bg-brand-50 text-brand-700'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      {(!collapsed || mobile) && (
        <>
          <span className="truncate">{item.label}</span>
          {item.disabled && (
            <span className="ml-auto shrink-0 text-[10px] text-slate-300">pronto</span>
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
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
          <Boxes className="h-5 w-5" />
        </div>
      </div>
    )
  }

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-2 border-b border-surface-border px-2 py-3">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white"
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
    <div className="flex items-center gap-3 border-b border-surface-border p-5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
        <Boxes className="h-5 w-5" />
      </div>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-bold text-slate-900">ControlStock</h1>
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
      <div className="border-t border-surface-border p-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-center px-2"
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
    <div className="border-t border-surface-border p-4">
      <p className="truncate text-sm font-medium text-slate-900">{userName}</p>
      <Button variant="ghost" size="sm" className="mt-2 w-full justify-start px-2" onClick={onLogout}>
        <LogOut className="h-4 w-4" />
        Cerrar sesión
      </Button>
    </div>
  )
}
