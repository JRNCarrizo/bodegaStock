import { createContext, useContext, type ReactNode } from 'react'
import { getLogisticaTheme, type LogisticaTheme } from '@/lib/logisticaTheme'

const LogisticaThemeContext = createContext<LogisticaTheme>(getLogisticaTheme('ESMERALDA'))

export function LogisticaThemeProvider({
  theme,
  children
}: {
  theme: LogisticaTheme
  children: ReactNode
}) {
  return (
    <LogisticaThemeContext.Provider value={theme}>{children}</LogisticaThemeContext.Provider>
  )
}

export function useLogisticaTheme(): LogisticaTheme {
  return useContext(LogisticaThemeContext)
}
