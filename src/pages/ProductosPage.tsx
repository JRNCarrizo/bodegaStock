import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Barcode,
  Camera,
  ChevronLeft,
  Dices,
  Download,
  FileSpreadsheet,
  ImagePlus,
  Loader2,
  Package,
  Pencil,
  Plus,
  Printer,
  Search,
  Upload
} from 'lucide-react'
import { BarcodePrintModal } from '@/components/BarcodePrintModal'
import { BarcodeScannerModal } from '@/components/BarcodeScannerModal'
import { downloadApiFile } from '@/lib/downloadFile'
import { api } from '@/lib/utils'
import { prepareProductImage } from '@/lib/image'
import type { Producto, ProductoForm } from '@/types'
import { useAuth } from '@/context/AuthContext'
import { useEscHandler } from '@/hooks/useEscHandler'
import { useRegistroListKeyboard } from '@/hooks/useRegistroListKeyboard'
import { focusAndScrollIntoView } from '@/lib/scroll'
import { ImagePreviewModal } from '@/components/ImagePreviewModal'
import { ProductImage } from '@/components/ProductImage'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge, Card, CardBody } from '@/components/ui/Card'

const emptyForm = (): ProductoForm => ({
  codigo_interno: '',
  codigo_barras: '',
  nombre: '',
  descripcion: '',
  unidad: 'botella',
  unidades_por_pallet_default: 112,
  unidades_por_caja_default: 6,
  activo: true
})

