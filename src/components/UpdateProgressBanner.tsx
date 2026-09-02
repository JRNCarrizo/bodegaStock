import { useEffect, useState } from 'react'
import { Download, Loader2, RefreshCw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import type { UpdateStatusPayload } from '@/vite-env'

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Banner global: progreso de descarga / listo para instalar,
 * visible aunque salgas de Configuración.
 */
export function UpdateProgressBanner() {
  const navigate = useNavigate()
  const api = typeof window !== 'undefined' ? window.bodegaStock : undefined
  const [phase, setPhase] = useState<'idle' | 'downloading' | 'downloaded' | 'installing'>('idle')
  const [percent, setPercent] = useState(0)
  const [detail, setDetail] = useState('')
  const [version, setVersion] = useState('')
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    if (!api?.onUpdateStatus) return
    return api.onUpdateStatus((status: UpdateStatusPayload) => {
      switch (status.type) {
        case 'download-progress': {
          const p = Math.min(100, Math.max(0, Math.round(status.percent)))
          setPhase('downloading')
          setPercent(p)
          setDetail(`${formatBytes(status.transferred)} / ${formatBytes(status.total)}`)
          break
        }
        case 'downloaded':
          setPhase('downloaded')
          setPercent(100)
          setVersion(status.version)
          break
        case 'installing':
          setPhase('installing')
          break
        case 'error':
        case 'not-available':
        case 'checking':
          setPhase('idle')
          setPercent(0)
          setDetail('')
          break
        default:
          break
      }
    })
  }, [api])

  if (phase === 'idle') return null

  async function instalar() {
    if (!api?.installUpdate) return
    setInstalling(true)
    try {
      const result = await api.installUpdate()
      if (result && 'ok' in result && !result.ok) {
        setInstalling(false)
        setPhase('downloaded')
      }
    } catch {
      setInstalling(false)
    }
  }

  if (phase === 'installing') {
    return (
      <div
        className="shrink-0 border-b border-brand-300 bg-brand-50 px-4 py-2.5 text-sm text-brand-950 lg:px-6"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div className="flex flex-wrap items-center gap-2 font-medium">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-700" aria-hidden />
          Abriendo el instalador de Windows… Vas a ver su barra de progreso.
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-brand-200/80">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-brand-600" />
        </div>
      </div>
    )
  }

  if (phase === 'downloaded') {
    return (
      <div
        className="shrink-0 border-b border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-950 lg:px-6"
        role="status"
        aria-live="polite"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 font-medium">
            <Download className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
            Actualización {version ? `v${version} ` : ''}lista. Se abre el Setup de Windows con
            barra de progreso.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              className="rounded-lg"
              disabled={installing}
              onClick={() => void instalar()}
            >
              {installing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {installing ? 'Abriendo Setup…' : 'Instalar y reiniciar'}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="rounded-lg"
              onClick={() => navigate('/configuracion')}
            >
              Ver detalles
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="shrink-0 border-b border-brand-300 bg-brand-50 px-4 py-2.5 text-sm text-brand-950 lg:px-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="flex items-center gap-2 font-medium">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-700" aria-hidden />
          Descargando actualización…
        </p>
        <span className="tabular-nums text-brand-800">
          {percent}%{detail ? ` · ${detail}` : ''}
        </span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-brand-200/80">
        <div
          className={
            percent <= 0
              ? 'h-full w-1/3 animate-pulse rounded-full bg-brand-600'
              : 'h-full rounded-full bg-brand-600 transition-all duration-300'
          }
          style={percent > 0 ? { width: `${percent}%` } : undefined}
        />
      </div>
    </div>
  )
}
