import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { InventarioActivoProvider } from '@/context/InventarioActivoContext'
import { PermisoRoute } from '@/components/PermisoRoute'
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
import { InventarioPage } from '@/pages/InventarioPage'

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
      <Route path="/" element={<PermisoRoute><DashboardPage /></PermisoRoute>} />
      <Route path="/consulta" element={<PermisoRoute permiso="consulta.ver"><ConsultaPage /></PermisoRoute>} />
      <Route path="/productos" element={<PermisoRoute permiso="productos.ver"><ProductosPage /></PermisoRoute>} />
      <Route path="/sectores" element={<PermisoRoute permiso="sectores.ver"><SectoresPage /></PermisoRoute>} />
      <Route path="/camioneros" element={<PermisoRoute permiso="camioneros.ver"><CamionerosPage /></PermisoRoute>} />
      <Route path="/ingresos" element={<PermisoRoute permiso="ingresos.ver"><IngresosPage /></PermisoRoute>} />
      <Route path="/planillas" element={<PermisoRoute permiso="planillas.ver"><PlanillasPage /></PermisoRoute>} />
      <Route path="/retornos" element={<PermisoRoute permiso="retornos.ver"><RetornosPage /></PermisoRoute>} />
      <Route path="/roturas" element={<PermisoRoute permiso="roturas.ver"><RoturasPage /></PermisoRoute>} />
      <Route path="/movimientos" element={<PermisoRoute permiso="movimientos_internos.ver"><MovimientosPage /></PermisoRoute>} />
      <Route path="/reportes" element={<PermisoRoute permiso="reportes.ver"><ReportesPage /></PermisoRoute>} />
      <Route path="/usuarios" element={<PermisoRoute permiso="usuarios.ver"><UsuariosPage /></PermisoRoute>} />
      <Route
        path="/inventario"
        element={
          <PermisoRoute permisoAny={['inventario.ver', 'inventario.contar']}>
            <InventarioPage />
          </PermisoRoute>
        }
      />
      <Route
        path="/inventario/contar/:sectorInvId"
        element={<PermisoRoute permiso="inventario.contar"><InventarioPage /></PermisoRoute>}
      />
      <Route path="/configuracion" element={<PermisoRoute adminOnly><ConfiguracionPage /></PermisoRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <InventarioActivoProvider>
        <AppRoutes />
      </InventarioActivoProvider>
    </AuthProvider>
  )
}
