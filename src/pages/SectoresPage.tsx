import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Layers,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Search,
  Trash2,
  Warehouse
} from 'lucide-react'
import { formatCantidad } from '@/lib/desglose'
import { api, cn } from '@/lib/utils'
import type { Sector, SectorForm, SectorUbicacion } from '@/types'
import { useAuth } from '@/context/AuthContext'
import { useEscHandler } from '@/hooks/useEscHandler'
import { useRegistroListKeyboard } from '@/hooks/useRegistroListKeyboard'
import { focusAndScrollIntoView } from '@/lib/scroll'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge, Card, CardBody } from '@/components/ui/Card'


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
  const [view, setView] = useState<'list' | 'form'>('list')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<SectorForm>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [expandedSectorIds, setExpandedSectorIds] = useState<Set<number>>(() => new Set())
  const [ubicacionesCache, setUbicacionesCache] = useState<Record<number, SectorUbicacion[]>>({})
  const [loadingUbicacionesId, setLoadingUbicacionesId] = useState<number | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
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

  function abrirNuevoSector() {
    openCreate()
  }

  async function toggleSectorUbicaciones(sector: Sector) {
    if (!sector.usa_ubicaciones) return

    const id = sector.id
    if (expandedSectorIds.has(id)) {
      setExpandedSectorIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      return
    }

    setExpandedSectorIds((prev) => new Set(prev).add(id))

    if (ubicacionesCache[id]) return

    setLoadingUbicacionesId(id)
    try {
      const data = await api<SectorUbicacion[]>(`/api/sectores/${sector.id}/ubicaciones`)
      setUbicacionesCache((prev) => ({ ...prev, [id]: data }))
    } catch {
      setUbicacionesCache((prev) => ({ ...prev, [id]: [] }))
    } finally {
      setLoadingUbicacionesId(null)
    }
  }

  useEscHandler(view === 'list' && expandedSectorIds.size > 0, () => {
    setExpandedSectorIds(new Set())
    return true
  })

  useEscHandler(view === 'form', () => {
    if (saving) return false
    volverAlListado()
    return true
  })

  useEffect(() => {
    if (view !== 'list') return
    const timer = setTimeout(() => focusAndScrollIntoView(searchRef.current), 80)
    return () => clearTimeout(timer)
  }, [view])

  const load = useCallback(async (q?: string) => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (q?.trim()) params.set('q', q.trim())
      const data = await api<Sector[]>(`/api/sectores?${params}`)
      setSectores(data)
      setExpandedSectorIds(new Set())
      setUbicacionesCache({})
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

  const registroListKb = useRegistroListKeyboard({
    enabled: view === 'list',
    items: sectores,
    listSearchRef: searchRef,
    canCreate: hasPermiso('sectores.crear'),
    onCreate: abrirNuevoSector,
    onOpenDetail: (s) => {
      if (s.usa_ubicaciones) {
        void toggleSectorUbicaciones(s)
      }
    }
  })

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
            para ver sus ubicaciones; usá Editar para modificar. El stock se consulta en Consulta → Por sector.
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
              {sectores.map((s, index) => {
                const isExpanded = expandedSectorIds.has(s.id)
                const ubicaciones = ubicacionesCache[s.id]
                const loadingUbicaciones = loadingUbicacionesId === s.id

                return (
                <li key={s.id}>
                  <div
                    role={s.usa_ubicaciones ? 'button' : undefined}
                    tabIndex={s.usa_ubicaciones ? 0 : undefined}
                    onClick={
                      s.usa_ubicaciones ? () => void toggleSectorUbicaciones(s) : undefined
                    }
                    onKeyDown={
                      s.usa_ubicaciones
                        ? (e) => {
                            if (registroListKb.highlightIndex >= 0) return
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              void toggleSectorUbicaciones(s)
                            }
                          }
                        : undefined
                    }
                    {...registroListKb.listItemProps(
                      index,
                      cn(
                        'flex flex-col gap-3 px-4 py-4 transition-colors sm:flex-row sm:items-center sm:gap-4 sm:px-6',
                        s.usa_ubicaciones && 'cursor-pointer hover:bg-brand-50/40',
                        isExpanded && 'bg-brand-50/30'
                      )
                    )}
                  >
                    {!!s.usa_ubicaciones && (
                      <span
                        className={cn(
                          'shrink-0 self-start rounded-lg p-1.5 sm:self-center',
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
                    )}

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
                    </div>
                  </div>

                  {isExpanded && !!s.usa_ubicaciones && (
                    <div className="border-t border-brand-100/80 bg-gradient-to-b from-surface-muted/40 to-white px-4 py-4 sm:px-6">
                      <div className="ml-1 flex items-center gap-2 sm:ml-10">
                        <Layers className="h-3.5 w-3.5 text-brand-500" />
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                          Ubicaciones internas
                        </p>
                      </div>
                      {loadingUbicaciones ? (
                        <div className="mt-3 flex items-center gap-2 py-2 text-sm text-slate-500 sm:ml-10">
                          <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
                          Cargando ubicaciones...
                        </div>
                      ) : !ubicaciones || ubicaciones.length === 0 ? (
                        <p className="mt-3 rounded-xl border border-dashed border-surface-border bg-white px-4 py-5 text-center text-sm text-slate-500 sm:ml-10">
                          Sin ubicaciones cargadas. Usá Editar para agregar puntos internos.
                        </p>
                      ) : (
                        <ul className="mt-3 grid gap-2 sm:ml-10 sm:grid-cols-2 lg:grid-cols-3">
                          {ubicaciones.map((u) => (
                            <li
                              key={u.id}
                              className="flex items-center gap-2 rounded-lg border border-surface-border bg-white px-3 py-2.5 text-sm"
                            >
                              <MapPin className="h-3.5 w-3.5 shrink-0 text-brand-500" />
                              <span className="truncate font-medium text-slate-900">{u.nombre}</span>
                              {!u.activo && (
                                <Badge variant="muted" className="ml-auto shrink-0 text-[10px]">
                                  Inactiva
                                </Badge>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
                )
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
