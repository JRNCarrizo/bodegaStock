import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Layers,
  Pencil,
  Plus,
  Search,
  Trash2,
  Warehouse
} from 'lucide-react'
import { formatTotalCajas } from '@/lib/desglose'
import { api } from '@/lib/utils'
import type { Sector, SectorForm, SectorUbicacion } from '@/types'
import { useAuth } from '@/context/AuthContext'
import { useEscHandler } from '@/hooks/useEscHandler'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge, Card, CardBody, CardHeader } from '@/components/ui/Card'

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
    <div className="rounded-lg border border-surface-border bg-white p-4 space-y-4">
      <div>
        <p className="text-sm font-medium text-slate-800">Ubicaciones internas</p>
        <p className="text-xs text-slate-500 mt-1">
          Puntos dentro del sector donde puede haber stock: &quot;A arriba&quot;, &quot;1 izquierda&quot;,
          o lo que uses en la bodega. Al cargar ingresos o inventario se elige una de estas.
        </p>
      </div>

      {onToggleChange && (
        <label className="flex items-center gap-2 rounded-lg border border-surface-border bg-slate-50/60 px-3 py-2">
          <input
            type="checkbox"
            checked={toggleChecked}
            onChange={(e) => onToggleChange(e.target.checked)}
            className="h-4 w-4 rounded border-surface-border text-brand-600"
          />
          <span className="text-sm text-slate-700">Usar ubicaciones internas en este sector</span>
        </label>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Cargando ubicaciones...</p>
      ) : ubicaciones.length === 0 ? (
        <p className="text-sm text-slate-500">
          Sin ubicaciones. Agregá una con el nombre que uses en la bodega.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-surface-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">Ubicación</th>
                {canEdit && <th className="px-4 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {ubicaciones.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-2 font-medium text-slate-900">{u.nombre}</td>
                  {canEdit && (
                    <td className="px-4 py-2 text-right">
                      {confirmDeleteId === u.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-xs text-slate-500">¿Eliminar?</span>
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            disabled={deletingId === u.id}
                            onClick={() => void confirmarEliminar(u.id)}
                          >
                            Sí
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
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
                          disabled={deletingId !== null}
                          onClick={() => setConfirmDeleteId(u.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && (
        <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-end">
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
  const [expandedId, setExpandedId] = useState<number | null>(null)
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

  async function toggleExpand(sector: Sector) {
    if (!sector.usa_ubicaciones) return

    if (expandedId === sector.id) {
      setExpandedId(null)
      return
    }

    setExpandedId(sector.id)
    if (!ubicacionesCache[sector.id]) {
      await loadUbicaciones(sector.id)
    }
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
        if (expandedId === editingId) {
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
      <form ref={formRef} onSubmit={guardarSector} className="space-y-4">
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

        <label className="flex items-center gap-2">
          <input
            ref={activoRef}
            type="checkbox"
            checked={form.activo}
            onChange={(e) => setForm({ ...form, activo: e.target.checked })}
            onKeyDown={(e) => handleFormKeyDown(e, descuentoRef)}
            className="h-4 w-4 rounded border-surface-border text-brand-600"
          />
          <span className="text-sm text-slate-700">Sector activo</span>
        </label>

        <div className="rounded-lg border border-surface-border bg-white p-4 space-y-3">
          <p className="text-sm font-medium text-slate-800">Descuento de stock</p>
          <p className="text-xs text-slate-500">
            Los sectores marcados se usan primero al descontar en planillas y roturas.
          </p>
          <label className="flex items-center gap-2">
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
            <span className="text-sm text-slate-700">Sector de descuento</span>
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
          <label className="flex items-start gap-3 rounded-lg border border-surface-border bg-white p-4">
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
          <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
            Guardá el sector primero para poder agregar las ubicaciones internas.
          </p>
        )}
      </form>

      {editingId && form.usa_ubicaciones && (
        <div className="mt-4">
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

      <div className="mt-4 flex gap-2">
          <Button
            type="button"
            disabled={saving}
            onClick={() => void guardarSector()}
          >
            {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Crear sector'}
          </Button>
          <Button type="button" variant="secondary" onClick={volverAlListado}>
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
        <div className="mx-auto flex max-w-2xl flex-col px-4 py-8 pb-16">
          <Button variant="ghost" size="sm" className="mb-4 -ml-2 self-start" onClick={volverAlListado}>
            <ChevronLeft className="h-4 w-4" />
            Volver al listado
          </Button>

          <h1 className="text-2xl font-bold text-slate-900">
            {editingId ? 'Editar sector' : 'Nuevo sector'}
          </h1>
          <p className="mt-1 mb-6 text-slate-500">
            {editingId
              ? 'Modificá el sector y sus ubicaciones internas'
              : 'Completá los datos con Enter para avanzar entre campos'}
          </p>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}
          {successMessage && (
            <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
              {successMessage}
            </div>
          )}

          <Card>
            <CardBody>{formContent}</CardBody>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sectores</h1>
          <p className="mt-1 text-slate-500">
            Ubicaciones de la bodega, sectores de descuento y puntos internos por sector
          </p>
        </div>
        {hasPermiso('sectores.crear') && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Nuevo sector
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
              placeholder="Buscar por nombre... · Enter = nuevo sector"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="w-full rounded-lg border border-surface-border py-2 pl-10 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
        </CardBody>

        <CardHeader
          title="Listado"
          description={`${sectores.length} sector(es)`}
        />

        <CardBody className="p-0">
          {error && (
            <div className="border-b border-red-100 bg-red-50 px-6 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {loading ? (
            <p className="p-6 text-sm text-slate-500">Cargando...</p>
          ) : sectores.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <Warehouse className="h-12 w-12 text-slate-300" />
              <p className="mt-3 font-medium text-slate-700">No hay sectores</p>
              <p className="mt-1 text-sm text-slate-500">
                Creá sectores para organizar el stock de la bodega
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-border bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="w-10 px-3 py-3" />
                    <th className="px-6 py-3">Sector</th>
                    <th className="px-6 py-3">Ubicaciones</th>
                    <th className="px-6 py-3">Descuento</th>
                    <th className="px-6 py-3">Stock</th>
                    <th className="px-6 py-3">Estado</th>
                    <th className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {sectores.map((s) => {
                    const isExpanded = expandedId === s.id
                    const ubicaciones = ubicacionesCache[s.id]
                    const loadingUbicaciones = loadingUbicacionesId === s.id

                    return (
                      <Fragment key={s.id}>
                        <tr className="hover:bg-slate-50/50">
                          <td className="px-3 py-3">
                            {s.usa_ubicaciones ? (
                              <button
                                type="button"
                                onClick={() => toggleExpand(s)}
                                className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                                aria-expanded={isExpanded}
                                aria-label={
                                  isExpanded
                                    ? 'Ocultar ubicaciones'
                                    : 'Ver ubicaciones del sector'
                                }
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </button>
                            ) : null}
                          </td>
                          <td className="px-6 py-3">
                            <p className="text-base font-semibold text-slate-900">{s.nombre}</p>
                            {s.descripcion && (
                              <p className="text-xs text-slate-500 line-clamp-1">{s.descripcion}</p>
                            )}
                          </td>
                          <td className="px-6 py-3">
                            {s.usa_ubicaciones ? (
                              <button
                                type="button"
                                onClick={() => toggleExpand(s)}
                                className="inline-flex items-center gap-1 text-slate-600 hover:text-brand-700"
                              >
                                <Layers className="h-3.5 w-3.5 text-brand-600" />
                                {s.ubicaciones_count} ubicación(es)
                              </button>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-6 py-3">
                            {s.es_sector_descuento ? (
                              <Badge variant="default">
                                Prioridad {s.prioridad_descuento ?? '—'}
                              </Badge>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-6 py-3 text-slate-600">
                            {s.productos_con_stock > 0 ? (
                              <>
                                <p>{s.productos_con_stock} producto(s)</p>
                                <p className="text-xs text-slate-400">
                                  {formatTotalCajas(s.stock_total_unidades)} total
                                </p>
                              </>
                            ) : (
                              <span className="text-xs text-slate-400">Sin stock</span>
                            )}
                          </td>
                          <td className="px-6 py-3">
                            <Badge variant={s.activo ? 'success' : 'muted'}>
                              {s.activo ? 'Activo' : 'Inactivo'}
                            </Badge>
                          </td>
                          <td className="px-6 py-3 text-right">
                            {hasPermiso('sectores.editar') && (
                              <Button variant="ghost" size="sm" onClick={() => openEdit(s)}>
                                <Pencil className="h-4 w-4" />
                                Editar
                              </Button>
                            )}
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="bg-surface-muted/30">
                            <td colSpan={7} className="px-6 py-4">
                              <div className="ml-7 border-l-2 border-brand-200 pl-4">
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  Ubicaciones en {s.nombre}
                                </p>
                                {loadingUbicaciones ? (
                                  <p className="text-sm text-slate-500">Cargando...</p>
                                ) : !ubicaciones || ubicaciones.length === 0 ? (
                                  <p className="text-sm text-slate-500">
                                    Sin ubicaciones cargadas. Editá el sector para agregarlas.
                                  </p>
                                ) : (
                                  <ul className="flex flex-wrap gap-2">
                                    {ubicaciones.map((u) => (
                                      <li
                                        key={u.id}
                                        className="rounded-lg border border-surface-border bg-white px-3 py-1.5 text-sm text-slate-700"
                                      >
                                        {u.nombre}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
