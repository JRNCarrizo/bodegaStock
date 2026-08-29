import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Info } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

export type ConfirmDialogOptions = {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  /** danger = acción destructiva (botón rojo) */
  tone?: 'default' | 'danger'
}

export type AlertDialogOptions = {
  title?: string
  message: string
  confirmLabel?: string
}

type ConfirmDialogApi = {
  confirm: (options: ConfirmDialogOptions | string) => Promise<boolean>
  alert: (options: AlertDialogOptions | string) => Promise<void>
}

type ConfirmPending = {
  kind: 'confirm'
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  tone: 'default' | 'danger'
  resolve: (value: boolean) => void
}

type AlertPending = {
  kind: 'alert'
  title: string
  message: string
  confirmLabel: string
  resolve: () => void
}

type PendingState = ConfirmPending | AlertPending

const ConfirmDialogContext = createContext<ConfirmDialogApi | null>(null)

function toConfirmPending(
  options: ConfirmDialogOptions | string,
  resolve: (value: boolean) => void
): ConfirmPending {
  if (typeof options === 'string') {
    return {
      kind: 'confirm',
      title: 'Confirmar',
      message: options,
      confirmLabel: 'Confirmar',
      cancelLabel: 'Cancelar',
      tone: 'default',
      resolve
    }
  }
  return {
    kind: 'confirm',
    title: options.title ?? 'Confirmar',
    message: options.message,
    confirmLabel: options.confirmLabel ?? 'Confirmar',
    cancelLabel: options.cancelLabel ?? 'Cancelar',
    tone: options.tone ?? 'default',
    resolve
  }
}

function toAlertPending(
  options: AlertDialogOptions | string,
  resolve: () => void
): AlertPending {
  if (typeof options === 'string') {
    return {
      kind: 'alert',
      title: 'Aviso',
      message: options,
      confirmLabel: 'Entendido',
      resolve
    }
  }
  return {
    kind: 'alert',
    title: options.title ?? 'Aviso',
    message: options.message,
    confirmLabel: options.confirmLabel ?? 'Entendido',
    resolve
  }
}

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingState | null>(null)
  const titleId = useId()
  const descId = useId()
  const confirmBtnRef = useRef<HTMLButtonElement>(null)

  const confirm = useCallback((options: ConfirmDialogOptions | string) => {
    return new Promise<boolean>((resolve) => {
      setPending(toConfirmPending(options, resolve))
    })
  }, [])

  const alert = useCallback((options: AlertDialogOptions | string) => {
    return new Promise<void>((resolve) => {
      setPending(toAlertPending(options, resolve))
    })
  }, [])

  const closeConfirm = useCallback((value: boolean) => {
    setPending((curr) => {
      if (curr?.kind === 'confirm') curr.resolve(value)
      return null
    })
  }, [])

  const closeAlert = useCallback(() => {
    setPending((curr) => {
      if (curr?.kind === 'alert') curr.resolve()
      return null
    })
  }, [])

  useEffect(() => {
    if (!pending) return
    const t = window.setTimeout(() => confirmBtnRef.current?.focus(), 30)
    return () => window.clearTimeout(t)
  }, [pending])

  useEffect(() => {
    if (!pending) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      if (pending.kind === 'confirm') closeConfirm(false)
      else closeAlert()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [pending, closeConfirm, closeAlert])

  return (
    <ConfirmDialogContext.Provider value={{ confirm, alert }}>
      {children}
      {pending &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center">
            <div
              className="absolute inset-0 bg-slate-900/50"
              aria-hidden
              onClick={() => {
                if (pending.kind === 'confirm') closeConfirm(false)
                else closeAlert()
              }}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              aria-describedby={descId}
              className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-surface-border bg-white shadow-xl"
            >
              <div className="flex items-start gap-3 border-b border-surface-border px-5 py-4">
                <div
                  className={cn(
                    'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                    pending.kind === 'confirm' && pending.tone === 'danger'
                      ? 'bg-red-50 text-red-600'
                      : pending.kind === 'alert'
                        ? 'bg-sky-50 text-sky-600'
                        : 'bg-amber-50 text-amber-600'
                  )}
                >
                  {pending.kind === 'alert' ? (
                    <Info className="h-4 w-4" />
                  ) : (
                    <AlertTriangle className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 id={titleId} className="text-base font-semibold text-slate-900">
                    {pending.title}
                  </h3>
                  <p
                    id={descId}
                    className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-600"
                  >
                    {pending.message}
                  </p>
                </div>
              </div>
              <div className="flex flex-col-reverse gap-2 px-5 py-4 sm:flex-row sm:justify-end">
                {pending.kind === 'confirm' && (
                  <Button
                    type="button"
                    variant="secondary"
                    className="rounded-xl"
                    onClick={() => closeConfirm(false)}
                  >
                    {pending.cancelLabel}
                  </Button>
                )}
                <Button
                  ref={confirmBtnRef}
                  type="button"
                  variant={
                    pending.kind === 'confirm' && pending.tone === 'danger' ? 'danger' : 'primary'
                  }
                  className="rounded-xl"
                  onClick={() => {
                    if (pending.kind === 'confirm') closeConfirm(true)
                    else closeAlert()
                  }}
                >
                  {pending.confirmLabel}
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </ConfirmDialogContext.Provider>
  )
}

export function useConfirmDialog(): ConfirmDialogApi {
  const ctx = useContext(ConfirmDialogContext)
  if (!ctx) {
    throw new Error('useConfirmDialog debe usarse dentro de ConfirmDialogProvider')
  }
  return ctx
}
