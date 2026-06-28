import { NavLink } from 'react-router-dom'

import {

  Boxes,

  LogOut,

  Menu,

  X

} from 'lucide-react'

import { useMemo, useState } from 'react'

import { SidebarNavProvider, useSidebarNav } from '@/context/SidebarNavContext'

import { NAV_ICONS, NAV_ITEMS } from '@/config/navigation'

import { useAuth } from '@/context/AuthContext'

import { cn } from '@/lib/utils'

import { Button } from '@/components/ui/Button'

import type { NavItem } from '@/types'



export function AppLayout({ children }: { children: React.ReactNode }) {

  const { hasPermiso } = useAuth()



  const visibleItems = useMemo(

    () => NAV_ITEMS.filter((item) => !item.permiso || hasPermiso(item.permiso)),

    [hasPermiso]

  )



  return (

    <SidebarNavProvider visibleItems={visibleItems}>

      <AppLayoutShell visibleItems={visibleItems}>{children}</AppLayoutShell>

    </SidebarNavProvider>

  )

}



function AppLayoutShell({

  visibleItems,

  children

}: {

  visibleItems: NavItem[]

  children: React.ReactNode

}) {

  const { user, logout } = useAuth()

  const [mobileOpen, setMobileOpen] = useState(false)

  const { sidebarActive } = useSidebarNav()



  const groups = [...new Set(visibleItems.map((i) => i.group))]

  return (

    <div className="flex h-screen bg-surface-muted">

      <aside

        className={cn(

          'hidden w-64 shrink-0 flex-col border-r border-surface-border bg-white lg:flex',

          sidebarActive && 'ring-2 ring-inset ring-brand-200'

        )}

      >

        <SidebarHeader />

        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Menú principal">

          {groups.map((group) => (

            <div key={group} className="mb-5">

              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">

                {group}

              </p>

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

                      />

                    ))}

              </ul>

            </div>

          ))}

          <p className="mt-2 px-3 text-[11px] text-slate-400">

            ↑↓ navegar · Enter abrir · Esc volver al menú

          </p>

        </nav>

        <SidebarFooter userName={user?.nombre} onLogout={logout} />

      </aside>



      {mobileOpen && (

        <div className="fixed inset-0 z-40 lg:hidden">

          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} />

          <aside className="relative flex h-full w-72 flex-col bg-white shadow-panel">

            <div className="flex items-center justify-between border-b border-surface-border p-4">

              <SidebarHeader compact />

              <button onClick={() => setMobileOpen(false)} className="rounded-lg p-1 hover:bg-slate-100">

                <X className="h-5 w-5" />

              </button>

            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Menú principal">

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

            </nav>

            <SidebarFooter userName={user?.nombre} onLogout={logout} />

          </aside>

        </div>

      )}



      <div className="flex min-w-0 flex-1 flex-col">

        <header className="flex h-14 items-center gap-3 border-b border-surface-border bg-white px-4 lg:px-6">

          <button

            className="rounded-lg p-2 hover:bg-slate-100 lg:hidden"

            onClick={() => setMobileOpen(true)}

          >

            <Menu className="h-5 w-5" />

          </button>

          <div className="lg:hidden">

            <SidebarHeader compact />

          </div>

        </header>

        <main tabIndex={-1} className="flex-1 overflow-y-auto p-4 outline-none lg:p-6">

          {children}

        </main>

      </div>

    </div>

  )

}



function SidebarNavItem({

  item,

  index,

  end,

  onNavigate,

  mobile = false

}: {

  item: NavItem

  index: number

  end?: boolean

  onNavigate?: () => void

  mobile?: boolean

}) {

  const Icon = NAV_ICONS[item.id] ?? Boxes

  const { setNavLinkRef, isNavItemHighlighted, handleNavLinkClick, activateNavItem } = useSidebarNav()

  const keyboardFocused = isNavItemHighlighted(index)



  const link = (

    <NavLink

      ref={(node) => setNavLinkRef(index, node)}

      to={item.disabled ? '#' : item.path}

      end={end}

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

          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',

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

      {item.label}

      {item.disabled && (

        <span className="ml-auto text-[10px] text-slate-300">pronto</span>

      )}

    </NavLink>

  )



  if (mobile) return link



  return <li>{link}</li>

}



function SidebarHeader({ compact = false }: { compact?: boolean }) {

  return (

    <div className={cn('flex items-center gap-3 border-b border-surface-border', compact ? 'p-0' : 'p-5')}>

      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">

        <Boxes className="h-5 w-5" />

      </div>

      {!compact && (

        <div>

          <h1 className="text-base font-bold text-slate-900">BodegaStock</h1>

          <p className="text-xs text-slate-500">Gestión de bodega</p>

        </div>

      )}

    </div>

  )

}



function SidebarFooter({

  userName,

  onLogout

}: {

  userName?: string

  onLogout: () => void

}) {

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


