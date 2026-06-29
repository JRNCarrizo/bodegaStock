import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Layers,
  Loader2,
  MapPin,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  Warehouse
} from 'lucide-react'
import { formatCantidad } from '@/lib/desglose'
import { api, cn } from '@/lib/utils'
import type { Sector, SectorForm, SectorStockDetalle, SectorUbicacion } from '@/types'
import { useAuth } from '@/context/AuthContext'
import { useEscHandler } from '@/hooks/useEscHandler'
import { ProductImage } from '@/components/ProductImage'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge, Card, CardBody } from '@/components/ui/Card'

type UbicacionFilter = 'all' | 'sin' | number

const emptyForm = (): SectorForm => ({
  nombre: '',
  descripcion: '',
  es_sector_descuento: false,
  prioridad_descuento: '',
  usa_ubicaciones: false,
  activo: true
})

function SectorUbicacionesPanel({
  sectorId,
  canEdit,
  onUpdated,
  toggleChecked,
  onToggleChange
}: {
  sectorId: number
  canEdit: boolean
  onUpdated?: () => void
  toggleChecked?: boolean
  onToggleChange?: (checked: boolean) => void
}) {
  const [ubicaciones, setUbicaciones] = useState<SectorUbicacion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const nuevoNombreRef = useRef<HTMLInputElement>(null)

  function focusNuevoNombre() {
    window.setTimeout(() => {
      nuevoNombreRef.current?.focus()
      nuevoNombreRef.current?.select()
    }, 50)
  }

  function notifyUpdated() {
    window.setTimeout(() => onUpdated?.(), 0)
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api<SectorUbicacion[]>(`/api/sectores/${sectorId}/ubicaciones`)
      setUbicaciones(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar ubicaciones')
    } finally {
      setLoading(false)
    }
  }, [sectorId])

  useEffect(() => {
    void load()
  }, [load])

  async function agregarUbicacion() {
    const nombre = nuevoNombre.trim()
    if (!nombre || saving) return
    setSaving(true)
    setError('')
    setConfirmDeleteId(null)
    try {
      const result = await api<{ id: number }>(`/api/sectores/${sectorId}/ubicaciones`, {
        method: 'POST',
        body: JSON.stringify({ nombre })
      })
      setUbicaciones((prev) => [
        ...prev,
        {
          id: Number(result.id),
          sector_id: sectorId,
          codigo: nombre,
          nombre,
          orden: prev.length + 1,
          activo: 1,
          created_at: new Date().toISOString()
        }
      ])
      setNuevoNombre('')
      notifyUpdated()
      focusNuevoNombre()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al agregar ubicación')
      focusNuevoNombre()
    } finally {
      setSaving(false)
    }
  }

  function handleUbicacionKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    e.stopPropagation()
    void agregarUbicacion()
  }

  async function confirmarEliminar(id: number) {
    if (deletingId !== null) return
    setDeletingId(id)
    setError('')
    try {
      await api(`/api/sectores/${sectorId}/ubicaciones/${id}`, { method: 'DELETE' })
      setUbicaciones((prev) => prev.filter((u) => u.id !== id))
      setConfirmDeleteId(null)
      notifyUpdated()
      focusNuevoNombre()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar')
      focusNuevoNombre()
    } finally {
      setDeletingId(null)
    }
  }

  function cancelarEliminar() {
    setConfirmDeleteId(null)
    focusNuevoNombre()
  }

  return (
    <div className="space-y-4 rounded-xl border border-surface-border bg-surface-muted/20 p-4 sm:p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Ubicaciones internas
        </p>
        <p className="mt-1 text-sm text-slate-600">
          Puntos dentro del sector: &quot;A arriba&quot;, &quot;1 izquierda&quot;, etc. Se eligen al
          cargar ingresos o inventario.
        </p>
      </div>

      {onToggleChange && (
        <label className="flex items-center gap-3 rounded-xl border border-surface-border bg-white px-4 py-3">
          <input
            type="checkbox"
            checked={toggleChecked}
            onChange={(e) => onToggleChange(e.target.checked)}
            className="h-4 w-4 rounded border-surface-border text-brand-600"
          />
          <span className="text-sm font-medium text-slate-700">
            Usar ubicaciones internas en este sector
          </span>
        </label>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
          Cargando ubicaciones...
        </div>
      ) : ubicaciones.length === 0 ? (
        <div className="rounded-xl border border-dashed border-surface-border bg-white px-4 py-6 text-center">
          <MapPin className="mx-auto h-6 w-6 text-slate-300" />
          <p className="mt-2 text-sm text-slate-500">
            Sin ubicaciones. Agregá una con el nombre que uses en la bodega.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {ubicaciones.map((u) => (
            <li
              key={u.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-surface-border bg-white px-3 py-2.5"
            >
              <div className="flex items-center gap-2 min-w-0">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-brand-500" />
                <span className="truncate font-medium text-slate-900">{u.nombre}</span>
              </div>
              {canEdit && (
                <div className="shrink-0">
                  {confirmDeleteId === u.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">¿Eliminar?</span>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        className="rounded-lg"
                        disabled={deletingId === u.id}
                        onClick={() => void confirmarEliminar(u.id)}
                      >
                        Sí
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="rounded-lg"
                        disabled={deletingId === u.id}
                        onClick={cancelarEliminar}
                      >
                        No
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="rounded-lg"
                      disabled={deletingId !== null}
                      onClick={() => setConfirmDeleteId(u.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <div className="relative z-10 flex flex-col gap-3 border-t border-surface-border pt-4 sm:flex-row sm:items-end">
          <Input
            ref={nuevoNombreRef}
            label="Nombre de ubicación"
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            onKeyDown={handleUbicacionKeyDown}
            placeholder="ej. A arriba, 1 izquierda, fondo..."
            className="flex-1"
          />
          <Button
            type="button"
            className="rounded-xl sm:mb-0.5"
            disabled={saving || !nuevoNombre.trim()}
            onClick={() => void agregarUbicacion()}
          >
            <Plus className="h-4 w-4" />
            Agregar
          </Button>
        </div>
      )}
    </div>
  )
}

export function SectoresPage() {
  const { hasPermiso } = useAuth()
  const [sectores, setSectores] = useState<Sector[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState<'list' | 'form' | 'contenido'>('list')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<SectorForm>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [stockSector, setStockSector] = useState<Sector | null>(null)
  const [ubicacionesCache, setUbicacionesCache] = useState<Record<number, SectorUbicacion[]>>({})
  const [loadingUbicacionesId, setLoadingUbicacionesId] = useState<number | null>(null)
  const [ubicacionFilter, setUbicacionFilter] = useState<UbicacionFilter>('all')
  const [stockDetalle, setStockDetalle] = useState<SectorStockDetalle | null>(null)
  const [loadingStock, setLoadingStock] = useState(false)
  const [stockError, setStockError] = useState('')
  const [expandedStockProductos, setExpandedStockProductos] = useState<Set<number>>(() => new Set())
  const [stockSearch, setStockSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const stockSearchRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const nombreRef = useRef<HTMLInputElement>(null)
  const descripcionRef = useRef<HTMLInputElement>(null)
  const activoRef = useRef<HTMLInputElement>(null)
  const descuentoRef = useRef<HTMLInputElement>(null)
  const prioridadRef = useRef<HTMLInputElement>(null)
  const usaUbicacionesRef = useRef<HTMLInputElement>(null)

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
    void guardarSector()
  }

  function showSuccess(message: string) {
    setSuccessMessage(message)
    setTimeout(() => setSuccessMessage(''), 3000)
  }

  function handleFormKeyDown(
    e: React.KeyboardEvent,
    next?: React.RefObject<HTMLElement | null>
  ) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (next?.current) {
      focusField(next)
    } else {
      submitFormulario()
    }
  }

  function handleDescuentoEnter(e: React.KeyboardEvent) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (form.es_sector_descuento) {
      focusField(prioridadRef)
      return
    }
    if (!(editingId && form.usa_ubicaciones)) {
      focusField(usaUbicacionesRef)
      return
    }
    submitFormulario()
  }

  function handlePrioridadEnter(e: React.KeyboardEvent) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (!(editingId && form.usa_ubicaciones)) {
      focusField(usaUbicacionesRef)
      return
    }
    submitFormulario()
  }

  function shouldAbrirFormularioConEnter(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return true
    if (target.closest('button, a, textarea, [contenteditable="true"]')) return false
    if (target instanceof HTMLInputElement && target.type === 'date') return false
    if (target instanceof HTMLSelectElement) return false
    return true
  }

  function abrirNuevoSector() {
    openCreate()
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' || !hasPermiso('sectores.crear')) return
    e.preventDefault()
    abrirNuevoSector()
  }

  useEffect(() => {
    if (view !== 'list' || !hasPermiso('sectores.crear')) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat) return
      if (!shouldAbrirFormularioConEnter(e.target)) return
      e.preventDefault()
      abrirNuevoSector()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [view, hasPermiso])

  function clearStockView() {
    setStockSector(null)
    setUbicacionFilter('all')
    setStockDetalle(null)
    setStockError('')
    setStockSearch('')
    setExpandedStockProductos(new Set())
  }

  const productosStockFiltrados = useMemo(() => {
    if (!stockDetalle) return []
    const q = stockSearch.trim().toLowerCase()
    if (!q) return stockDetalle.productos
    return stockDetalle.productos.filter(
      (p) =>
        p.codigo_interno.toLowerCase().includes(q) ||
        p.nombre.toLowerCase().includes(q)
    )
  }, [stockDetalle, stockSearch])

  const totalStockFiltrado = useMemo(
    () => productosStockFiltrados.reduce((s, p) => s + p.cantidad_total, 0),
    [productosStockFiltrados]
  )

  useEscHandler(view === 'contenido', () => {
    volverAlListado()
    return true
  })

  useEscHandler(view === 'form', () => {
    if (saving) return false
    volverAlListado()
    return true
  })

  useEffect(() => {
    if (view !== 'list') return
    const timer = setTimeout(() => searchRef.current?.focus(), 80)
    return () => clearTimeout(timer)
  }, [view])

  useEffect(() => {
    if (view !== 'contenido') return
    const timer = setTimeout(() => stockSearchRef.current?.focus({ preventScroll: true }), 80)
    return () => clearTimeout(timer)
  }, [view, stockSector?.id])

  const loadUbicaciones = useCallback(async (sectorId: number) => {
    setLoadingUbicacionesId(sectorId)
    try {
      const data = await api<SectorUbicacion[]>(`/api/sectores/${sectorId}/ubicaciones`)
      setUbicacionesCache((prev) => ({ ...prev, [sectorId]: data }))
    } catch {
      setUbicacionesCache((prev) => ({ ...prev, [sectorId]: [] }))
    } finally {
      setLoadingUbicacionesId(null)
    }
  }, [])

  const handleUbicacionesUpdated = useCallback(() => {
    if (editingId) void loadUbicaciones(editingId)
  }, [editingId, loadUbicaciones])

  const loadSectorStock = useCallback(async (sectorId: number, filter: UbicacionFilter) => {
    setLoadingStock(true)
    setStockError('')
    try {
      const params = new URLSearchParams()
      if (filter === 'sin') params.set('sin_ubicacion', '1')
      else if (filter !== 'all') params.set('ubicacion_id', String(filter))
      const data = await api<SectorStockDetalle>(
        `/api/sectores/${sectorId}/stock?${params}`
      )
      setStockDetalle(data)
      setExpandedStockProductos(new Set())
    } catch (err) {
      setStockDetalle(null)
      setStockError(err instanceof Error ? err.message : 'Error al cargar stock')
    } finally {
      setLoadingStock(false)
    }
  }, [])

  async function openSectorContenido(sector: Sector) {
    setStockSector(sector)
    setView('contenido')
    setUbicacionFilter('all')
    setStockDetalle(null)
    setStockError('')
    setStockSearch('')
    setExpandedStockProductos(new Set())
    if (sector.usa_ubicaciones && !ubicacionesCache[sector.id]) {
      await loadUbicaciones(sector.id)
    }
    void loadSectorStock(sector.id, 'all')
  }

  function changeUbicacionFilter(filter: UbicacionFilter) {
    if (!stockSector) return
    setUbicacionFilter(filter)
    void loadSectorStock(stockSector.id, filter)
  }

  function toggleStockProducto(productoId: number) {
    setExpandedStockProductos((prev) => {
      const next = new Set(prev)
      if (next.has(productoId)) next.delete(productoId)
      else next.add(productoId)
      return next
    })
  }

  const load = useCallback(async (q?: string) => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (q?.trim()) params.set('q', q.trim())
      const data = await api<Sector[]>(`/api/sectores?${params}`)
      setSectores(data)
      setUbicacionesCache({})
      clearStockView()
      setView('list')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar sectores')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => load(search), 300)
    return () => clearTimeout(timer)
  }, [search, load])

  function resetFormFields() {
    setForm(emptyForm())
    setEditingId(null)
  }

  function volverAlListado() {
    resetFormFields()
    clearStockView()
    setError('')
    setSuccessMessage('')
    setView('list')
  }

  function openCreate() {
    resetFormFields()
    setError('')
    setView('form')
    setTimeout(() => focusField(nombreRef), 50)
  }

  function openEdit(s: Sector) {
    setEditingId(s.id)
    setForm({
      nombre: s.nombre,
      descripcion: s.descripcion ?? '',
      es_sector_descuento: !!s.es_sector_descuento,
      prioridad_descuento: s.prioridad_descuento?.toString() ?? '',
      usa_ubicaciones: !!s.usa_ubicaciones,
      activo: !!s.activo
    })
    setError('')
    setView('form')
    setTimeout(() => focusField(nombreRef), 50)
  }

  async function guardarSector(e?: React.FormEvent) {
    e?.preventDefault()
    if (!form.nombre.trim()) {
      setError('Completá el nombre del sector')
      focusField(nombreRef)
      return
    }

    setSaving(true)
    setError('')
    setSuccessMessage('')

    const payload = {
      nombre: form.nombre.trim(),
      descripcion: form.descripcion || null,
      es_sector_descuento: form.es_sector_descuento,
      prioridad_descuento:
        form.es_sector_descuento && form.prioridad_descuento
          ? Number(form.prioridad_descuento)
          : null,
      usa_ubicaciones: form.usa_ubicaciones,
      activo: form.activo
    }

    try {
      if (editingId) {
        await api(`/api/sectores/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        })
        await load(search)
        if (editingId) {
          await loadUbicaciones(editingId)
        }
        volverAlListado()
      } else {
        const result = await api<{ id: number }>('/api/sectores', {
          method: 'POST',
          body: JSON.stringify(payload)
        })
        await load(search)
        if (form.usa_ubicaciones) {
          setEditingId(Number(result.id))
          showSuccess('Sector creado. Ahora podés agregar las ubicaciones.')
        } else {
          volverAlListado()
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const formContent = (
    <>
      <form ref={formRef} onSubmit={guardarSector} className="space-y-5">
        <div className="rounded-xl border border-surface-border bg-surface-muted/20 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Datos generales
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              ref={nombreRef}
              label="Nombre del sector *"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              onKeyDown={(e) => handleFormKeyDown(e, descripcionRef)}
              placeholder="ej. GPI, Depósito principal, Despacho"
              required
              className="sm:col-span-2"
            />
            <Input
              ref={descripcionRef}
              label="Descripción"
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              onKeyDown={(e) => handleFormKeyDown(e, activoRef)}
              className="sm:col-span-2"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-surface-border bg-white px-4 py-3">
          <input
            ref={activoRef}
            id="sector-activo"
            type="checkbox"
            checked={form.activo}
            onChange={(e) => setForm({ ...form, activo: e.target.checked })}
            onKeyDown={(e) => handleFormKeyDown(e, descuentoRef)}
            className="h-4 w-4 rounded border-surface-border text-brand-600"
          />
          <label htmlFor="sector-activo" className="text-sm font-medium text-slate-700">
            Sector activo
          </label>
          {!form.activo && (
            <Badge variant="muted" className="ml-auto">
              Inactivo
            </Badge>
          )}
        </div>

        <div className="rounded-xl border border-surface-border bg-surface-muted/20 p-4 space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Descuento de stock
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Los sectores marcados se usan primero al descontar en planillas y roturas.
            </p>
          </div>
          <label className="flex items-center gap-3 rounded-xl border border-surface-border bg-white px-4 py-3">
            <input
              ref={descuentoRef}
              type="checkbox"
              checked={form.es_sector_descuento}
              onChange={(e) =>
                setForm({
                  ...form,
                  es_sector_descuento: e.target.checked,
                  prioridad_descuento: e.target.checked ? form.prioridad_descuento : ''
                })
              }
              onKeyDown={handleDescuentoEnter}
              className="h-4 w-4 rounded border-surface-border text-brand-600"
            />
            <span className="text-sm font-medium text-slate-700">Sector de descuento</span>
          </label>
          {form.es_sector_descuento && (
            <Input
              ref={prioridadRef}
              label="Prioridad de descuento"
              type="number"
              min="1"
              value={form.prioridad_descuento}
              onChange={(e) =>
                setForm({ ...form, prioridad_descuento: e.target.value })
              }
              onKeyDown={handlePrioridadEnter}
              placeholder="1 = se descuenta primero"
            />
          )}
        </div>

        {!(editingId && form.usa_ubicaciones) && (
          <label className="flex items-start gap-3 rounded-xl border border-surface-border bg-white p-4">
            <input
              ref={usaUbicacionesRef}
              type="checkbox"
              checked={form.usa_ubicaciones}
              onChange={(e) =>
                setForm({ ...form, usa_ubicaciones: e.target.checked })
              }
              onKeyDown={(e) => handleFormKeyDown(e)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-surface-border text-brand-600"
            />
            <div className="min-w-0">
              <span className="text-sm font-medium text-slate-800">
                Ubicaciones internas en el sector
              </span>
              <p className="mt-1 text-xs text-slate-500">
                Lugares con nombre propio (pasillos, GPI, fondo, etc.). Guardá el sector y después
                cargá cada punto.
              </p>
            </div>
          </label>
        )}

        {form.usa_ubicaciones && !editingId && (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-100">
            Guardá el sector primero para poder agregar las ubicaciones internas.
          </p>
        )}
      </form>

      {editingId && form.usa_ubicaciones && (
        <div className="mt-5">
          <SectorUbicacionesPanel
            key={editingId}
            sectorId={editingId}
            canEdit={hasPermiso('sectores.editar')}
            onUpdated={handleUbicacionesUpdated}
            toggleChecked={form.usa_ubicaciones}
            onToggleChange={(checked) =>
              setForm({ ...form, usa_ubicaciones: checked })
            }
          />
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2 border-t border-surface-border pt-5">
        <Button
          type="button"
          className="rounded-xl px-5"
          disabled={saving}
          onClick={() => void guardarSector()}
        >
          {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Crear sector'}
        </Button>
        <Button type="button" variant="secondary" className="rounded-xl" onClick={volverAlListado}>
          Cancelar
        </Button>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Enter pasa al siguiente campo · en el último guarda · Esc vuelve al listado
      </p>
    </>
  )

  if (view === 'form') {
    return (
      <div className="-m-4 h-[calc(100vh-5rem)] overflow-y-auto lg:-m-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6 pb-16 lg:px-6">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 h-9 self-start rounded-xl px-3"
            onClick={volverAlListado}
          >
            <ChevronLeft className="h-4 w-4" />
            Volver al listado
          </Button>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {editingId ? 'Edición' : 'Alta'}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
              {editingId ? 'Editar sector' : 'Nuevo sector'}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {editingId
                ? 'Modificá el sector y sus ubicaciones internas'
                : 'Completá los datos con Enter para avanzar entre campos'}
            </p>
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-100">
              {error}
            </div>
          )}
          {successMessage && (
            <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-100">
              {successMessage}
            </div>
          )}

          <Card className="overflow-hidden shadow-panel">
            <div className="border-b border-brand-100 bg-gradient-to-r from-brand-50/80 via-white to-white px-5 py-4 sm:px-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
                  <Warehouse className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Configuración del sector</p>
                  <p className="text-xs text-slate-500">
                    Nombre, descuento de stock y ubicaciones internas
                  </p>
                </div>
              </div>
            </div>
            <CardBody className="sm:px-6">{formContent}</CardBody>
          </Card>
        </div>
      </div>
    )
  }

  if (view === 'contenido' && stockSector) {
    const ubicaciones = ubicacionesCache[stockSector.id]
    const loadingUbicaciones = loadingUbicacionesId === stockSector.id
    const filtroLabel =
      ubicacionFilter === 'all'
        ? 'Todo el sector'
        : ubicacionFilter === 'sin'
          ? 'Sin ubicación'
          : ubicaciones?.find((u) => u.id === ubicacionFilter)?.nombre ?? 'Ubicación'

    return (
      <div className="-m-4 flex h-[calc(100vh-5rem)] flex-col bg-surface-muted/30 lg:-m-6">
        <div className="shrink-0 border-b border-surface-border bg-white shadow-sm">
          <div className="border-b border-brand-100 bg-gradient-to-r from-brand-50/80 via-white to-white px-4 py-4 sm:px-6">
            <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-3 gap-y-2">
              <Button
                variant="ghost"
                size="sm"
                className="-ml-1 h-9 shrink-0 rounded-xl px-3"
                onClick={volverAlListado}
              >
                <ChevronLeft className="h-4 w-4" />
                Volver
              </Button>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
                <Warehouse className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
                  {stockSector.nombre}
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge variant={stockSector.activo ? 'success' : 'muted'}>
                    {stockSector.activo ? 'Activo' : 'Inactivo'}
                  </Badge>
                  {!!stockSector.es_sector_descuento && (
                    <Badge variant="default">
                      Descuento P{stockSector.prioridad_descuento ?? '—'}
                    </Badge>
                  )}
                  {stockDetalle && (
                    <span className="text-xs text-slate-500">
                      {stockDetalle.total_productos} productos
                    </span>
                  )}
                </div>
              </div>
              {stockDetalle && (
                <span className="inline-flex shrink-0 items-center rounded-full bg-brand-50 px-3 py-1 text-sm font-bold tabular-nums text-brand-700 ring-1 ring-brand-100">
                  {formatCantidad(stockDetalle.total_stock)}
                </span>
              )}
              <div className="ml-auto shrink-0">
                {hasPermiso('sectores.editar') && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 rounded-lg px-3 text-xs"
                    onClick={() => openEdit(stockSector)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                  </Button>
                )}
              </div>
            </div>
          </div>

          {!!stockSector.usa_ubicaciones && (
            <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-2 px-4 py-3 sm:px-6">
              <Layers className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Filtrar
              </span>
              {loadingUbicaciones ? (
                <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => changeUbicacionFilter('all')}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      ubicacionFilter === 'all'
                        ? 'border-brand-500 bg-brand-600 text-white'
                        : 'border-surface-border bg-white text-slate-600 hover:border-brand-300'
                    )}
                  >
                    Todo el sector
                  </button>
                  {ubicaciones?.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => changeUbicacionFilter(u.id)}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                        ubicacionFilter === u.id
                          ? 'border-brand-500 bg-brand-600 text-white'
                          : 'border-surface-border bg-white text-slate-600 hover:border-brand-300'
                      )}
                    >
                      {u.nombre}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => changeUbicacionFilter('sin')}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      ubicacionFilter === 'sin'
                        ? 'border-brand-500 bg-brand-600 text-white'
                        : 'border-dashed border-surface-border bg-white text-slate-500 hover:border-brand-300'
                    )}
                  >
                    Sin ubicación
                  </button>
                </>
              )}
              {ubicacionFilter !== 'all' && (
                <span className="text-xs text-slate-400">· {filtroLabel}</span>
              )}
            </div>
          )}
        </div>

        {stockError && (
          <div className="shrink-0 border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">
            <div className="mx-auto max-w-4xl">{stockError}</div>
          </div>
        )}

        <div className="shrink-0 border-b border-surface-border bg-white px-4 py-3 sm:px-6">
          <div className="relative mx-auto max-w-4xl">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400" />
            <input
              ref={stockSearchRef}
              type="search"
              placeholder="Buscar producto por código o nombre..."
              value={stockSearch}
              onChange={(e) => setStockSearch(e.target.value)}
              className="w-full rounded-xl border border-surface-border bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6">
            {loadingStock ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-surface-border bg-white py-16 shadow-card">
                <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
                <p className="mt-3 text-sm text-slate-500">Cargando stock del sector...</p>
              </div>
            ) : !stockDetalle || stockDetalle.productos.length === 0 ? (
              <div className="flex flex-col items-center rounded-2xl border border-dashed border-surface-border bg-white py-16 text-center shadow-card">
                <Package className="h-10 w-10 text-slate-300" />
                <p className="mt-3 text-sm font-medium text-slate-700">Sin productos</p>
                <p className="mt-1 text-xs text-slate-500">
                  No hay stock{filtroLabel !== 'Todo el sector' ? ` en "${filtroLabel}"` : ''}
                </p>
              </div>
            ) : productosStockFiltrados.length === 0 ? (
              <div className="flex flex-col items-center rounded-2xl border border-dashed border-surface-border bg-white py-14 text-center shadow-card">
                <Search className="h-8 w-8 text-slate-300" />
                <p className="mt-3 text-sm font-medium text-slate-700">Sin coincidencias</p>
                <p className="mt-1 text-xs text-slate-500">
                  Ningún producto coincide con &quot;{stockSearch.trim()}&quot;
                </p>
              </div>
            ) : (
              <Card className="overflow-hidden shadow-panel">
                <CardBody className="p-0">
                  <ul className="divide-y divide-surface-border">
                    {productosStockFiltrados.map((producto) => {
                      const isExpanded = expandedStockProductos.has(producto.producto_id)
                      return (
                        <li key={producto.producto_id}>
                          <button
                            type="button"
                            onClick={() => toggleStockProducto(producto.producto_id)}
                            className={cn(
                              'flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors sm:px-5',
                              isExpanded ? 'bg-brand-50/60' : 'hover:bg-slate-50/80'
                            )}
                          >
                            <span
                              className={cn(
                                'shrink-0 rounded-lg p-1',
                                isExpanded
                                  ? 'bg-brand-100 text-brand-700'
                                  : 'text-slate-400'
                              )}
                              aria-hidden
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </span>
                            <ProductImage
                              productoId={producto.producto_id}
                              hasImage={!!producto.imagen_path}
                              alt={producto.nombre}
                              className="h-11 w-11 shrink-0 rounded-xl ring-1 ring-surface-border"
                            />
                            <div className="min-w-0 flex-1 text-left">
                              <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">
                                {producto.codigo_interno}
                              </span>
                              <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                                {producto.nombre}
                              </p>
                            </div>
                            <span className="inline-flex shrink-0 items-center rounded-lg bg-brand-50 px-2.5 py-1.5 text-sm font-bold tabular-nums text-brand-700 ring-1 ring-brand-100">
                              {formatCantidad(producto.cantidad_total)}
                            </span>
                          </button>
                          {isExpanded && (
                            <ul className="space-y-2 border-t border-brand-100/80 bg-gradient-to-b from-surface-muted/40 to-white px-4 py-3 sm:px-5">
                              {producto.lineas.map((linea, idx) => (
                                <li
                                  key={linea.id}
                                  className="flex items-center justify-between gap-3 rounded-lg border border-surface-border bg-white px-3 py-2 text-sm"
                                >
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded bg-slate-100 px-1 text-[10px] font-semibold text-slate-400">
                                        {idx + 1}
                                      </span>
                                      <span className="font-medium text-slate-800">
                                        {linea.etiqueta}
                                      </span>
                                    </div>
                                    {ubicacionFilter === 'all' && linea.ubicacion && (
                                      <p className="mt-1 flex items-center gap-1 pl-7 text-xs text-slate-500">
                                        <MapPin className="h-3 w-3 shrink-0" />
                                        {linea.ubicacion}
                                      </p>
                                    )}
                                  </div>
                                  <span className="shrink-0 rounded-md bg-slate-50 px-2 py-1 text-sm font-semibold tabular-nums text-slate-900 ring-1 ring-surface-border">
                                    {formatCantidad(linea.total_unidades)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </CardBody>
              </Card>
            )}
          </div>
        </div>

        {stockDetalle && productosStockFiltrados.length > 0 && (
          <div className="shrink-0 border-t border-surface-border bg-white px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.04)] sm:px-6">
            <div className="mx-auto flex max-w-4xl items-center justify-between">
              <span className="text-sm text-slate-500">
                {stockSearch.trim()
                  ? `${productosStockFiltrados.length} de ${stockDetalle.productos.length} productos`
                  : 'Total del sector'}
              </span>
              <span className="text-xl font-bold tabular-nums text-brand-700">
                {formatCantidad(totalStockFiltrado)}
              </span>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Catálogo de bodega
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Sectores
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-500">
            Ubicaciones de la bodega, sectores de descuento y puntos internos. Clic en un sector
            para ver su contenido.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasPermiso('sectores.crear') && (
            <>
              <span className="hidden rounded-full border border-surface-border bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 shadow-card sm:inline-flex">
                Enter = nuevo sector
              </span>
              <Button className="rounded-xl px-4" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Nuevo sector
              </Button>
            </>
          )}
        </div>
      </section>

      <Card className="overflow-hidden shadow-panel">
        <div className="border-b border-brand-100 bg-gradient-to-r from-brand-50/80 via-white to-white px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Listado de sectores</h2>
              <p className="text-xs text-slate-500">
                {loading ? 'Cargando sectores...' : `${sectores.length} sector(es)`}
              </p>
            </div>
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400" />
              <input
                ref={searchRef}
                type="search"
                placeholder="Buscar sector..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
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
              Cargando sectores...
            </div>
          ) : sectores.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <Warehouse className="h-7 w-7" />
              </div>
              <p className="mt-4 text-sm font-medium text-slate-700">No hay sectores</p>
              <p className="mt-1 max-w-sm text-xs text-slate-500">
                Creá sectores para organizar el stock de la bodega
              </p>
              {hasPermiso('sectores.crear') && (
                <Button className="mt-4 rounded-xl" size="sm" onClick={openCreate}>
                  <Plus className="h-4 w-4" />
                  Crear sector
                </Button>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-surface-border">
              {sectores.map((s) => (
                <li key={s.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => void openSectorContenido(s)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        void openSectorContenido(s)
                      }
                    }}
                    className="flex cursor-pointer flex-col gap-3 px-4 py-4 transition-colors hover:bg-brand-50/40 sm:flex-row sm:items-center sm:gap-4 sm:px-6"
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                        <Warehouse className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-semibold text-slate-900">{s.nombre}</p>
                          <Badge variant={s.activo ? 'success' : 'muted'}>
                            {s.activo ? 'Activo' : 'Inactivo'}
                          </Badge>
                          {!!s.es_sector_descuento && (
                            <Badge variant="default">
                              Descuento P{s.prioridad_descuento ?? '—'}
                            </Badge>
                          )}
                        </div>
                        {s.descripcion && (
                          <p className="mt-1 line-clamp-1 text-xs text-slate-500">{s.descripcion}</p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                          {s.usa_ubicaciones ? (
                            <span className="inline-flex items-center gap-1">
                              <Layers className="h-3.5 w-3.5 text-brand-500" />
                              {s.ubicaciones_count} ubicación{s.ubicaciones_count === 1 ? '' : 'es'}
                            </span>
                          ) : (
                            <span>Sin ubicaciones internas</span>
                          )}
                          {s.productos_con_stock > 0 ? (
                            <span>
                              {s.productos_con_stock} producto{s.productos_con_stock === 1 ? '' : 's'}{' '}
                              · {formatCantidad(s.stock_total_unidades)} total
                            </span>
                          ) : (
                            <span>Sin stock</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div
                      className="flex shrink-0 items-center gap-2 sm:justify-end"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      {s.productos_con_stock > 0 && (
                        <span className="inline-flex min-w-[3rem] items-center justify-center rounded-lg bg-brand-50 px-2.5 py-1.5 text-sm font-bold tabular-nums text-brand-700 ring-1 ring-brand-100">
                          {formatCantidad(s.stock_total_unidades)}
                        </span>
                      )}
                      {hasPermiso('sectores.editar') && (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="rounded-lg"
                          onClick={() => openEdit(s)}
                        >
                          <Pencil className="h-4 w-4" />
                          Editar
                        </Button>
                      )}
                      <ChevronRight className="hidden h-4 w-4 text-slate-300 sm:block" />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
