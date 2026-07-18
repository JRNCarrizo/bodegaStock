import { Navigate } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import { useAuth } from '@/context/AuthContext'

function LoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-surface-muted">
      <p className="text-sm text-slate-500">Cargando...</p>
    </div>
  )
}

export function PermisoRoute({
  permiso,
  permisoAny,
  adminOnly,
  children
}: {
  permiso?: string
  permisoAny?: string[]
  adminOnly?: boolean
  children: React.ReactNode
}) {
  const { user, loading, hasPermiso } = useAuth()

  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />

  if (adminOnly && !user.es_admin) {
    return <Navigate to="/" replace />
  }

  if (permisoAny?.length && !permisoAny.some((p) => hasPermiso(p))) {
    return <Navigate to="/" replace />
  }

  if (permiso && !hasPermiso(permiso)) {
    return <Navigate to="/" replace />
  }

  return <AppLayout>{children}</AppLayout>
}
