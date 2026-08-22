import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, setActiveLogisticaId } from '@/lib/utils'
import {
  loadOfflineAuth,
  saveOfflineAuth,
  updateOfflineAuthUsuario,
  verifyOfflineLogin
} from '@/lib/offlineAuth'
import type { Usuario } from '@/types'

export type LoginMode = 'online' | 'offline'

interface AuthContextValue {
  user: Usuario | null
  loading: boolean
  /** true si la sesión actual se restauró / entró sin PC */
  offlineSession: boolean
  login: (username: string, password: string) => Promise<LoginMode>
  logout: () => void
  refreshUser: () => Promise<void>
  hasPermiso: (codigo: string) => boolean
  setLogisticaActiva: (logisticaId: number) => Promise<void>
  logisticaActivaNombre: string | null
}

const AuthContext = createContext<AuthContextValue | null>(null)

const LOGIN_ONLINE_TIMEOUT_MS = 4000
const ME_TIMEOUT_MS = 5000

function isNetworkError(message: string): boolean {
  return /conectar|servidor|Failed to fetch|NetworkError|timeout|agotado|configuración de red/i.test(
    message
  )
}

function isCredentialError(message: string): boolean {
  return /usuario|clave|contrase|credencial|inválid|incorrect|no autorizado|401/i.test(message)
}

function applyLogisticaFromUser(u: Usuario | null): void {
  if (!u?.logistica_activa_id) {
    setActiveLogisticaId(null)
    return
  }
  setActiveLogisticaId(u.logistica_activa_id)
}

function logisticaLabel(u: Usuario | null): string | null {
  if (!u?.logistica_activa_id || !u.logisticas?.length) return null
  return u.logisticas.find((l) => l.id === u.logistica_activa_id)?.nombre ?? null
}

function applyOfflineSession(
  cached: { token: string; usuario: Usuario },
  setUser: (u: Usuario) => void,
  setOfflineSession: (v: boolean) => void
): LoginMode {
  localStorage.setItem('token', cached.token)
  setUser(cached.usuario)
  applyLogisticaFromUser(cached.usuario)
  setOfflineSession(true)
  return 'offline'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Usuario | null>(null)
  /** Siempre false: la app no restaura sesión al abrir. */
  const loading = false
  const [offlineSession, setOfflineSession] = useState(false)

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem('token')
    if (!token) {
      setUser(null)
      setOfflineSession(false)
      return
    }
    try {
      const data = await api<Usuario>('/api/auth/me', { timeoutMs: ME_TIMEOUT_MS })
      setUser(data)
      applyLogisticaFromUser(data)
      setOfflineSession(false)
      await updateOfflineAuthUsuario(data, token)
    } catch {
      const cached = await loadOfflineAuth()
      if (cached && cached.token === token) {
        setUser(cached.usuario)
        applyLogisticaFromUser(cached.usuario)
        setOfflineSession(true)
        return
      }
      localStorage.removeItem('token')
      setUser(null)
      setOfflineSession(false)
    }
  }, [])

  // Cada apertura de la app (PC o APK) arranca en login.
  // Se conserva cs_offline_auth para poder desbloquear sin PC con usuario/clave.
  useEffect(() => {
    localStorage.removeItem('token')
    setUser(null)
    setOfflineSession(false)
  }, [])

  // Al cerrar la ventana/proceso, limpiar la sesión activa.
  useEffect(() => {
    function clearSessionOnExit() {
      localStorage.removeItem('token')
    }
    window.addEventListener('pagehide', clearSessionOnExit)
    window.addEventListener('beforeunload', clearSessionOnExit)
    return () => {
      window.removeEventListener('pagehide', clearSessionOnExit)
      window.removeEventListener('beforeunload', clearSessionOnExit)
    }
  }, [])

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
  }, [refreshUser, user])

  async function login(username: string, password: string): Promise<LoginMode> {
    // Sin red reportada: ir directo a desbloqueo local (evita esperar al PC).
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      const cached = await verifyOfflineLogin(username, password)
      if (cached) return applyOfflineSession(cached, setUser, setOfflineSession)
      const hadCache = !!(await loadOfflineAuth())
      throw new Error(
        hadCache
          ? 'Sin conexión al PC. Usuario o clave no coinciden con la sesión guardada en este celular.'
          : 'Sin conexión al PC. Entrá al menos una vez con red para poder usar este celular sin servidor.'
      )
    }

    try {
      const data = await api<{ token: string; usuario: Usuario }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
        timeoutMs: LOGIN_ONLINE_TIMEOUT_MS
      })
      localStorage.setItem('token', data.token)
      setUser(data.usuario)
      applyLogisticaFromUser(data.usuario)
      setOfflineSession(false)
      await saveOfflineAuth(data.token, data.usuario, username, password)
      return 'online'
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''

      if (isCredentialError(msg) && !isNetworkError(msg)) {
        throw err
      }

      const cached = await verifyOfflineLogin(username, password)
      if (cached) return applyOfflineSession(cached, setUser, setOfflineSession)

      if (isNetworkError(msg)) {
        const hadCache = !!(await loadOfflineAuth())
        throw new Error(
          hadCache
            ? 'Sin conexión al PC. Usuario o clave no coinciden con la sesión guardada en este celular.'
            : 'Sin conexión al PC. Entrá al menos una vez con red para poder usar este celular sin servidor.'
        )
      }

      throw err
    }
  }

  function logout() {
    localStorage.removeItem('token')
    setUser(null)
    setActiveLogisticaId(null)
    setOfflineSession(false)
  }

  async function setLogisticaActiva(logisticaId: number) {
    const data = await api<Usuario & { ok?: boolean }>('/api/logisticas/activa', {
      method: 'PUT',
      body: JSON.stringify({ logistica_id: logisticaId })
    })
    const nextId = data.logistica_activa_id ?? logisticaId
    setActiveLogisticaId(nextId)
    setUser((prev) => {
      if (!prev) return prev
      const next: Usuario = {
        ...prev,
        logistica_activa_id: nextId,
        logisticas: data.logisticas ?? prev.logisticas,
        logistica_asignada_id: data.logistica_asignada_id ?? prev.logistica_asignada_id,
        puede_cambiar_logistica: data.puede_cambiar_logistica ?? prev.puede_cambiar_logistica
      }
      const token = localStorage.getItem('token')
      if (token) void updateOfflineAuthUsuario(next, token)
      return next
    })
  }

  function hasPermiso(codigo: string) {
    return user?.permisos.includes(codigo) ?? false
  }

  const logisticaActivaNombre = logisticaLabel(user)

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        offlineSession,
        login,
        logout,
        refreshUser,
        hasPermiso,
        setLogisticaActiva,
        logisticaActivaNombre
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
