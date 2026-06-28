import { useEffect, useId, useRef, useState } from 'react'
import { Camera, X } from 'lucide-react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

const BARCODE_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.ITF
]

interface BarcodeScannerModalProps {
  open: boolean
  onClose: () => void
  onScan: (code: string) => void
  title?: string
}

export function BarcodeScannerModal({
  open,
  onClose,
  onScan,
  title = 'Escanear código de barras'
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
            fps: 10,
            qrbox: { width: 320, height: 120 },
            aspectRatio: 1.777,
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
  }, [open, regionId])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-xl bg-white shadow-panel">
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

        <div className="p-5">
          <p className="mb-3 text-sm text-slate-500">
            Apuntá la cámara al código de barras del producto.
          </p>

          <div
            className={cn(
              'overflow-hidden rounded-lg bg-slate-900',
              error && 'hidden'
            )}
          >
            <div id={regionId} className="w-full" />
          </div>

          {starting && !error && (
            <p className="mt-3 text-center text-sm text-slate-500">Iniciando cámara...</p>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <div className="mt-4 flex justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
