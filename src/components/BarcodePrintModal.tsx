import { useEffect, useState } from 'react'
import { Download, Printer, X } from 'lucide-react'
import {
  downloadBarcodeLabel,
  generateBarcodeDataUrl,
  printBarcodeLabel,
  type BarcodeLabelOptions
} from '@/lib/barcode'
import { Button } from '@/components/ui/Button'

interface BarcodePrintModalProps extends BarcodeLabelOptions {
  open: boolean
  onClose: () => void
}

export function BarcodePrintModal({
  open,
  onClose,
  codigoBarras,
  nombre,
  codigoInterno
}: BarcodePrintModalProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const label: BarcodeLabelOptions = { codigoBarras, nombre, codigoInterno }

  useEffect(() => {
    if (!open) {
      setPreviewUrl(null)
      setError('')
      return
    }

    const code = codigoBarras.trim()
    if (!code) {
      setError('Ingresá un código de barras para generar la etiqueta')
      setPreviewUrl(null)
      return
    }

    try {
      setPreviewUrl(generateBarcodeDataUrl(code))
      setError('')
    } catch (err) {
      setPreviewUrl(null)
      setError(err instanceof Error ? err.message : 'No se pudo generar el código de barras')
    }
  }, [open, codigoBarras])

  if (!open) return null

  async function handlePrint() {
    setBusy(true)
    setError('')
    try {
      const ok = await printBarcodeLabel(label)
      if (!ok) setError('Permití ventanas emergentes para imprimir')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al imprimir')
    } finally {
      setBusy(false)
    }
  }

  async function handleDownload() {
    setBusy(true)
    setError('')
    try {
      await downloadBarcodeLabel(label)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al descargar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-md rounded-xl border border-surface-border bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-surface-border px-5 py-4">
          <div>
            <h3 className="font-semibold text-slate-900">Etiqueta de código de barras</h3>
            <p className="text-xs text-slate-500">Vista previa para imprimir o guardar como PNG</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          {(nombre || codigoInterno) && (
            <div className="text-center">
              {nombre && <p className="font-medium text-slate-900">{nombre}</p>}
              {codigoInterno && (
                <p className="font-mono text-xs text-slate-500">{codigoInterno}</p>
              )}
            </div>
          )}

          <div className="flex min-h-[120px] items-center justify-center rounded-lg border border-dashed border-surface-border bg-slate-50 p-4">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt={`Código de barras ${codigoBarras}`}
                className="max-h-32 max-w-full object-contain"
              />
            ) : (
              <p className="text-sm text-slate-400">Sin vista previa</p>
            )}
          </div>

          <p className="text-center font-mono text-sm text-slate-700">{codigoBarras.trim() || '—'}</p>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="button" onClick={handlePrint} disabled={!previewUrl || busy}>
              <Printer className="h-4 w-4" />
              Imprimir
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handleDownload}
              disabled={!previewUrl || busy}
            >
              <Download className="h-4 w-4" />
              Descargar PNG
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