export function ProductosPage() {
  const { hasPermiso } = useAuth()
  const [productos, setProductos] = useState<Producto[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState<'list' | 'form'>('list')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingHadImage, setEditingHadImage] = useState(false)
  const [form, setForm] = useState<ProductoForm>(emptyForm())
  const [imagenPreview, setImagenPreview] = useState<string | null>(null)
  const [imagenBase64, setImagenBase64] = useState<string | null>(null)
  const [imagenMime, setImagenMime] = useState<string | null>(null)
  const [eliminarImagen, setEliminarImagen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [downloadingPlantilla, setDownloadingPlantilla] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{
    total_filas: number
    creados: number
    omitidos: number
    detalle: Array<{ fila: number; codigo_interno: string; estado: string; motivo?: string }>
  } | null>(null)
  const [showScanner, setShowScanner] = useState(false)
  const [barcodePrint, setBarcodePrint] = useState<{
    codigoBarras: string
    nombre?: string
    codigoInterno?: string
  } | null>(null)
  const [imagePreview, setImagePreview] = useState<{
    src: string
    alt: string
    title?: string
  } | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const codigoInternoRef = useRef<HTMLInputElement>(null)
  const nombreRef = useRef<HTMLInputElement>(null)
  const descripcionRef = useRef<HTMLInputElement>(null)
  const codigoBarrasRef = useRef<HTMLInputElement>(null)
  const activoRef = useRef<HTMLInputElement>(null)
  const imagenInputRef = useRef<HTMLInputElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  function focusField(ref: React.RefObject<HTMLElement | null>) {
    requestAnimationFrame(() => {
      const el = ref.current
      if (!el) return
      el.focus()
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
  }

  function submitFormulario() {
    if (saving) return
    formRef.current?.requestSubmit()
  }

  function handleFormKeyDown(
    e: React.KeyboardEvent,
    next?: React.RefObject<HTMLInputElement | null>
  ) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (next?.current) {
      focusField(next)
    } else {
      submitFormulario()
    }
  }

  useEscHandler(!!imagePreview, () => {
    setImagePreview(null)
    return true
  })

  useEscHandler(view === 'form', () => {
    if (imagePreview) return false

    if (showScanner) {
      setShowScanner(false)
      return true
    }

    if (saving) return false

    volverAlListado()
    return true
  })

  function abrirNuevoProducto() {
    openCreate()
  }

  async function descargarPlantilla() {
    setDownloadingPlantilla(true)
    setError('')
    try {
      await downloadApiFile('/api/productos/plantilla', 'plantilla-productos.xlsx')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al descargar plantilla')
    } finally {
      setDownloadingPlantilla(false)
    }
  }

  async function importarExcel(file: File) {
    setImporting(true)
    setError('')
    setImportResult(null)
    try {
      const buffer = await file.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
      const file_base64 = btoa(binary)

      const result = await api<{
        total_filas: number
        creados: number
        omitidos: number
        detalle: Array<{ fila: number; codigo_interno: string; estado: string; motivo?: string }>
      }>('/api/productos/import', {
        method: 'POST',
        body: JSON.stringify({ file_base64 }),
        timeoutMs: 60000
      })
      setImportResult(result)
      await load(search)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al importar productos')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  const load = useCallback(async (q?: string) => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (q?.trim()) params.set('q', q.trim())
      const data = await api<Producto[]>(`/api/productos?${params}`)
      setProductos(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar productos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (view !== 'list') return
    const timer = setTimeout(() => focusAndScrollIntoView(searchRef.current), 80)
    return () => clearTimeout(timer)
  }, [view])

  useEffect(() => {
    const timer = setTimeout(() => load(search), 300)
    return () => clearTimeout(timer)
  }, [search, load])

  function resetFormFields() {
    setForm(emptyForm())
    setEditingId(null)
    setImagenPreview(null)
    setImagenBase64(null)
    setImagenMime(null)
    setEliminarImagen(false)
    setEditingHadImage(false)
  }

  function volverAlListado() {
    resetFormFields()
    setError('')
    setView('list')
  }

  function openCreate() {
    resetFormFields()
    setError('')
    setView('form')
    setTimeout(() => focusField(codigoInternoRef), 50)
  }

  function openEdit(p: Producto) {
    setEditingId(p.id)
    setEditingHadImage(!!p.imagen_path)
    setForm({
      codigo_interno: p.codigo_interno,
      codigo_barras: p.codigo_barras ?? '',
      nombre: p.nombre,
      descripcion: p.descripcion ?? '',
      unidad: p.unidad || 'botella',
      unidades_por_pallet_default: p.unidades_por_pallet_default ?? 112,
      unidades_por_caja_default: p.unidades_por_caja_default ?? 6,
      activo: !!p.activo
    })
    setImagenPreview(null)
    setImagenBase64(null)
    setImagenMime(null)
    setEliminarImagen(false)
    setError('')
    setView('form')
    setTimeout(() => focusField(codigoInternoRef), 50)
  }

  const registroListKb = useRegistroListKeyboard({
    enabled: view === 'list' && !showScanner && !imagePreview && !barcodePrint,
    items: productos,
    listSearchRef: searchRef,
    canCreate: hasPermiso('productos.crear'),
    onCreate: abrirNuevoProducto,
    onOpenDetail: (p) => {
      if (hasPermiso('productos.editar')) openEdit(p)
    }
  })

  async function handleGenerarCodigos() {
    try {
      const data = await api<{ codigo_interno: string; codigo_barras: string }>(
        '/api/productos/generar-codigos'
      )
      setForm((f) => ({
        ...f,
        codigo_interno: data.codigo_interno,
        codigo_barras: data.codigo_barras
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al generar códigos')
    }
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      setError('La imagen no puede superar 10 MB')
      return
    }
    setError('')
    try {
      const { base64, mime } = await prepareProductImage(file)
      setImagenPreview(base64)
      setImagenBase64(base64)
      setImagenMime(mime)
      setEliminarImagen(false)
    } catch {
      setError('No se pudo cargar la imagen. Probá con otro archivo.')
    }
    e.target.value = ''
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const payload: Record<string, unknown> = {
      codigo_interno: form.codigo_interno,
      codigo_barras: form.codigo_barras || null,
      nombre: form.nombre,
      descripcion: form.descripcion || null,
      unidad: form.unidad.trim() || 'botella',
      unidades_por_pallet_default:
        form.unidades_por_pallet_default === '' ? 112 : Number(form.unidades_por_pallet_default),
      unidades_por_caja_default:
        form.unidades_por_caja_default === '' ? 6 : Number(form.unidades_por_caja_default),
      activo: form.activo
    }

    if (imagenBase64) {
      payload.imagen_base64 = imagenBase64
      payload.imagen_mime = imagenMime
    }
    if (eliminarImagen) {
      payload.eliminar_imagen = true
    }

    try {
      if (editingId) {
        await api(`/api/productos/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        })
      } else {
        await api('/api/productos', {
          method: 'POST',
          body: JSON.stringify(payload)
        })
      }
      volverAlListado()
      await load(search)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const formContent = (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[160px_1fr]">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Imagen</p>
          <div className="relative">
            {imagenPreview ? (
              <button
                type="button"
                onClick={() =>
                  setImagePreview({
                    src: imagenPreview,
                    alt: form.nombre,
                    title: form.nombre
                  })
                }
                className="group relative block w-full cursor-zoom-in overflow-hidden rounded-xl ring-1 ring-surface-border"
                title="Ver imagen ampliada"
              >
                <img
                  src={imagenPreview}
                  alt="Vista previa"
                  className="h-36 w-full object-cover"
                />
              </button>
            ) : editingId ? (
              <ProductImage
                productoId={editingId}
                hasImage={editingHadImage && !eliminarImagen}
                alt={form.nombre}
                className="h-36 w-full rounded-xl ring-1 ring-surface-border"
                clickable
                onPreview={(src) =>
                  setImagePreview({ src, alt: form.nombre, title: form.nombre })
                }
              />
            ) : (
              <div className="flex h-36 flex-col items-center justify-center rounded-xl border border-dashed border-surface-border bg-slate-50 text-slate-400">
                <Package className="h-8 w-8" />
                <span className="mt-2 text-xs">Sin imagen</span>
              </div>
            )}
          </div>
          <label className="block">
            <span className="sr-only">Subir imagen</span>
            <input
              ref={imagenInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleImageChange}
              className="sr-only"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-full rounded-xl"
              onClick={() => imagenInputRef.current?.click()}
            >
              <ImagePlus className="h-3.5 w-3.5" />
              Seleccionar imagen
            </Button>
          </label>
          {editingId && (imagenPreview || (editingHadImage && !eliminarImagen)) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full text-red-600"
              onClick={() => {
                setImagenPreview(null)
                setImagenBase64(null)
                setEliminarImagen(true)
              }}
            >
              Quitar imagen
            </Button>
          )}
        </div>

        <div className="space-y-5">
          <div className="rounded-xl border border-surface-border bg-surface-muted/20 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Identificación
            </p>
            <div className="grid gap-4 sm:grid-cols-[9.5rem_minmax(0,1fr)]">
              <Input
                ref={codigoInternoRef}
                label="Código interno *"
                value={form.codigo_interno}
                onChange={(e) => setForm({ ...form, codigo_interno: e.target.value })}
                onKeyDown={(e) => handleFormKeyDown(e, nombreRef)}
                required
              />
              <Input
                ref={nombreRef}
                label="Nombre *"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                onKeyDown={(e) => handleFormKeyDown(e, descripcionRef)}
                required
                className="min-w-0"
              />
              <div className="sm:col-span-2">
                <Input
                  ref={descripcionRef}
                  label="Descripción"
                  value={form.descripcion}
                  onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                  onKeyDown={(e) => handleFormKeyDown(e, codigoBarrasRef)}
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-surface-border bg-surface-muted/20 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Código de barras
            </p>
            <Input
              ref={codigoBarrasRef}
              label="Código de barras"
              value={form.codigo_barras}
              onChange={(e) => setForm({ ...form, codigo_barras: e.target.value })}
              onKeyDown={(e) => handleFormKeyDown(e, activoRef)}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="rounded-lg"
                onClick={() => setShowScanner(true)}
              >
                <Camera className="h-3.5 w-3.5" />
                Escanear
              </Button>
              {!editingId && hasPermiso('productos.crear') && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="rounded-lg"
                  onClick={handleGenerarCodigos}
                >
                  <Dices className="h-3.5 w-3.5" />
                  Generar códigos
                </Button>
              )}
              {form.codigo_barras.trim() && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="rounded-lg"
                  onClick={() =>
                    setBarcodePrint({
                      codigoBarras: form.codigo_barras.trim(),
                      nombre: form.nombre.trim() || undefined,
                      codigoInterno: form.codigo_interno.trim() || undefined
                    })
                  }
                >
                  <Printer className="h-3.5 w-3.5" />
                  Imprimir etiqueta
                </Button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-surface-border bg-white px-4 py-3">
            <input
              ref={activoRef}
              id="activo"
              type="checkbox"
              checked={form.activo}
              onChange={(e) => setForm({ ...form, activo: e.target.checked })}
              onKeyDown={(e) => handleFormKeyDown(e)}
              className="h-4 w-4 rounded border-surface-border text-brand-600"
            />
            <label htmlFor="activo" className="text-sm font-medium text-slate-700">
              Producto activo
            </label>
            {!form.activo && (
              <Badge variant="warning" className="ml-auto">
                Inactivo
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-surface-border pt-5">
        <Button type="submit" disabled={saving} className="rounded-xl px-5">
          {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Crear producto'}
        </Button>
        <Button type="button" variant="secondary" className="rounded-xl" onClick={volverAlListado}>
          Cancelar
        </Button>
      </div>
    </form>
  )

  if (view === 'form') {
    return (
      <div className="-m-4 h-[calc(100vh-5rem)] overflow-y-auto lg:-m-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6 pb-16 lg:px-6">
          <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="-ml-2 h-9 rounded-xl px-3"
                onClick={volverAlListado}
              >
                <ChevronLeft className="h-4 w-4" />
                Volver al catálogo
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {editingId ? (
                <>
                  {form.codigo_interno && <Badge variant="muted">{form.codigo_interno}</Badge>}
                  {!form.activo && <Badge variant="warning">Inactivo</Badge>}
                </>
              ) : (
                <Badge variant="default">Alta nueva</Badge>
              )}
            </div>
          </section>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {editingId ? 'Edición' : 'Alta'}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
              {editingId ? 'Editar producto' : 'Nuevo producto'}
            </h1>
            {editingId && form.nombre && (
              <p className="mt-1 truncate text-sm text-slate-500">{form.nombre}</p>
            )}
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-100">
              {error}
            </div>
          )}

          <Card className="overflow-hidden shadow-panel">
            <div className="border-b border-brand-100 bg-gradient-to-r from-brand-50/80 via-white to-white px-5 py-4 sm:px-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
                  <Package className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">Datos del producto</p>
                  <p className="text-xs text-slate-500">
                    {editingId
                      ? 'Modificá código, nombre, barras o imagen'
                      : 'Enter avanza entre campos · Esc vuelve al listado'}
                    {!editingId && ' · pallet 112 y caja 6 por defecto'}
                  </p>
                </div>
              </div>
            </div>
            <CardBody className="sm:px-6">{formContent}</CardBody>
          </Card>
        </div>

        <BarcodeScannerModal
          open={showScanner}
          onClose={() => setShowScanner(false)}
          onScan={(code) => setForm((f) => ({ ...f, codigo_barras: code }))}
        />
        <BarcodePrintModal
          open={!!barcodePrint}
          onClose={() => setBarcodePrint(null)}
          codigoBarras={barcodePrint?.codigoBarras ?? ''}
          nombre={barcodePrint?.nombre}
          codigoInterno={barcodePrint?.codigoInterno}
        />

        <ImagePreviewModal
          src={imagePreview?.src ?? null}
          alt={imagePreview?.alt ?? ''}
          title={imagePreview?.title}
          onClose={() => setImagePreview(null)}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Catálogo
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Productos
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-500">
            Códigos internos, barras e imágenes. También podés cargar muchos de una vez con la
            plantilla Excel.
          </p>
        </div>
        {hasPermiso('productos.crear') && (
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                className="rounded-xl"
                disabled={downloadingPlantilla || importing}
                onClick={() => void descargarPlantilla()}
                title="Excel con Código interno, Nombre y Descripción (sin cantidad)"
              >
                {downloadingPlantilla ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Plantilla Excel
              </Button>
              <Button
                variant="secondary"
                className="rounded-xl"
                disabled={importing || downloadingPlantilla}
                onClick={() => importInputRef.current?.click()}
                title="Importar la plantilla o un listado con Código de producto y Descripción"
              >
                {importing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {importing ? 'Importando…' : 'Importar Excel'}
              </Button>
              <input
                ref={importInputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void importarExcel(file)
                }}
              />
            </div>
            <Button className="ml-auto shrink-0 rounded-xl px-4" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Nuevo producto
            </Button>
          </div>
        )}
      </section>

      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-100">
          {error}
        </div>
      )}

      {importResult && (
        <Card className="overflow-hidden shadow-panel">
          <CardBody className="space-y-3 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">Resultado de la importación</p>
                  <p className="mt-0.5 text-sm text-slate-500">
                    {importResult.creados} creados · {importResult.omitidos} omitidos ·{' '}
                    {importResult.total_filas} filas leídas
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Descripción opcional. Los códigos que ya existen se omiten (no se duplican).
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-lg"
                onClick={() => setImportResult(null)}
              >
                Cerrar
              </Button>
            </div>
            {importResult.omitidos > 0 && (
              <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-surface-border bg-slate-50/80 px-3 py-2 text-xs text-slate-600">
                {importResult.detalle
                  .filter((d) => d.estado === 'omitido')
                  .slice(0, 40)
                  .map((d) => (
                    <li key={`${d.fila}-${d.codigo_interno}`}>
                      Fila {d.fila} · <span className="font-medium">{d.codigo_interno}</span>
                      {d.motivo ? ` — ${d.motivo}` : ''}
                    </li>
                  ))}
              </ul>
            )}
          </CardBody>
        </Card>
      )}

      <Card className="overflow-hidden shadow-panel">
        <div className="border-b border-brand-100 bg-gradient-to-r from-brand-50/80 via-white to-white px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Listado del catálogo</h2>
              <p className="text-xs text-slate-500">
                {loading ? 'Cargando productos...' : `${productos.length} producto(s)`}
              </p>
            </div>
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400" />
              <input
                ref={searchRef}
                type="search"
                placeholder="Buscar por código, barras o nombre..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={registroListKb.handleListSearchKeyDown}
                className="w-full rounded-xl border border-surface-border bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>
          </div>
        </div>

        <CardBody className="p-0">
          {error && (
            <div className="border-b border-red-100 bg-red-50 px-6 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
              Cargando productos...
            </div>
          ) : productos.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <Package className="h-7 w-7" />
              </div>
              <p className="mt-4 text-sm font-medium text-slate-700">No hay productos</p>
              <p className="mt-1 max-w-sm text-xs text-slate-500">
                {search
                  ? 'Probá con otro término de búsqueda'
                  : 'Creá el primer producto del catálogo'}
              </p>
              {!search && hasPermiso('productos.crear') && (
                <Button className="mt-4 rounded-xl" size="sm" onClick={openCreate}>
                  <Plus className="h-4 w-4" />
                  Crear producto
                </Button>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-surface-border">
              {productos.map((p, index) => (
                <li
                  key={p.id}
                  {...registroListKb.listItemProps(
                    index,
                    'flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-slate-50/80 sm:flex-row sm:items-center sm:gap-4 sm:px-6'
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <ProductImage
                      productoId={p.id}
                      hasImage={!!p.imagen_path}
                      alt={p.nombre}
                      className="h-12 w-12 shrink-0 rounded-xl ring-1 ring-surface-border"
                      clickable={!!p.imagen_path}
                      onPreview={(src) =>
                        setImagePreview({
                          src,
                          alt: p.nombre,
                          title: `${p.codigo_interno} — ${p.nombre}`
                        })
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">
                          {p.codigo_interno}
                        </span>
                        <Badge variant={p.activo ? 'success' : 'muted'}>
                          {p.activo ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </div>
                      <p className="mt-1.5 font-semibold text-slate-900">{p.nombre}</p>
                      {p.descripcion && (
                        <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{p.descripcion}</p>
                      )}
                      {p.codigo_barras && (
                        <p className="mt-1.5 flex items-center gap-1 text-xs text-slate-500">
                          <Barcode className="h-3 w-3 shrink-0" />
                          <span className="font-mono">{p.codigo_barras}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1 sm:justify-end">
                    {p.codigo_barras && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-lg"
                        title="Imprimir etiqueta de barras"
                        onClick={() =>
                          setBarcodePrint({
                            codigoBarras: p.codigo_barras!,
                            nombre: p.nombre,
                            codigoInterno: p.codigo_interno
                          })
                        }
                      >
                        <Printer className="h-4 w-4" />
                      </Button>
                    )}
                    {hasPermiso('productos.editar') && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="rounded-lg"
                        onClick={() => openEdit(p)}
                      >
                        <Pencil className="h-4 w-4" />
                        Editar
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <ImagePreviewModal
        src={imagePreview?.src ?? null}
        alt={imagePreview?.alt ?? ''}
        title={imagePreview?.title}
        onClose={() => setImagePreview(null)}
      />
      <BarcodePrintModal
        open={!!barcodePrint}
        onClose={() => setBarcodePrint(null)}
        codigoBarras={barcodePrint?.codigoBarras ?? ''}
        nombre={barcodePrint?.nombre}
        codigoInterno={barcodePrint?.codigoInterno}
      />
    </div>
  )
}
