import { useState } from 'react'
import { CircleHelp, Download, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useEscHandler } from '@/hooks/useEscHandler'
import { downloadHelpGuide, getHelpGuide } from '@/lib/helpGuides'
import { cn } from '@/lib/utils'

type SectionHelpButtonProps = {
  guideId: string
  className?: string
  /** Tamaño del botón ícono */
  size?: 'sm' | 'md'
}

/**
 * Ícono “?” junto al título de la sección.
 * Abre instrucciones simples y permite descargar esa guía.
 */
export function SectionHelpButton({ guideId, className, size = 'md' }: SectionHelpButtonProps) {
  const guide = getHelpGuide(guideId)
  const [open, setOpen] = useState(false)

  useEscHandler(open, () => {
    setOpen(false)
    return true
  })

  if (!guide) return null

  const iconSize = size === 'sm' ? 'h-4 w-4' : 'h-[1.15rem] w-[1.15rem]'
  const btnPad = size === 'sm' ? 'p-1.5' : 'p-2'

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`Ayuda: ${guide.sectionTitle}`}
        aria-label={`Abrir instrucciones de ${guide.sectionTitle}`}
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors',
          'hover:bg-brand-50 hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30',
          btnPad,
          className
        )}
      >
        <CircleHelp className={iconSize} aria-hidden />
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-4">
          <button
            type="button"
            aria-label="Cerrar"
            className="absolute inset-0 bg-slate-900/45"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`help-title-${guide.id}`}
            className="relative z-10 flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-surface-border bg-white shadow-xl sm:rounded-2xl"
          >
            <div className="flex items-start gap-3 border-b border-surface-border px-5 py-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                <CircleHelp className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Cómo usar
                </p>
                <h2
                  id={`help-title-${guide.id}`}
                  className="text-lg font-semibold tracking-tight text-slate-900"
                >
                  {guide.sectionTitle}
                </h2>
              </div>
              <button
                type="button"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <p className="text-sm leading-relaxed text-slate-600">{guide.summary}</p>

              <ol className="mt-5 space-y-4">
                {guide.steps.map((step, index) => (
                  <li key={step.title} className="flex gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold tabular-nums text-slate-700">
                      {index + 1}
                    </span>
                    <div className="min-w-0 pt-0.5">
                      <p className="text-sm font-semibold text-slate-900">{step.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-slate-600">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>

              {guide.tips && guide.tips.length > 0 && (
                <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Consejos
                  </p>
                  <ul className="mt-2 space-y-2">
                    {guide.tips.map((tip) => (
                      <li key={tip} className="text-sm leading-relaxed text-slate-600">
                        · {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-surface-border bg-white px-5 py-3">
              <p className="text-[11px] text-slate-400">
                Se guarda en PDF para ir armando el manual
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="rounded-xl"
                  onClick={() => void downloadHelpGuide(guide)}
                >
                  <Download className="h-4 w-4" />
                  Descargar PDF
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="rounded-xl"
                  onClick={() => setOpen(false)}
                >
                  Entendido
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
