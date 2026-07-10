import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from '@/lib/utils'
import type { Usuario } from '@/types'

interface AuthContextValue {
  user: Usuario | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
  hasPermiso: (codigo: string) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Usuario | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem('token')
    if (!token) {
      setUser(null)
      return
    }
    try {
      const data = await api<Usuario>('/api/auth/me')
      setUser(data)
    } catch {
      localStorage.removeItem('token')
      setUser(null)
    }
  }, [])

  useEffect(() => {
    refreshUser().finally(() => setLoading(false))
  }, [refreshUser])

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return

    function onFocus() {
      void refreshUser()
    }

    function onVisible() {
      if (document.visibilityState === 'visible') void refreshUser()
    }

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refreshUser])

  async function login(username: string, password: string) {
    const data = await api<{ token: string; usuario: Usuario }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    })
    localStorage.setItem('token', data.token)
    setUser(data.usuario)
  }

  function logout() {
    localStorage.removeItem('token')
    setUser(null)
  }

  function hasPermiso(codigo: string) {
    return user?.permisos.includes(codigo) ?? false
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser, hasPermiso }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
