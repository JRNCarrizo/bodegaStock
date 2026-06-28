import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

export function LoginPage() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen">
      <aside className="relative hidden w-[44%] max-w-xl overflow-hidden bg-gradient-to-br from-brand-800 via-brand-600 to-brand-700 lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-14">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.15]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, white 1px, transparent 1px), radial-gradient(circle at 80% 60%, white 1px, transparent 1px)',
            backgroundSize: '48px 48px'
          }}
        />
        <div className="pointer-events-none absolute -left-24 top-1/4 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 right-0 h-80 w-80 rounded-full bg-brand-400/20 blur-3xl" />

        <div className="relative">
          <img
            src="/icon.png"
            alt=""
            className="h-16 w-16 rounded-2xl shadow-xl ring-1 ring-white/25"
          />
          <h1 className="mt-8 text-3xl font-bold tracking-tight text-white xl:text-4xl">
            ControlStock
          </h1>
          <p className="mt-2 text-base font-medium text-brand-100">Bodega Esmeralda</p>
        </div>

        <div className="relative space-y-4">
          <p className="max-w-sm text-sm leading-relaxed text-brand-50/90">
            Stock, ingresos, planillas, retornos e inventario en un solo sistema para la operación
            diaria de la bodega.
          </p>
          <div className="flex flex-wrap gap-2">
            {['Consulta', 'Ingresos', 'Planillas', 'Retornos'].map((item) => (
              <span
                key={item}
                className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/90 ring-1 ring-white/10"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </aside>

      <main className="flex flex-1 flex-col items-center justify-center bg-slate-50 px-4 py-10 sm:px-8">
        <div className="mb-8 flex flex-col items-center text-center lg:hidden">
          <img
            src="/icon.png"
            alt=""
            className="h-14 w-14 rounded-2xl shadow-panel ring-1 ring-slate-200/80"
          />
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">ControlStock</h1>
          <p className="mt-1 text-sm text-slate-500">Bodega Esmeralda</p>
        </div>

        <div className="w-full max-w-[400px]">
          <div className="mb-8 hidden lg:block">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
              Iniciar sesión
            </h2>
            <p className="mt-1.5 text-sm text-slate-500">
              Ingresá con tu usuario asignado por el administrador
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card sm:p-8">
            <div className="mb-6 lg:hidden">
              <h2 className="text-lg font-semibold text-slate-900">Iniciar sesión</h2>
              <p className="mt-1 text-sm text-slate-500">Usuario y contraseña</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <Input
                label="Usuario"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="Tu nombre de usuario"
                className="py-2.5"
                required
              />
              <Input
                label="Contraseña"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
                className="py-2.5"
                required
              />

              {error && (
                <div
                  className="rounded-lg border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-700"
                  role="alert"
                >
                  {error}
                </div>
              )}

              <Button type="submit" className="h-11 w-full text-sm font-semibold" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Ingresando…
                  </>
                ) : (
                  'Ingresar'
                )}
              </Button>
            </form>
          </div>

          <p className="mt-6 text-center text-xs leading-relaxed text-slate-400">
            Primera instalación en el servidor:{' '}
            <span className="font-mono text-slate-500">admin</span>
            {' / '}
            <span className="font-mono text-slate-500">admin123</span>
            <span className="mt-1 block">Cambiá la contraseña después del primer acceso.</span>
          </p>
        </div>
      </main>
    </div>
  )
}
