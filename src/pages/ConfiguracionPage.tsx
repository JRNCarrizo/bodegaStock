import { useCallback, useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import {
  Check,
  Copy,
  Download,
  RefreshCw,
  Server,
  Smartphone,
  Wifi
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge, Card, CardBody, CardHeader } from '@/components/ui/Card'
import type {
  AppInfo,
  NetworkConfig,
  NetworkRuntimeInfo,
  UpdateStatusPayload
} from '@/vite-env'

type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'dev-mode'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function displayRemoteHost(host: string): string {
  const trimmed = host.trim()
  return trimmed === '127.0.0.1' ? '' : trimmed
}

function parseServerConnection(raw: string): { host: string; port?: string } | null {
  const value = raw.trim()
  if (!value) return null

  try {
    const url = value.includes('://') ? new URL(value) : new URL(`http://${value}`)
    const host = url.hostname
    const port = url.port || undefined
    if (!host) return null
    return { host, port }
  } catch {
    const match = value.match(/^([\d.]+)(?::(\d+))?$/)
    if (!match) return null
    return { host: match[1], port: match[2] }
  }
}

export function ConfiguracionPage() {
  const api = window.bodegaStock
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [networkInfo, setNetworkInfo] = useState<NetworkRuntimeInfo | null>(null)
  const [mode, setMode] = useState<NetworkConfig['mode']>('server')
  const [remoteHost, setRemoteHost] = useState('')
  const [port, setPort] = useState('3847')
  const [connectionTest, setConnectionTest] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [connectionMessage, setConnectionMessage] = useState('')
  const [savingNetwork, setSavingNetwork] = useState(false)
  const [copiedUrl, setCopiedUrl] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [phase, setPhase] = useState<UpdatePhase>('idle')
  const [availableVersion, setAvailableVersion] = useState('')
  const [releaseNotes, setReleaseNotes] = useState('')
  const [downloadPercent, setDownloadPercent] = useState(0)
  const [downloadDetail, setDownloadDetail] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const primaryConnectionUrl = useMemo(
    () => networkInfo?.connectionUrls[0] ?? '',
    [networkInfo?.connectionUrls]
  )

  const loadNetworkInfo = useCallback(async () => {
    if (!api?.getNetworkInfo) return
    const info = await api.getNetworkInfo()
    setNetworkInfo(info)
    setMode(info.config.mode)
    setRemoteHost(displayRemoteHost(info.config.remoteHost))
    setPort(String(info.config.port))
  }, [api])

  useEffect(() => {
    void loadNetworkInfo()
  }, [loadNetworkInfo])

  useEffect(() => {
    if (!primaryConnectionUrl || mode !== 'server') {
      setQrDataUrl(null)
      return
    }

    void QRCode.toDataURL(primaryConnectionUrl, {
      margin: 1,
      width: 180,
      color: { dark: '#0f172a', light: '#ffffff' }
    }).then(setQrDataUrl)
  }, [primaryConnectionUrl, mode])

  const handleStatus = useCallback((status: UpdateStatusPayload) => {
    switch (status.type) {
      case 'checking':
        setPhase('checking')
        setErrorMessage('')
        break
      case 'available':
        setPhase('available')
        setAvailableVersion(status.version)
        setReleaseNotes(status.releaseNotes ?? '')
        break
      case 'not-available':
        setPhase('not-available')
        setAvailableVersion(status.version)
        break
      case 'download-progress':
        setPhase('downloading')
        setDownloadPercent(Math.round(status.percent))
        setDownloadDetail(`${formatBytes(status.transferred)} / ${formatBytes(status.total)}`)
        break
      case 'downloaded':
        setPhase('downloaded')
        setAvailableVersion(status.version)
        break
      case 'error':
        setPhase('error')
        setErrorMessage(status.message)
        break
    }
  }, [])

  useEffect(() => {
    if (!api?.getAppInfo) return
    void api.getAppInfo().then(setAppInfo)
  }, [api])

  useEffect(() => {
    if (!api?.onUpdateStatus) return
    return api.onUpdateStatus(handleStatus)
  }, [api, handleStatus])

  async function buscarActualizaciones() {
    if (!api?.checkForUpdates) {
      setPhase('dev-mode')
      return
    }

    setPhase('checking')
    setErrorMessage('')

    const result = await api.checkForUpdates()
    if (result.reason === 'dev') {
      setPhase('dev-mode')
      return
    }
    if (!result.ok) {
      setPhase('error')
      setErrorMessage(
        result.message ??
          'No se pudo comprobar actualizaciones. Verifique que la app esté instalada y que exista un servidor de releases configurado.'
      )
    }
  }

  async function descargarActualizacion() {
    if (!api?.downloadUpdate) return
    setPhase('downloading')
    setDownloadPercent(0)
    const result = await api.downloadUpdate()
    if (!result.ok) {
      setPhase('error')
      setErrorMessage(result.message ?? 'Error al descargar la actualización')
    }
  }

  async function instalarActualizacion() {
    if (!api?.installUpdate) return
    await api.installUpdate()
  }

  async function probarConexion() {
    if (!api?.testNetworkConnection) return

    setConnectionTest('testing')
    setConnectionMessage('')

    const result = await api.testNetworkConnection(remoteHost.trim(), Number(port) || 3847)
    if (result.ok) {
      setConnectionTest('ok')
      setConnectionMessage(
        result.version
          ? `Conectado a ${result.app ?? 'ControlStock'} v${result.version}`
          : 'Conexión exitosa con el servidor'
      )
      return
    }

    setConnectionTest('fail')
    setConnectionMessage(result.message ?? 'No se pudo conectar')
  }

  async function guardarRed() {
    if (!api?.applyNetworkConfig) return

    const host = remoteHost.trim()
    if (mode === 'client' && !host) {
      setConnectionTest('fail')
      setConnectionMessage('Ingresá la IP del servidor (no uses 127.0.0.1 salvo que el servidor sea esta misma PC).')
      return
    }

    setSavingNetwork(true)
    try {
      await api.applyNetworkConfig({
        mode,
        remoteHost: host || '127.0.0.1',
        port: Number(port) || 3847
      })
    } finally {
      setSavingNetwork(false)
    }
  }

  async function copiarUrl(url: string) {
    await navigator.clipboard.writeText(url)
    setCopiedUrl(url)
    setTimeout(() => setCopiedUrl(''), 2000)
  }

  const isElectron = Boolean(api?.getAppInfo)
  const isPackaged = appInfo?.isPackaged ?? false
  const hasNetworkConfig = Boolean(api?.applyNetworkConfig)

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-base font-semibold text-slate-900 sm:text-lg">Configuración</h1>
        <p className="text-xs text-slate-500">Red local, actualizaciones y datos de la aplicación</p>
      </div>

      <Card>
        <CardHeader
          title="Red y conexión"
          description="Servidor en una PC; otras PCs y celulares se conectan por WiFi/LAN"
        />
        <CardBody className="space-y-4">
          {!hasNetworkConfig ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              La configuración de red está disponible en la aplicación de escritorio instalada.
            </p>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setMode('server')}
                  className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                    mode === 'server'
                      ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500/30'
                      : 'border-surface-border hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Server className="h-4 w-4 text-brand-600" />
                    <span className="text-sm font-semibold text-slate-900">Esta PC es el servidor</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Base de datos local. Otras PCs y celulares se conectan acá.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMode('client')
                    if (remoteHost.trim() === '127.0.0.1' || !remoteHost.trim()) setRemoteHost('')
                    setConnectionTest('idle')
                  }}
                  className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                    mode === 'client'
                      ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500/30'
                      : 'border-surface-border hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Wifi className="h-4 w-4 text-brand-600" />
                    <span className="text-sm font-semibold text-slate-900">Esta PC es cliente</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Sin base local. Se conecta al servidor por IP de red.
                  </p>
                </button>
              </div>

              <div className="space-y-4">
                {mode === 'client' && (
                  <div className="space-y-1 sm:grid sm:grid-cols-[minmax(0,1fr)_7rem] sm:gap-4 sm:space-y-0">
                    <div className="space-y-1">
                      <Input
                        label="IP del servidor"
                        value={remoteHost}
                        onChange={(e) => {
                          setRemoteHost(e.target.value)
                          setConnectionTest('idle')
                        }}
                        onPaste={(e) => {
                          const pasted = e.clipboardData.getData('text')
                          const parsed = parseServerConnection(pasted)
                          if (!parsed) return
                          e.preventDefault()
                          setRemoteHost(parsed.host)
                          if (parsed.port) setPort(parsed.port)
                          setConnectionTest('idle')
                        }}
                        placeholder="192.168.1.50"
                      />
                      <p className="text-xs text-slate-500">
                        Solo la IP (ej. 192.168.1.50). También podés pegar la URL completa del servidor.
                        <strong className="text-amber-700"> No uses 127.0.0.1</strong> — es esta PC, no el servidor.
                      </p>
                    </div>
                    <Input
                      label="Puerto"
                      value={port}
                      onChange={(e) => {
                        setPort(e.target.value.replace(/\D/g, ''))
                        setConnectionTest('idle')
                      }}
                      inputMode="numeric"
                    />
                  </div>
                )}
                {mode === 'server' && (
                  <Input
                    label="Puerto de red"
                    value={port}
                    onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))}
                    inputMode="numeric"
                    className="max-w-[8rem]"
                  />
                )}
              </div>

              {mode === 'server' && (
                <div className="space-y-3 rounded-lg border border-surface-border bg-slate-50/80 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={networkInfo?.serverRunning ? 'success' : 'warning'}>
                      {networkInfo?.serverRunning ? 'Servidor activo' : 'Servidor inactivo'}
                    </Badge>
                    <span className="text-xs text-slate-500">
                      Escuchando en la red local (puerto {port || '3847'})
                    </span>
                  </div>

                  {networkInfo?.connectionUrls.length ? (
                    <div className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        URLs para clientes y celulares
                      </p>
                      {networkInfo.connectionUrls.map((url) => (
                        <div key={url} className="flex flex-wrap items-center gap-2">
                          <code className="rounded bg-white px-2 py-1 text-sm text-slate-800 ring-1 ring-surface-border">
                            {url}
                          </code>
                          <Button type="button" variant="ghost" size="sm" onClick={() => void copiarUrl(url)}>
                            {copiedUrl === url ? (
                              <Check className="h-4 w-4 text-green-600" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                            Copiar
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-amber-700">
                      No se detectó una IP de red local. Verificá que la PC esté conectada al WiFi/LAN.
                    </p>
                  )}

                  {qrDataUrl && primaryConnectionUrl && (
                    <div className="flex flex-wrap items-start gap-4 border-t border-surface-border pt-4">
                      <img
                        src={qrDataUrl}
                        alt={`QR de conexión ${primaryConnectionUrl}`}
                        className="rounded-lg border border-surface-border bg-white p-2"
                      />
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                          <Smartphone className="h-4 w-4" />
                          Conexión para celulares (APK)
                        </div>
                        <p className="text-xs text-slate-500">
                          Cuando la app móvil esté lista, podrán escanear este QR o ingresar la IP manualmente.
                        </p>
                        <p className="font-mono text-xs text-slate-700">{primaryConnectionUrl}</p>
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-slate-500">
                    Si otras PCs o celulares no conectan, permití ControlStock en el firewall de Windows para el
                    puerto {port || '3847'}.
                  </p>
                </div>
              )}

              {mode === 'client' && (
                <div className="space-y-3 rounded-lg border border-surface-border bg-slate-50/80 p-4">
                  <p className="text-sm text-slate-600">
                    Ingresá la IP del PC servidor (la ves en Configuración del servidor). Puerto por defecto:{' '}
                    <strong>3847</strong>.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="secondary" size="sm" onClick={() => void probarConexion()}>
                      Probar conexión
                    </Button>
                  </div>
                  {connectionTest === 'testing' && (
                    <p className="text-sm text-slate-500">Probando conexión…</p>
                  )}
                  {connectionTest === 'ok' && (
                    <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{connectionMessage}</p>
                  )}
                  {connectionTest === 'fail' && (
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{connectionMessage}</p>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2 border-t border-surface-border pt-4">
                <Button type="button" onClick={() => void guardarRed()} disabled={savingNetwork}>
                  {savingNetwork ? 'Guardando…' : 'Guardar y reiniciar'}
                </Button>
                <Button type="button" variant="secondary" onClick={() => void loadNetworkInfo()}>
                  Descartar cambios
                </Button>
              </div>
              <p className="text-xs text-slate-400">
                Los cambios de modo o puerto requieren reiniciar la aplicación.
              </p>
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Actualizar sistema" />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span>Versión instalada:</span>
            <Badge variant="default">{appInfo?.version ?? '…'}</Badge>
            {isElectron && (
              <Badge variant={isPackaged ? 'success' : 'warning'}>
                {isPackaged ? 'Instalada en PC' : 'Modo desarrollo'}
              </Badge>
            )}
          </div>

          {!isElectron && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Está usando la versión web. Las actualizaciones automáticas están disponibles solo en la
              aplicación de escritorio instalada.
            </p>
          )}

          {phase === 'dev-mode' && (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              En modo desarrollo no se buscan actualizaciones. Genere e instale el instalador (.exe)
              para probar las actualizaciones automáticas.
            </p>
          )}

          {phase === 'checking' && (
            <p className="flex items-center gap-2 text-sm text-slate-600">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Buscando actualizaciones…
            </p>
          )}

          {phase === 'not-available' && (
            <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
              Ya tiene la última versión ({availableVersion || appInfo?.version}).
            </p>
          )}

          {phase === 'available' && (
            <div className="space-y-3 rounded-lg border border-brand-200 bg-brand-50 px-3 py-3">
              <p className="text-sm font-medium text-brand-900">
                Hay una nueva versión disponible: {availableVersion}
              </p>
              {releaseNotes && (
                <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap text-xs text-brand-800">
                  {releaseNotes}
                </pre>
              )}
              <Button size="sm" onClick={() => void descargarActualizacion()}>
                <Download className="h-4 w-4" />
                Descargar actualización
              </Button>
            </div>
          )}

          {phase === 'downloading' && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-slate-600">
                <span>Descargando…</span>
                <span>{downloadPercent}% {downloadDetail && `· ${downloadDetail}`}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-brand-600 transition-all"
                  style={{ width: `${downloadPercent}%` }}
                />
              </div>
            </div>
          )}

          {phase === 'downloaded' && (
            <div className="space-y-3 rounded-lg border border-green-200 bg-green-50 px-3 py-3">
              <p className="text-sm font-medium text-green-900">
                Versión {availableVersion} descargada. Reinicie para aplicar los cambios.
              </p>
              <Button size="sm" onClick={() => void instalarActualizacion()}>
                Instalar y reiniciar
              </Button>
            </div>
          )}

          {phase === 'error' && errorMessage && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{errorMessage}</p>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              variant="secondary"
              size="sm"
              disabled={phase === 'checking' || phase === 'downloading'}
              onClick={() => void buscarActualizaciones()}
            >
              <RefreshCw className={`h-4 w-4 ${phase === 'checking' ? 'animate-spin' : ''}`} />
              Buscar actualizaciones
            </Button>
          </div>

          {isPackaged && (
            <p className="text-xs text-slate-400">
              Las actualizaciones se descargan desde{' '}
              <a
                href="https://github.com/JRNCarrizo/bodegaStock/releases"
                className="text-brand-600 hover:underline"
                onClick={(e) => {
                  e.preventDefault()
                  window.open('https://github.com/JRNCarrizo/bodegaStock/releases', '_blank')
                }}
              >
                GitHub Releases
              </a>
              . Si esta versión fue instalada antes de v0.2.2, puede ser necesario actualizar
              manualmente una vez.
            </p>
          )}
        </CardBody>
      </Card>
    </div>
  )
}

