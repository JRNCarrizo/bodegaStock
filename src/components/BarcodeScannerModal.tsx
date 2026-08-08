import { useEffect, useId, useRef, useState } from 'react'
import { Camera, X } from 'lucide-react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

const BARCODE_FORMATS = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.ITF
]

type ScanVariant = 'barcode' | 'qr'

function qrboxSize(variant: ScanVariant) {
  return (viewfinderWidth: number, viewfinderHeight: number) => {
    const w = viewfinderWidth
    const h = viewfinderHeight
    if (variant === 'qr') {
      const size = Math.floor(Math.min(w, h) * 0.86)
      return {
        width: Math.max(240, Math.min(size, w - 16)),
        height: Math.max(240, Math.min(size, h - 16))
      }
    }
    // Código de barras: ancho útil, más alto que el recorte viejo (120px)
    const boxW = Math.floor(Math.min(w * 0.92, w - 12))
    const boxH = Math.floor(Math.min(h * 0.42, 220))
    return {
      width: Math.max(260, boxW),
      height: Math.max(160, boxH)
    }
  }
}

interface BarcodeScannerModalProps {
  open: boolean
  onClose: () => void
  onScan: (code: string) => void
  title?: string
  /** `qr` = marco grande cuadrado (login / sync). `barcode` = producto. */
  variant?: ScanVariant
}

export function BarcodeScannerModal({
  open,
  onClose,
  onScan,
  title = 'Escanear código de barras',
  variant = 'barcode'
}: BarcodeScannerModalProps) {
  const regionId = useId().replace(/:/g, '')
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const onScanRef = useRef(onScan)
  const onCloseRef = useRef(onClose)
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(false)

  onScanRef.current = onScan
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return

    let active = true
    const scanner = new Html5Qrcode(regionId, { verbose: false })
    scannerRef.current = scanner
    setError('')
    setStarting(true)

    async function stopScanner() {
      try {
        if (scanner.isScanning) await scanner.stop()
        scanner.clear()
      } catch {
        /* ignore cleanup errors */
      }
    }

    async function start() {
      try {
        const cameras = await Html5Qrcode.getCameras()
        if (!active) return

        if (!cameras.length) {
          setError('No se encontró ninguna cámara disponible.')
          setStarting(false)
          return
        }

        const cameraId =
          cameras.find((c) => /back|rear|trasera|environment/i.test(c.label))?.id ??
          cameras[cameras.length - 1]?.id ??
          cameras[0].id

        await scanner.start(
          cameraId,
          {
            fps: 12,
            qrbox: qrboxSize(variant),
            // Más “cuadrado” ayuda en QR vertical en el celular
            aspectRatio: variant === 'qr' ? 1 : 1.333,
            formatsToSupport: BARCODE_FORMATS
          },
          (decoded) => {
            if (!active) return
            onScanRef.current(decoded.trim())
            void stopScanner()
            onCloseRef.current()
          },
          () => {}
        )

        if (active) setStarting(false)
      } catch (err) {
        if (!active) return
        setError(
          err instanceof Error
            ? err.message
            : 'No se pudo acceder a la cámara. Verificá permisos.'
        )
        setStarting(false)
      }
    }

    void start()

    return () => {
      active = false
      void stopScanner()
      scannerRef.current = null
    }
  }, [open, regionId, variant])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-slate-900/60" onClick={onClose} />
      <div
        className={cn(
          'relative w-full bg-white shadow-panel',
          variant === 'qr'
            ? 'max-h-[96dvh] rounded-t-2xl sm:max-w-xl sm:rounded-xl'
            : 'max-w-lg rounded-t-2xl sm:rounded-xl'
        )}
      >
        <div className="flex items-center justify-between border-b border-surface-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-brand-600" />
            <h3 className="font-semibold text-slate-900">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 sm:p-5">
          <p className="mb-3 text-sm text-slate-500">
            {variant === 'qr'
              ? 'Centrá el código QR dentro del marco grande.'
              : 'Apuntá la cámara al código de barras del producto.'}
          </p>

          <div
            className={cn(
              'overflow-hidden rounded-xl bg-slate-900',
              variant === 'qr' && 'min-h-[min(72dvh,560px)]',
              error && 'hidden'
            )}
          >
            <div id={regionId} className="w-full [&_video]:object-cover" />
          </div>

          {starting && !error && (
            <p className="mt-3 text-center text-sm text-slate-500">Iniciando cámara...</p>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <div className="mt-4 flex justify-end pb-[max(0.25rem,env(safe-area-inset-bottom))]">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
