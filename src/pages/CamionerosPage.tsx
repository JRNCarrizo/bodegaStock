import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Search,
  Trash2,
  Truck
} from 'lucide-react'
import { api } from '@/lib/utils'
import type { Camionero, CamioneroForm, CamioneroVehiculo } from '@/types'
import { useAuth } from '@/context/AuthContext'
import { useEscHandler } from '@/hooks/useEscHandler'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge, Card, CardBody, CardHeader } from '@/components/ui/Card'

const emptyForm = (): CamioneroForm => ({
  numero_interno: '',
  nombre: '',
  empresa: '',
  activo: true
})

function CamioneroVehiculosPanel({
  camioneroId,
  canEdit,
  autoFocus,
  onAutoFocusDone,
  onUpdated
}: {
  camioneroId: number
  canEdit: boolean
  autoFocus?: boolean
  onAutoFocusDone?: () => void
  onUpdated?: () => void
}) {
  const [vehiculos, setVehiculos] = useState<CamioneroVehiculo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [marca, setMarca] = useState('')
  const [modelo, setModelo] = useState('')
  const [patente, setPatente] = useState('')
  const [saving, setSaving] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const marcaRef = useRef<HTMLInputElement>(null)
  const modeloRef = useRef<HTMLInputElement>(null)
  const patenteRef = useRef<HTMLInputElement>(null)

  function focusMarca() {
    requestAnimationFrame(() => {
      const el = marcaRef.current
      if (!el) return
      el.focus()
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
  }

  function handleVehiculoKeyDown(
    e: React.KeyboardEvent,
    next?: React.RefObject<HTMLInputElement | null>
  ) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (next?.current) {
      requestAnimationFrame(() => {
        next.current?.focus()
        next.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      })
    } else {
      formRef.current?.requestSubmit()
    }
  }

  useEffect(() => {
    if (!canEdit || !autoFocus) return
    const timer = setTimeout(() => {
      focusMarca()
      onAutoFocusDone?.()
    }, 80)
    return () => clearTimeout(timer)
  }, [canEdit, autoFocus, camioneroId])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api<CamioneroVehiculo[]>(`/api/camioneros/${camioneroId}/vehiculos`)
      setVehiculos(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar vehículos')
    } finally {
      setLoading(false)
    }
  }, [camioneroId])

  useEffect(() => {
    load()
  }, [load])

  async function agregarVehiculo(e: React.FormEvent) {
    e.preventDefault()
    if (!marca.trim() || !modelo.trim() || !patente.trim()) return
    setSaving(true)
    setError('')
    try {
      await api(`/api/camioneros/${camioneroId}/vehiculos`, {
        method: 'POST',
        body: JSON.stringify({ marca, modelo, patente })
      })
      setMarca('')
      setModelo('')
      setPatente('')
      await load()
      onUpdated?.()
      focusMarca()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al agregar vehículo')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActivoVehiculo(v: CamioneroVehiculo) {
    setError('')
    try {
      await api(`/api/camioneros/${camioneroId}/vehiculos/${v.id}`, {
        method: 'PUT',
        body: JSON.stringify({ activo: !v.activo })
      })
      await load()
      onUpdated?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar vehículo')
    }
  }

  async function eliminarVehiculo(id: number) {
    if (!confirm('¿Eliminar este vehículo?')) return
    setError('')
    try {
      await api(`/api/camioneros/${camioneroId}/vehiculos/${id}`, { method: 'DELETE' })
      await load()
      onUpdated?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar')
    }
  }

  return (
    <div className="rounded-lg border border-surface-border bg-white p-4 space-y-4">
      <div>
        <p className="text-sm font-medium text-slate-800">Vehículos</p>
        <p className="text-xs text-slate-500 mt-1">
          Cada camionero puede tener uno o más vehículos · Enter avanza entre campos · en Patente
          agrega y vuelve a Marca
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {canEdit && (
        <form
          ref={formRef}
          onSubmit={agregarVehiculo}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]"
        >
          <Input
            ref={marcaRef}
            label="Marca"
            value={marca}
            onChange={(e) => setMarca(e.target.value)}
            onKeyDown={(e) => handleVehiculoKeyDown(e, modeloRef)}
            placeholder="ej. Mercedes-Benz"
          />
          <Input
            ref={modeloRef}
            label="Modelo"
            value={modelo}
            onChange={(e) => setModelo(e.target.value)}
            onKeyDown={(e) => handleVehiculoKeyDown(e, patenteRef)}
            placeholder="ej. Accelo 1016"
          />
          <Input
            ref={patenteRef}
            label="Patente"
            value={patente}
            onChange={(e) => setPatente(e.target.value.toUpperCase())}
            onKeyDown={(e) => handleVehiculoKeyDown(e)}
            placeholder="ej. AB123CD"
          />
          <div className="flex items-end">
            <Button
              type="submit"
              disabled={saving || !marca.trim() || !modelo.trim() || !patente.trim()}
            >
              <Plus className="h-4 w-4" />
              Agregar
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Cargando vehículos...</p>
      ) : vehiculos.length === 0 ? (
        <p className="text-sm text-slate-500">Sin vehículos cargados.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-surface-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">Patente</th>
                <th className="px-4 py-2">Marca</th>
                <th className="px-4 py-2">Modelo</th>
                <th className="px-4 py-2">Estado</th>
                {canEdit && <th className="px-4 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {vehiculos.map((v) => (
                <tr
                  key={v.id}
                  className={v.activo ? 'hover:bg-slate-50/50' : 'bg-slate-50/40 opacity-75'}
                >
                  <td className="px-4 py-2 font-mono font-semibold text-slate-900">{v.patente}</td>
                  <td className="px-4 py-2 text-slate-700">{v.marca}</td>
                  <td className="px-4 py-2 text-slate-700">{v.modelo}</td>
                  <td className="px-4 py-2">
                    <Badge variant={v.activo ? 'success' : 'muted'}>
                      {v.activo ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </td>
                  {canEdit && (
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleActivoVehiculo(v)}
                        >
                          {v.activo ? 'Desactivar' : 'Activar'}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => eliminarVehiculo(v.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function CamionerosPage() {
  const { hasPermiso } = useAuth()
  const [camioneros, setCamioneros] = useState<Camionero[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState<'list' | 'form'>('list')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<CamioneroForm>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [vehiculosCache, setVehiculosCache] = useState<Record<number, CamioneroVehiculo[]>>({})
  const [loadingVehiculosId, setLoadingVehiculosId] = useState<number | null>(null)
  const [focusVehiculosForm, setFocusVehiculosForm] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const numeroInternoRef = useRef<HTMLInputElement>(null)
  const nombreRef = useRef<HTMLInputElement>(null)
  const empresaRef = useRef<HTMLInputElement>(null)
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

  function shouldAbrirFormularioConEnter(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return true
    if (target.closest('button, a, textarea, [contenteditable="true"]')) return false
    if (target instanceof HTMLInputElement && target.type === 'date') return false
    if (target instanceof HTMLSelectElement) return false
    return true
  }

  function abrirNuevoCamionero() {
    openCreate()
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' || !hasPermiso('camioneros.crear')) return
    e.preventDefault()
    abrirNuevoCamionero()
  }

  useEffect(() => {
    if (view !== 'list' || !hasPermiso('camioneros.crear')) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat) return
      if (!shouldAbrirFormularioConEnter(e.target)) return
      e.preventDefault()
      abrirNuevoCamionero()
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

  const loadVehiculos = useCallback(async (camioneroId: number) => {
    setLoadingVehiculosId(camioneroId)
    try {
      const data = await api<CamioneroVehiculo[]>(`/api/camioneros/${camioneroId}/vehiculos`)
      setVehiculosCache((prev) => ({ ...prev, [camioneroId]: data }))
    } catch {
      setVehiculosCache((prev) => ({ ...prev, [camioneroId]: [] }))
    } finally {
      setLoadingVehiculosId(null)
    }
  }, [])

  async function toggleExpand(camionero: Camionero) {
    if (expandedId === camionero.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(camionero.id)
    if (!vehiculosCache[camionero.id]) {
      await loadVehiculos(camionero.id)
    }
  }

  const load = useCallback(async (q?: string) => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (q?.trim()) params.set('q', q.trim())
      const data = await api<Camionero[]>(`/api/camioneros?${params}`)
      setCamioneros(data)
      setVehiculosCache({})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar camioneros')
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
    setFocusVehiculosForm(false)
    setView('list')
  }

  function openCreate() {
    resetFormFields()
    setError('')
    setView('form')
    setTimeout(() => focusField(numeroInternoRef), 50)
  }

  function openEdit(c: Camionero) {
    setEditingId(c.id)
    setForm({
      numero_interno: c.numero_interno,
      nombre: c.nombre,
      empresa: c.empresa,
      activo: !!c.activo
    })
    setError('')
    setView('form')
    setTimeout(() => focusField(numeroInternoRef), 50)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const payload = {
      numero_interno: form.numero_interno,
      nombre: form.nombre,
      empresa: form.empresa,
      activo: form.activo
    }

    try {
      if (editingId) {
        await api(`/api/camioneros/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        })
        await load(search)
        if (expandedId === editingId) {
          await loadVehiculos(editingId)
        }
        volverAlListado()
      } else {
        const result = await api<{ id: number }>('/api/camioneros', {
          method: 'POST',
          body: JSON.stringify(payload)
        })
        await load(search)
        setEditingId(Number(result.id))
        setFocusVehiculosForm(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const formContent = (
    <>
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            ref={numeroInternoRef}
            label="Número interno *"
            value={form.numero_interno}
            onChange={(e) =>
              setForm({ ...form, numero_interno: e.target.value.toUpperCase() })
            }
            onKeyDown={(e) => handleFormKeyDown(e, nombreRef)}
            placeholder="ej. CAM-001"
            required
          />
          <Input
            ref={nombreRef}
            label="Nombre *"
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            onKeyDown={(e) => handleFormKeyDown(e, empresaRef)}
            placeholder="Nombre del camionero"
            required
          />
          <Input
            ref={empresaRef}
            label="Empresa *"
            value={form.empresa}
            onChange={(e) => setForm({ ...form, empresa: e.target.value })}
            onKeyDown={(e) => handleFormKeyDown(e, activoRef)}
            placeholder="Transporte / empresa"
            required
            className="sm:col-span-2"
          />
        </div>

        <label className="flex items-center gap-2">
          <input
            ref={activoRef}
            type="checkbox"
            checked={form.activo}
            onChange={(e) => setForm({ ...form, activo: e.target.checked })}
            onKeyDown={(e) => handleFormKeyDown(e)}
            className="h-4 w-4 rounded border-surface-border text-brand-600"
          />
          <span className="text-sm text-slate-700">Camionero activo</span>
        </label>
      </form>

      {editingId && (
        <div className="mt-6">
          <CamioneroVehiculosPanel
            camioneroId={editingId}
            canEdit={hasPermiso('camioneros.editar')}
            autoFocus={focusVehiculosForm}
            onAutoFocusDone={() => setFocusVehiculosForm(false)}
            onUpdated={() => {
              loadVehiculos(editingId)
              load(search)
            }}
          />
        </div>
      )}

      {!editingId && (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Guardá el camionero primero para poder cargar sus vehículos.
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <Button type="button" disabled={saving} onClick={() => void formRef.current?.requestSubmit()}>
          {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Crear camionero'}
        </Button>
        <Button type="button" variant="secondary" onClick={volverAlListado}>
          Cancelar
        </Button>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Enter pasa al siguiente campo · en Activo guarda · Esc vuelve al listado
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
            {editingId ? 'Editar camionero' : 'Nuevo camionero'}
          </h1>
          <p className="mt-1 mb-6 text-slate-500">
            {editingId
              ? 'Modificá los datos del transportista y sus vehículos'
              : 'Completá los datos con Enter para avanzar entre campos'}
          </p>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
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
          <h1 className="text-2xl font-bold text-slate-900">Camioneros</h1>
          <p className="mt-1 text-slate-500">
            Transportistas con número interno, nombre, empresa y sus vehículos
          </p>
        </div>
        {hasPermiso('camioneros.crear') && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Nuevo camionero
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
              placeholder="Buscar por nº interno, nombre, empresa o patente... · Enter = nuevo camionero"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="w-full rounded-lg border border-surface-border py-2 pl-10 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
        </CardBody>

        <CardHeader title="Listado" description={`${camioneros.length} camionero(s)`} />

        <CardBody className="p-0">
          {error && (
            <div className="border-b border-red-100 bg-red-50 px-6 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {loading ? (
            <p className="p-6 text-sm text-slate-500">Cargando...</p>
          ) : camioneros.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <Truck className="h-12 w-12 text-slate-300" />
              <p className="mt-3 font-medium text-slate-700">No hay camioneros</p>
              <p className="mt-1 text-sm text-slate-500">
                Cargá transportistas para usar en planillas e ingresos
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-border bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="w-10 px-3 py-3" />
                    <th className="px-6 py-3">Nº interno</th>
                    <th className="px-6 py-3">Nombre</th>
                    <th className="px-6 py-3">Empresa</th>
                    <th className="px-6 py-3">Vehículos</th>
                    <th className="px-6 py-3">Estado</th>
                    <th className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {camioneros.map((c) => {
                    const isExpanded = expandedId === c.id
                    const vehiculos = vehiculosCache[c.id]
                    const loadingVehiculos = loadingVehiculosId === c.id

                    return (
                      <Fragment key={c.id}>
                        <tr className="hover:bg-slate-50/50">
                          <td className="px-3 py-3">
                            <button
                              type="button"
                              onClick={() => toggleExpand(c)}
                              className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                              aria-expanded={isExpanded}
                              aria-label={
                                isExpanded ? 'Ocultar vehículos' : 'Ver vehículos'
                              }
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                          </td>
                          <td className="px-6 py-3">
                            <p className="font-mono text-base font-semibold text-slate-900">
                              {c.numero_interno}
                            </p>
                          </td>
                          <td className="px-6 py-3 font-medium text-slate-900">{c.nombre}</td>
                          <td className="px-6 py-3 text-slate-600">{c.empresa}</td>
                          <td className="px-6 py-3">
                            <button
                              type="button"
                              onClick={() => toggleExpand(c)}
                              className="inline-flex items-center gap-1 text-slate-600 hover:text-brand-700"
                            >
                              <Truck className="h-3.5 w-3.5 text-brand-600" />
                              {c.vehiculos_count} vehículo(s)
                            </button>
                          </td>
                          <td className="px-6 py-3">
                            <Badge variant={c.activo ? 'success' : 'muted'}>
                              {c.activo ? 'Activo' : 'Inactivo'}
                            </Badge>
                          </td>
                          <td className="px-6 py-3 text-right">
                            {hasPermiso('camioneros.editar') && (
                              <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>
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
                                  Vehículos de {c.nombre}
                                </p>
                                {loadingVehiculos ? (
                                  <p className="text-sm text-slate-500">Cargando...</p>
                                ) : !vehiculos || vehiculos.length === 0 ? (
                                  <p className="text-sm text-slate-500">
                                    Sin vehículos. Editá el camionero para agregar.
                                  </p>
                                ) : (
                                  <ul className="space-y-2">
                                    {vehiculos.map((v) => (
                                      <li
                                        key={v.id}
                                        className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-surface-border px-3 py-2 text-sm ${
                                          v.activo ? 'bg-white' : 'bg-slate-50 opacity-75'
                                        }`}
                                      >
                                        <span className="font-mono font-semibold text-slate-900">
                                          {v.patente}
                                        </span>
                                        <span className="text-slate-600">
                                          {v.marca} {v.modelo}
                                        </span>
                                        <Badge variant={v.activo ? 'success' : 'muted'}>
                                          {v.activo ? 'Activo' : 'Inactivo'}
                                        </Badge>
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
