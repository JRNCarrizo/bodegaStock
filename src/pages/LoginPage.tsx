import { useEffect, useState } from 'react'
import {
  Boxes,
  Camera,
  Check,
  ChevronDown,
  ClipboardList,
  Eye,
  EyeOff,
  Loader2,
  LogIn,
  Package,
  Search,
  Server,
  Truck
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { BarcodeScannerModal } from '@/components/BarcodeScannerModal'
import { Button } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { cn, getApiUrl, setApiUrl } from '@/lib/utils'
import {
  isNativeApp,
  loadConnectionMode,
  loadSavedServerUrl,
  normalizeServerUrl,
  saveConnectionMode,
  saveServerUrl,
  testServerConnection,
  type ConnectionMode
} from '@/lib/nativeServer'
import { hasOfflineAuth } from '@/lib/offlineAuth'

const FEATURES = [
  { icon: Search, label: 'Consulta', tone: 'brand' },
  { icon: Package, label: 'Ingresos', tone: 'emerald' },
  { icon: ClipboardList, label: 'Planillas', tone: 'violet' },
  { icon: Truck, label: 'Retornos', tone: 'orange' }
] as const

const FEATURE_TONES: Record<(typeof FEATURES)[number]['tone'], { chip: string; icon: string }> = {
  brand: {
    chip: 'border-brand-100 bg-brand-50/80 text-brand-800',
    icon: 'bg-brand-600 text-white'
  },
  emerald: {
    chip: 'border-emerald-100 bg-emerald-50/80 text-emerald-800',
    icon: 'bg-emerald-600 text-white'
  },
  violet: {
    chip: 'border-violet-100 bg-violet-50/80 text-violet-800',
    icon: 'bg-violet-600 text-white'
  },
  orange: {
    chip: 'border-orange-100 bg-orange-50/80 text-orange-800',
    icon: 'bg-orange-600 text-white'
  }
}

function splitServerParts(raw: string): { host: string; port: string; fullUrl?: string } {
  try {
    const normalized = normalizeServerUrl(raw)
    const url = new URL(normalized)
    if (url.protocol === 'https:') {
      return { host: normalized, port: '', fullUrl: normalized }
    }
    return { host: url.hostname, port: url.port || '3847', fullUrl: normalized }
  } catch {
    const cleaned = raw.replace(/^https?:\/\//i, '').split('/')[0] ?? ''
    const idx = cleaned.lastIndexOf(':')
    if (idx > 0 && /^\d+$/.test(cleaned.slice(idx + 1))) {
      return { host: cleaned.slice(0, idx), port: cleaned.slice(idx + 1) }
    }
    return { host: cleaned, port: '3847' }
  }
}

export function LoginPage() {
  const { login } = useAuth()
  const native = isNativeApp()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [connMode, setConnMode] = useState<ConnectionMode>('local')
  const [serverHost, setServerHost] = useState('')
  const [serverPort, setServerPort] = useState('3847')
  const [cloudUrl, setCloudUrl] = useState('')
  const [serverReady, setServerReady] = useState(!native)
  const [serverMsg, setServerMsg] = useState('')
  const [serverOk, setServerOk] = useState(false)
  const [testingServer, setTestingServer] = useState(false)
  const [showServerQr, setShowServerQr] = useState(false)
  const [serverPanelOpen, setServerPanelOpen] = useState(false)
  const [offlineUnlockReady, setOfflineUnlockReady] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const serverInput =
    connMode === 'cloud'
      ? cloudUrl.trim()
      : serverHost.trim()
        ? `${serverHost.trim()}:${(serverPort.trim() || '3847').trim()}`
        : ''

  useEffect(() => {
    if (!native) return
    void (async () => {
      const [saved, offlineOk, mode] = await Promise.all([
        loadSavedServerUrl(),
        hasOfflineAuth(),
        loadConnectionMode(),
      ])
      setOfflineUnlockReady(offlineOk)
      setConnMode(mode)
      if (saved) {
        const parts = splitServerParts(saved)
        if (mode === 'cloud' || saved.startsWith('https://')) {
          setConnMode('cloud')
          setCloudUrl(saved)
        } else {
          setServerHost(parts.host)
          setServerPort(parts.port || '3847')
        }
        setApiUrl(saved)
        setServerReady(true)
        setServerOk(true)
        setServerMsg(`Servidor: ${saved}`)
      }
    })()
  }, [native])

  function markServerDirty() {
    setServerReady(false)
    setServerOk(false)
  }

  async function handleSaveServer(rawOverride?: string) {
    setServerMsg('')
    setServerOk(false)
    setTestingServer(true)
    try {
      const raw = rawOverride ?? serverInput
      const result = await testServerConnection(raw)
      if (!result.ok) {
        setServerReady(false)
        setServerMsg(result.message)
        return
      }
      const saved = await saveServerUrl(raw)
      const modeToSave: ConnectionMode =
        connMode === 'cloud' || saved.startsWith('https://') ? 'cloud' : 'local'
      await saveConnectionMode(modeToSave)
      setConnMode(modeToSave)
      if (modeToSave === 'cloud') {
        setCloudUrl(saved)
      } else {
        const parts = splitServerParts(saved)
        setServerHost(parts.host)
        setServerPort(parts.port || '3847')
      }
      setApiUrl(saved)
      setServerReady(true)
      setServerOk(true)
      setServerMsg(
        result.version
          ? `Conectado · ControlStock ${result.version}`
          : `Conectado · ${saved}`
      )
    } finally {
      setTestingServer(false)
    }
  }

  function handleServerQrScan(code: string) {
    setShowServerQr(false)
    setError('')
    const trimmed = code.trim()
    try {
      if (/^https:\/\//i.test(trimmed) || /railway\.app/i.test(trimmed)) {
        setConnMode('cloud')
        setCloudUrl(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`)
        markServerDirty()
        void handleSaveServer(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`)
        return
      }
      const parts = splitServerParts(trimmed)
      setConnMode('local')
      setServerHost(parts.host)
      setServerPort(parts.port || '3847')
      markServerDirty()
      void handleSaveServer(`${parts.host}:${parts.port || '3847'}`)
    } catch {
      setServerMsg('El QR no contiene una IP/URL válida del PC servidor')
      setServerOk(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (native && !serverReady && !offlineUnlockReady) {
      setError('Primero configurá y probá la conexión al PC servidor (al menos una vez).')
      return
    }

    setLoading(true)
    try {
      if (native && serverReady && getApiUrl() === 'http://127.0.0.1:3847' && serverInput.trim()) {
        const saved = await saveServerUrl(serverInput)
        setApiUrl(saved)
      }
      const mode = await login(username, password)
      if (mode === 'offline') {
        // AuthProvider ya setea el user
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-surface-muted">
      <div className="hidden w-[42%] max-w-xl shrink-0 flex-col justify-center border-r border-surface-border bg-gradient-to-b from-white via-white to-slate-50/70 p-10 xl:p-14 lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm ring-4 ring-brand-600/10">
            <Boxes className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-slate-900">ControlStock</h1>
            <p className="text-xs text-slate-500">Bodega Esmeralda</p>
          </div>
        </div>

        <Card className="mt-10 overflow-hidden shadow-panel">
          <div className="relative border-b border-brand-100 bg-gradient-to-br from-brand-100/90 via-brand-50/70 to-white px-6 py-6">
            <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-brand-300/25 blur-2xl" />
            <div className="pointer-events-none absolute bottom-0 left-1/4 h-20 w-20 rounded-full bg-brand-200/20 blur-xl" />

            <div className="relative">
              <p className="text-xs font-semibold uppercase tracking-wider text-brand-700/80">
                Sistema de gestión
              </p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
                Operación diaria de la bodega
              </h2>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-600">
                Stock, ingresos, planillas, retornos e inventario en un solo lugar para el equipo
                de la bodega.
              </p>
            </div>
          </div>

          <CardBody className="grid grid-cols-2 gap-2.5 p-5">
            {FEATURES.map(({ icon: Icon, label, tone }) => {
              const styles = FEATURE_TONES[tone]
              return (
                <div
                  key={label}
                  className={cn(
                    'flex items-center gap-2.5 rounded-xl border px-3 py-2.5 shadow-sm',
                    styles.chip
                  )}
                >
                  <div
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg shadow-sm',
                      styles.icon
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-medium">{label}</span>
                </div>
              )
            })}
          </CardBody>
        </Card>
      </div>

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="mb-8 flex flex-col items-center text-center lg:hidden">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white shadow-md ring-4 ring-brand-600/15">
            <Boxes className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">ControlStock</h1>
          <p className="mt-1 text-sm text-slate-500">Bodega Esmeralda</p>
        </div>

        <div className="w-full max-w-[420px] space-y-6">
          <section className="hidden lg:block">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Acceso</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Iniciar sesión
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              Ingresá con tu usuario asignado por el administrador
            </p>
          </section>

          {native && (
            <Card className="overflow-hidden shadow-panel">
              <button
                type="button"
                className="flex w-full items-start gap-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-white px-5 py-4 text-left transition-colors hover:bg-slate-50/80"
                onClick={() => setServerPanelOpen((v) => !v)}
                aria-expanded={serverPanelOpen}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-white shadow-sm">
                  <Server className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-900">PC servidor</h3>
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 shrink-0 text-slate-400 transition-transform',
                        serverPanelOpen && 'rotate-180'
                      )}
                    />
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm">
                    {serverHost.trim() ? (
                      <>
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1',
                            serverReady
                              ? 'bg-emerald-50 text-emerald-800 ring-emerald-100'
                              : 'bg-amber-50 text-amber-900 ring-amber-100'
                          )}
                        >
                          {serverReady ? 'IP guardada' : 'IP sin probar'}
                        </span>
                        <span className="truncate font-mono text-xs text-slate-600">
                          {serverHost.trim()}
                          {serverPort.trim() && serverPort.trim() !== '3847'
                            ? `:${serverPort.trim()}`
                            : ''}
                        </span>
                      </>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                        Sin IP guardada
                      </span>
                    )}
                  </p>
                </div>
              </button>
              {serverPanelOpen && (
                <CardBody className="space-y-3 p-5">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className={cn(
                        'rounded-xl px-3 py-2 text-sm font-semibold ring-1',
                        connMode === 'local'
                          ? 'bg-brand-600 text-white ring-brand-600'
                          : 'bg-white text-slate-700 ring-slate-200'
                      )}
                      onClick={() => {
                        setConnMode('local')
                        markServerDirty()
                      }}
                    >
                      Red local
                    </button>
                    <button
                      type="button"
                      className={cn(
                        'rounded-xl px-3 py-2 text-sm font-semibold ring-1',
                        connMode === 'cloud'
                          ? 'bg-brand-600 text-white ring-brand-600'
                          : 'bg-white text-slate-700 ring-slate-200'
                      )}
                      onClick={() => {
                        setConnMode('cloud')
                        markServerDirty()
                      }}
                    >
                      Nube
                    </button>
                  </div>
                  {connMode === 'local' ? (
                    <>
                      <p className="text-xs text-slate-500">
                        Escaneá el QR de Configuración en el PC, o escribí la IP. El puerto suele ser
                        3847.
                      </p>
                      <div className="flex gap-2">
                        <div className="min-w-0 flex-1">
                          <Input
                            label="IP del PC"
                            value={serverHost}
                            onChange={(e) => {
                              setServerHost(e.target.value.replace(/[^\d.]/g, ''))
                              markServerDirty()
                            }}
                            placeholder="192.168.1.56"
                            autoComplete="off"
                            inputMode="decimal"
                          />
                        </div>
                        <div className="w-[88px] shrink-0">
                          <Input
                            label="Puerto"
                            value={serverPort}
                            onChange={(e) => {
                              setServerPort(e.target.value.replace(/\D/g, ''))
                              markServerDirty()
                            }}
                            placeholder="3847"
                            autoComplete="off"
                            inputMode="numeric"
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-slate-500">
                        Pegá la URL de Railway (https://….up.railway.app).
                      </p>
                      <Input
                        label="URL nube"
                        value={cloudUrl}
                        onChange={(e) => {
                          setCloudUrl(e.target.value.trim())
                          markServerDirty()
                        }}
                        placeholder="https://….up.railway.app"
                        autoComplete="off"
                      />
                    </>
                  )}
                  <div className="flex flex-col gap-2.5">
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full border-slate-300 bg-slate-800 py-2.5 text-white shadow-sm hover:bg-slate-900 hover:text-white"
                      disabled={testingServer}
                      onClick={() => setShowServerQr(true)}
                    >
                      <Camera className="h-4 w-4" />
                      {connMode === 'cloud' ? 'Escanear QR de la nube' : 'Escanear QR del PC'}
                    </Button>
                    <Button
                      type="button"
                      className="w-full py-2.5 shadow-sm"
                      disabled={
                        testingServer ||
                        (connMode === 'local' ? !serverHost.trim() : !cloudUrl.trim())
                      }
                      onClick={() => void handleSaveServer()}
                    >
                      {testingServer ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Probando…
                        </>
                      ) : (
                        <>
                          <Check className="h-4 w-4" />
                          Probar y guardar
                        </>
                      )}
                    </Button>
                  </div>
                  {serverMsg && (
                    <p
                      className={cn(
                        'rounded-xl px-3 py-2 text-sm ring-1',
                        serverOk
                          ? 'bg-emerald-50 text-emerald-800 ring-emerald-100'
                          : 'bg-amber-50 text-amber-900 ring-amber-100'
                      )}
                    >
                      {serverMsg}
                    </p>
                  )}
                  {offlineUnlockReady && (
                    <p className="rounded-xl bg-sky-50 px-3 py-2 text-sm text-sky-900 ring-1 ring-sky-100">
                      Este celular ya tiene sesión offline. Si no hay WiFi al PC, podés entrar con
                      el mismo usuario y clave para seguir contando.
                    </p>
                  )}
                </CardBody>
              )}
            </Card>
          )}

          <Card className="overflow-hidden shadow-panel">
            <div className="border-b border-brand-100 bg-gradient-to-r from-brand-50/80 via-white to-white px-5 py-4 sm:px-6">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
                  <LogIn className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 lg:hidden">Iniciar sesión</h3>
                  <h3 className="hidden font-semibold text-slate-900 lg:block">Credenciales</h3>
                  <p className="mt-0.5 text-sm text-slate-500">Usuario y contraseña del sistema</p>
                </div>
              </div>
            </div>

            <CardBody className="p-5 sm:p-6">
              <form onSubmit={handleSubmit} className="space-y-5">
                <Input
                  label="Usuario"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  placeholder="Tu nombre de usuario"
                  required
                  className="px-3.5 py-3 text-base"
                />
                <Input
                  label="Contraseña"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  required
                  className="px-3.5 py-3 text-base"
                  trailing={
                    <button
                      type="button"
                      tabIndex={-1}
                      className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      onClick={() => setShowPassword((v) => !v)}
                    >
                      {showPassword ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                    </button>
                  }
                />

                {error && (
                  <div
                    className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-100"
                    role="alert"
                  >
                    {error}
                  </div>
                )}

                <Button type="submit" size="lg" className="h-11 w-full" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Ingresando…
                    </>
                  ) : (
                    <>
                      <LogIn className="h-4 w-4" />
                      Ingresar
                    </>
                  )}
                </Button>
              </form>
            </CardBody>
          </Card>
        </div>
      </main>

      {native && (
        <BarcodeScannerModal
          open={showServerQr}
          onClose={() => setShowServerQr(false)}
          onScan={handleServerQrScan}
          title={connMode === 'cloud' ? 'Escanear QR de la nube' : 'Escanear QR del PC servidor'}
          variant="qr"
        />
      )}
    </div>
  )
}
