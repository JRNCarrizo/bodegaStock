import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { AppLayout } from '@/layouts/AppLayout'
import { CamionerosPage } from '@/pages/CamionerosPage'
import { ConfiguracionPage } from '@/pages/ConfiguracionPage'
import { ConsultaPage } from '@/pages/ConsultaPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { IngresosPage } from '@/pages/IngresosPage'
import { MovimientosPage } from '@/pages/MovimientosPage'
import { PlanillasPage } from '@/pages/PlanillasPage'
import { LoginPage } from '@/pages/LoginPage'
import { ProductosPage } from '@/pages/ProductosPage'
import { RetornosPage } from '@/pages/RetornosPage'
import { RoturasPage } from '@/pages/RoturasPage'
import { ReportesPage } from '@/pages/ReportesPage'
import { SectoresPage } from '@/pages/SectoresPage'
import { UsuariosPage } from '@/pages/UsuariosPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-muted">
        <p className="text-sm text-slate-500">Cargando...</p>
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return <AppLayout>{children}</AppLayout>
}

function AppRoutes() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-muted">
        <p className="text-sm text-slate-500">Cargando...</p>
      </div>
    )
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/consulta" element={<ProtectedRoute><ConsultaPage /></ProtectedRoute>} />
      <Route path="/productos" element={<ProtectedRoute><ProductosPage /></ProtectedRoute>} />
      <Route path="/sectores" element={<ProtectedRoute><SectoresPage /></ProtectedRoute>} />
      <Route path="/camioneros" element={<ProtectedRoute><CamionerosPage /></ProtectedRoute>} />
      <Route path="/ingresos" element={<ProtectedRoute><IngresosPage /></ProtectedRoute>} />
      <Route path="/planillas" element={<ProtectedRoute><PlanillasPage /></ProtectedRoute>} />
      <Route path="/retornos" element={<ProtectedRoute><RetornosPage /></ProtectedRoute>} />
      <Route path="/roturas" element={<ProtectedRoute><RoturasPage /></ProtectedRoute>} />
      <Route path="/movimientos" element={<ProtectedRoute><MovimientosPage /></ProtectedRoute>} />
      <Route path="/reportes" element={<ProtectedRoute><ReportesPage /></ProtectedRoute>} />
      <Route path="/usuarios" element={<ProtectedRoute><UsuariosPage /></ProtectedRoute>} />
      <Route path="/configuracion" element={<ProtectedRoute><ConfiguracionPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
