import { useState } from 'react'
import { Camera, Dices, Printer, X } from 'lucide-react'
import { BarcodePrintModal } from '@/components/BarcodePrintModal'
import { BarcodeScannerModal } from '@/components/BarcodeScannerModal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { api } from '@/lib/utils'
import type { Producto } from '@/types'

interface ProductQuickCreateModalProps {
  open: boolean
  onClose: () => void
  onCreated: (producto: Producto) => void
}

export function ProductQuickCreateModal({
  open,
  onClose,
  onCreated
}: ProductQuickCreateModalProps) {
  const [codigoInterno, setCodigoInterno] = useState('')
  const [codigoBarras, setCodigoBarras] = useState('')
  const [nombre, setNombre] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showScanner, setShowScanner] = useState(false)
  const [showBarcodePrint, setShowBarcodePrint] = useState(false)

  if (!open) return null

  function reset() {
    setCodigoInterno('')
    setCodigoBarras('')
    setNombre('')
    setError('')
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleGenerarCodigos() {
    try {
      const data = await api<{ codigo_interno: string; codigo_barras: string }>(
        '/api/productos/generar-codigos'
      )
      setCodigoInterno(data.codigo_interno)
      setCodigoBarras(data.codigo_barras)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al generar códigos')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const result = await api<{ id: number }>('/api/productos', {
        method: 'POST',
        body: JSON.stringify({
          codigo_interno: codigoInterno,
          codigo_barras: codigoBarras || null,
          nombre,
          activo: true
        })
      })
      const producto = await api<Producto>(`/api/productos/${result.id}`)
      onCreated(producto)
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear producto')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-slate-900/50" onClick={handleClose} />
        <div className="relative z-10 w-full max-w-md rounded-xl border border-surface-border bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-surface-border px-5 py-4">
            <h3 className="font-semibold text-slate-900">Nuevo producto</h3>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 p-5">
            {error && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
            )}

            <Input
              label="Código interno *"
              value={codigoInterno}
              onChange={(e) => setCodigoInterno(e.target.value.toUpperCase())}
              required
            />
            <Input
              label="Nombre *"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
            />
            <div className="space-y-2">
              <Input
                label="Código de barras"
                value={codigoBarras}
                onChange={(e) => setCodigoBarras(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={handleGenerarCodigos}>
                  <Dices className="h-4 w-4" />
                  Generar códigos
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => setShowScanner(true)}>
                  <Camera className="h-4 w-4" />
                  Escanear barras
                </Button>
                {codigoBarras.trim() && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowBarcodePrint(true)}
                  >
                    <Printer className="h-4 w-4" />
                    Imprimir etiqueta
                  </Button>
                )}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={saving}>
                {saving ? 'Creando...' : 'Crear y usar'}
              </Button>
              <Button type="button" variant="secondary" onClick={handleClose}>
                Cancelar
              </Button>
            </div>
          </form>
        </div>
      </div>

      <BarcodeScannerModal
        open={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={(code) => {
          setCodigoBarras(code)
          setShowScanner(false)
        }}
        title="Escanear código de barras"
      />
      <BarcodePrintModal
        open={showBarcodePrint}
        onClose={() => setShowBarcodePrint(false)}
        codigoBarras={codigoBarras}
        nombre={nombre.trim() || undefined}
        codigoInterno={codigoInterno.trim() || undefined}
      />
    </>
  )
}
