import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, ChevronLeft, Dices, Package, Pencil, Plus, Search } from 'lucide-react'
import { BarcodeScannerModal } from '@/components/BarcodeScannerModal'
import { api } from '@/lib/utils'
import { prepareProductImage } from '@/lib/image'
import type { Producto, ProductoForm } from '@/types'
import { useAuth } from '@/context/AuthContext'
import { useEscHandler } from '@/hooks/useEscHandler'
import { ImagePreviewModal } from '@/components/ImagePreviewModal'
import { ProductImage } from '@/components/ProductImage'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge, Card, CardBody, CardHeader } from '@/components/ui/Card'

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
  const [showScanner, setShowScanner] = useState(false)
  const [imagePreview, setImagePreview] = useState<{
    src: string
    alt: string
    title?: string
  } | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const codigoInternoRef = useRef<HTMLInputElement>(null)
  const codigoBarrasRef = useRef<HTMLInputElement>(null)
  const nombreRef = useRef<HTMLInputElement>(null)
  const descripcionRef = useRef<HTMLInputElement>(null)
  const activoRef = useRef<HTMLInputElement>(null)

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

  function shouldAbrirFormularioConEnter(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return true
    if (target.closest('button, a, textarea, [contenteditable="true"]')) return false
    if (target instanceof HTMLInputElement && target.type === 'date') return false
    if (target instanceof HTMLSelectElement) return false
    return true
  }

  function abrirNuevoProducto() {
    openCreate()
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' || !hasPermiso('productos.crear')) return
    e.preventDefault()
    abrirNuevoProducto()
  }

  useEffect(() => {
    if (view !== 'list' || showScanner || imagePreview || !hasPermiso('productos.crear')) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat) return
      if (!shouldAbrirFormularioConEnter(e.target)) return
      e.preventDefault()
      abrirNuevoProducto()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [view, showScanner, imagePreview, hasPermiso])

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
    const timer = setTimeout(() => searchRef.current?.focus(), 80)
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
      <div className="grid gap-4 lg:grid-cols-[140px_1fr]">
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">Imagen</p>
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
                className="group relative block w-full cursor-zoom-in overflow-hidden rounded-lg"
                title="Ver imagen ampliada"
              >
                <img
                  src={imagenPreview}
                  alt="Vista previa"
                  className="h-32 w-full rounded-lg object-cover"
                />
              </button>
            ) : editingId ? (
              <ProductImage
                productoId={editingId}
                hasImage={editingHadImage && !eliminarImagen}
                alt={form.nombre}
                className="h-32 w-full"
                clickable
                onPreview={(src) =>
                  setImagePreview({ src, alt: form.nombre, title: form.nombre })
                }
              />
            ) : (
              <div className="flex h-32 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                <Package className="h-8 w-8" />
              </div>
            )}
          </div>
          <label className="block">
            <span className="sr-only">Subir imagen</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleImageChange}
              className="block w-full text-xs text-slate-500 file:mr-2 file:rounded-md file:border-0 file:bg-brand-50 file:px-2 file:py-1 file:text-xs file:font-medium file:text-brand-700"
            />
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

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            ref={codigoInternoRef}
            label="Código interno *"
            value={form.codigo_interno}
            onChange={(e) => setForm({ ...form, codigo_interno: e.target.value })}
            onKeyDown={(e) => handleFormKeyDown(e, codigoBarrasRef)}
            required
          />
          <div className="space-y-1.5">
            <Input
              ref={codigoBarrasRef}
              label="Código de barras"
              value={form.codigo_barras}
              onChange={(e) => setForm({ ...form, codigo_barras: e.target.value })}
              onKeyDown={(e) => handleFormKeyDown(e, nombreRef)}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setShowScanner(true)}
              >
                <Camera className="h-3.5 w-3.5" />
                Escanear con cámara
              </Button>
              {!editingId && hasPermiso('productos.crear') && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleGenerarCodigos}
                >
                  <Dices className="h-3.5 w-3.5" />
                  Generar códigos
                </Button>
              )}
            </div>
          </div>
          <Input
            ref={nombreRef}
            label="Nombre *"
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            onKeyDown={(e) => handleFormKeyDown(e, descripcionRef)}
            className="sm:col-span-2"
            required
          />
          <Input
            ref={descripcionRef}
            label="Descripción"
            value={form.descripcion}
            onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
            onKeyDown={(e) => handleFormKeyDown(e, activoRef)}
            className="sm:col-span-2"
          />
          <div className="flex items-center gap-2 sm:col-span-2">
            <input
              ref={activoRef}
              id="activo"
              type="checkbox"
              checked={form.activo}
              onChange={(e) => setForm({ ...form, activo: e.target.checked })}
              onKeyDown={(e) => handleFormKeyDown(e)}
              className="h-4 w-4 rounded border-surface-border text-brand-600"
            />
            <label htmlFor="activo" className="text-sm text-slate-700">Producto activo</label>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Crear producto'}
        </Button>
        <Button type="button" variant="secondary" onClick={volverAlListado}>
          Cancelar
        </Button>
      </div>
      <p className="text-xs text-slate-400">
        Enter pasa al siguiente campo · en Activo guarda · Esc vuelve al listado
      </p>
    </form>
  )

  if (view === 'form') {
    return (
      <div className="-m-4 h-[calc(100vh-5rem)] overflow-y-auto lg:-m-6">
        <div className="mx-auto flex max-w-2xl flex-col px-4 py-8 pb-16">
          <Button variant="ghost" size="sm" className="mb-4 -ml-2 self-start" onClick={volverAlListado}>
            <ChevronLeft className="h-4 w-4" />
            Volver al listado
          </Button>

          <h1 className="text-2xl font-bold text-slate-900">
            {editingId ? 'Editar producto' : 'Nuevo producto'}
          </h1>
          <p className="mt-1 mb-6 text-slate-500">
            {editingId
              ? 'Modificá los datos del producto en el catálogo'
              : 'Completá los datos con Enter · pallet 112 cajas y caja 6 botellas por defecto'}
          </p>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <Card>
            <CardBody>{formContent}</CardBody>
          </Card>
        </div>

        <BarcodeScannerModal
          open={showScanner}
          onClose={() => setShowScanner(false)}
          onScan={(code) => setForm((f) => ({ ...f, codigo_barras: code }))}
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Productos</h1>
          <p className="mt-1 text-slate-500">
            Catálogo con código interno, código de barras e imagen
          </p>
        </div>
        {hasPermiso('productos.crear') && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Nuevo producto
          </Button>
        )}
      </div>

      <Card>
        <CardBody className="border-b border-surface-border py-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchRef}
              type="search"
              placeholder="Buscar por código interno, barras o nombre... · Enter = nuevo producto"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="w-full rounded-lg border border-surface-border py-2 pl-10 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
        </CardBody>

        <CardHeader
          title="Catálogo"
          description={`${productos.length} producto(s)`}
        />

        <CardBody className="p-0">
          {error && (
            <div className="border-b border-red-100 bg-red-50 px-6 py-3 text-sm text-red-700">{error}</div>
          )}
          {loading ? (
            <p className="p-6 text-sm text-slate-500">Cargando...</p>
          ) : productos.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <Package className="h-12 w-12 text-slate-300" />
              <p className="mt-3 font-medium text-slate-700">No hay productos</p>
              <p className="mt-1 text-sm text-slate-500">
                {search ? 'Probá con otro término de búsqueda' : 'Creá el primer producto del catálogo'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-border bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-6 py-3">Producto</th>
                    <th className="px-6 py-3">Código interno</th>
                    <th className="px-6 py-3">Estado</th>
                    <th className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {productos.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/50">
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-3">
                          <ProductImage
                            productoId={p.id}
                            hasImage={!!p.imagen_path}
                            alt={p.nombre}
                            className="h-10 w-10 shrink-0"
                            clickable={!!p.imagen_path}
                            onPreview={(src) =>
                              setImagePreview({
                                src,
                                alt: p.nombre,
                                title: `${p.codigo_interno} — ${p.nombre}`
                              })
                            }
                          />
                          <div>
                            <p className="font-medium text-slate-900">{p.nombre}</p>
                            {p.descripcion && (
                              <p className="text-xs text-slate-500 line-clamp-1">{p.descripcion}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <p className="font-mono text-base font-semibold tracking-wide text-slate-900">
                          {p.codigo_interno}
                        </p>
                      </td>
                      <td className="px-6 py-3">
                        <Badge variant={p.activo ? 'success' : 'muted'}>
                          {p.activo ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </td>
                      <td className="px-6 py-3 text-right">
                        {hasPermiso('productos.editar') && (
                          <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                            <Pencil className="h-4 w-4" />
                            Editar
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <ImagePreviewModal
        src={imagePreview?.src ?? null}
        alt={imagePreview?.alt ?? ''}
        title={imagePreview?.title}
        onClose={() => setImagePreview(null)}
      />
    </div>
  )
}
