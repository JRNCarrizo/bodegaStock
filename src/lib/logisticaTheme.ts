/** Tonalidad del “marco” (sidebar + header) según logística activa. El contenido central no cambia. */

export interface LogisticaTheme {
  /** Franja fina arriba del header */
  topStripe: string
  /** Anillo al enfocar sidebar con teclado */
  sidebarRing: string
  /** Fondo del header del sidebar */
  sidebarHeaderBg: string
  logoBg: string
  logoRing: string
  mobileDrawerHeaderBorder: string
  selectorBorder: string
  selectorText: string
  selectorFocus: string
  selectorBadge: string
  labelText: string
  navActiveBg: string
  navActiveText: string
  navActiveRing: string
  navActiveBar: string
  navActiveIcon: string
  navActiveCollapsedRing: string
  navKeyboardBg: string
  navKeyboardText: string
  navKeyboardRing: string
  navKeyboardIcon: string
  footerAvatarBg: string
  footerAvatarText: string
  footerAvatarRing: string
}

const ESMERALDA_THEME: LogisticaTheme = {
  topStripe: 'bg-brand-600',
  sidebarRing: 'ring-brand-200/80',
  sidebarHeaderBg: 'bg-white',
  logoBg: 'bg-brand-600',
  logoRing: 'ring-brand-600/10',
  mobileDrawerHeaderBorder: 'border-brand-100',
  selectorBorder: 'border-brand-200',
  selectorText: 'text-brand-800',
  selectorFocus: 'focus:border-brand-500 focus:ring-brand-500/20',
  selectorBadge: 'bg-brand-50 text-brand-800 ring-1 ring-brand-100',
  labelText: 'text-slate-500',
  navActiveBg: 'bg-brand-50',
  navActiveText: 'text-brand-800',
  navActiveRing: 'ring-brand-100/90',
  navActiveBar: 'before:bg-brand-600',
  navActiveIcon: '[&>svg]:text-brand-600',
  navActiveCollapsedRing: 'ring-brand-200',
  navKeyboardBg: 'bg-brand-100',
  navKeyboardText: 'text-brand-800',
  navKeyboardRing: 'ring-brand-500/40',
  navKeyboardIcon: '[&>svg]:text-brand-600',
  footerAvatarBg: 'bg-brand-100',
  footerAvatarText: 'text-brand-800',
  footerAvatarRing: 'ring-brand-50'
}

const NAKBE_THEME: LogisticaTheme = {
  topStripe: 'bg-teal-600',
  sidebarRing: 'ring-teal-200/80',
  sidebarHeaderBg: 'bg-gradient-to-b from-teal-50/90 to-white',
  logoBg: 'bg-teal-600',
  logoRing: 'ring-teal-600/10',
  mobileDrawerHeaderBorder: 'border-teal-100',
  selectorBorder: 'border-teal-200',
  selectorText: 'text-teal-900',
  selectorFocus: 'focus:border-teal-500 focus:ring-teal-500/20',
  selectorBadge: 'bg-teal-50 text-teal-900 ring-1 ring-teal-100',
  labelText: 'text-teal-800/80',
  navActiveBg: 'bg-teal-50',
  navActiveText: 'text-teal-900',
  navActiveRing: 'ring-teal-100/90',
  navActiveBar: 'before:bg-teal-600',
  navActiveIcon: '[&>svg]:text-teal-600',
  navActiveCollapsedRing: 'ring-teal-200',
  navKeyboardBg: 'bg-teal-100',
  navKeyboardText: 'text-teal-900',
  navKeyboardRing: 'ring-teal-500/40',
  navKeyboardIcon: '[&>svg]:text-teal-600',
  footerAvatarBg: 'bg-teal-100',
  footerAvatarText: 'text-teal-900',
  footerAvatarRing: 'ring-teal-50'
}

export function getLogisticaTheme(codigo?: string | null): LogisticaTheme {
  if (codigo?.toUpperCase() === 'NAKBE') return NAKBE_THEME
  return ESMERALDA_THEME
}

export function resolveLogisticaCodigo(
  logisticas: { id: number; codigo: string }[] | undefined,
  logisticaActivaId: number | undefined
): string | null {
  if (!logisticaActivaId || !logisticas?.length) return null
  return logisticas.find((l) => l.id === logisticaActivaId)?.codigo ?? null
}
