import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Truck
} from 'lucide-react'
import { api, cn } from '@/lib/utils'
import type { Camionero, CamioneroForm, CamioneroVehiculo } from '@/types'
import { useAuth } from '@/context/AuthContext'
import { useEscHandler } from '@/hooks/useEscHandler'
import { useRegistroListKeyboard } from '@/hooks/useRegistroListKeyboard'
import { focusAndScrollIntoView } from '@/lib/scroll'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardBody } from '@/components/ui/Card'

function pillActivo(activo: boolean) {
  if (activo) {
    return (
      <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-800 ring-1 ring-green-100">
        Activo
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-surface-border">
      Inactivo
    </span>
  )
}

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
    <div className="space-y-4 rounded-xl border border-surface-border bg-gradient-to-br from-surface-muted/40 to-white p-4 sm:p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Flota</p>
        <p className="mt-1 text-sm text-slate-600">
          Cada camionero puede tener uno o más vehículos · Enter avanza entre campos · en Patente
          agrega y vuelve a Marca
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">
          {error}
        </div>
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
              className="rounded-xl"
              disabled={saving || !marca.trim() || !modelo.trim() || !patente.trim()}
            >
              <Plus className="h-4 w-4" />
              Agregar
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
          Cargando vehículos...
        </div>
      ) : vehiculos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-surface-border bg-white px-4 py-6 text-center">
          <Truck className="mx-auto h-6 w-6 text-slate-300" />
          <p className="mt-2 text-sm text-slate-500">Sin vehículos cargados.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {vehiculos.map((v) => (
            <li
              key={v.id}
              className={cn(
                'flex flex-wrap items-center justify-between gap-3 rounded-lg border border-surface-border px-3 py-2.5 sm:px-4',
                v.activo ? 'bg-white' : 'bg-slate-50/80 opacity-80'
              )}
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold text-slate-900">{v.patente}</span>
                <span className="text-sm text-slate-600">
                  {v.marca} {v.modelo}
                </span>
                {pillActivo(v.activo)}
              </div>
              {canEdit && (
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="rounded-lg"
                    onClick={() => toggleActivoVehiculo(v)}
                  >
                    {v.activo ? 'Desactivar' : 'Activar'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="rounded-lg"
                    onClick={() => eliminarVehiculo(v.id)}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
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

  function abrirNuevoCamionero() {
    openCreate()
  }

  useEscHandler(view === 'list' && expandedId !== null, () => {
    setExpandedId(null)
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

  const registroListKb = useRegistroListKeyboard({
    enabled: view === 'list',
    items: camioneros,
    listSearchRef: searchRef,
    canCreate: hasPermiso('camioneros.crear'),
    onCreate: abrirNuevoCamionero,
    onOpenDetail: (c) => {
      if (expandedId !== c.id) void toggleExpand(c)
    },
    onEscFromHighlight: () => {
      if (expandedId !== null) {
        setExpandedId(null)
        return true
      }
      return false
    }
  })

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

        <label className="flex items-center gap-3 rounded-xl border border-surface-border bg-white px-4 py-3">
          <input
            ref={activoRef}
            type="checkbox"
            checked={form.activo}
            onChange={(e) => setForm({ ...form, activo: e.target.checked })}
            onKeyDown={(e) => handleFormKeyDown(e)}
            className="h-4 w-4 rounded border-surface-border text-brand-600"
          />
          <span className="text-sm font-medium text-slate-700">Camionero activo</span>
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
        <p className="mt-4 rounded-xl border border-amber-100 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
          Guardá el camionero primero para poder cargar sus vehículos.
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <Button
          type="button"
          className="rounded-xl"
          disabled={saving}
          onClick={() => void formRef.current?.requestSubmit()}
        >
          {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Crear camionero'}
        </Button>
        <Button type="button" variant="secondary" className="rounded-xl" onClick={volverAlListado}>
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
        <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-6 pb-16 lg:px-6">
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
              {editingId ? 'Editar camionero' : 'Nuevo camionero'}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {editingId
                ? 'Modificá los datos del transportista y sus vehículos'
                : 'Completá los datos con Enter para avanzar entre campos'}
            </p>
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-100">
              {error}
            </div>
          )}

          <Card className="overflow-hidden shadow-panel">
            <div className="border-b border-brand-100 bg-gradient-to-r from-brand-50/80 via-white to-white px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
                  <Truck className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Datos del camionero</p>
                  <p className="text-xs text-slate-500">Número interno, nombre y empresa</p>
                </div>
              </div>
            </div>
            <CardBody>{formContent}</CardBody>
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
            Administración
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Camioneros
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-500">
            Transportistas con número interno, nombre, empresa y vehículos para planillas y retornos.
          </p>
        </div>
        {hasPermiso('camioneros.crear') && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="hidden rounded-full border border-surface-border bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 shadow-card sm:inline-flex">
              Enter = nuevo camionero
            </span>
            <Button className="rounded-xl px-4" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Nuevo camionero
            </Button>
          </div>
        )}
      </section>

      <Card className="overflow-hidden shadow-panel">
        <div className="border-b border-brand-100 bg-gradient-to-r from-brand-50/80 via-white to-white px-5 py-4 sm:px-6">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400" />
            <input
              ref={searchRef}
              type="search"
              placeholder="Buscar por nº interno, nombre, empresa o patente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={registroListKb.handleListSearchKeyDown}
              className="w-full rounded-xl border border-surface-border bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-surface-border bg-slate-50/80 px-5 py-3.5 sm:px-6">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Listado</h2>
            <p className="text-xs text-slate-500">{camioneros.length} camionero(s)</p>
          </div>
          {loading && <Loader2 className="h-5 w-5 shrink-0 animate-spin text-brand-600" />}
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
              Cargando camioneros...
            </div>
          ) : camioneros.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <Truck className="h-7 w-7" />
              </div>
              <p className="mt-4 text-sm font-medium text-slate-700">No hay camioneros</p>
              <p className="mt-1 max-w-sm text-xs text-slate-500">
                Cargá transportistas para usar en planillas y retornos
              </p>
              {hasPermiso('camioneros.crear') && (
                <Button className="mt-4 rounded-xl" size="sm" onClick={openCreate}>
                  <Plus className="h-4 w-4" />
                  Nuevo camionero
                </Button>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-surface-border">
              {camioneros.map((c, index) => {
                const isExpanded = expandedId === c.id
                const vehiculos = vehiculosCache[c.id]
                const loadingVehiculos = loadingVehiculosId === c.id

                return (
                  <li key={c.id}>
                    <div
                      {...registroListKb.listItemProps(
                        index,
                        cn(
                          'flex flex-col gap-3 px-4 py-4 transition-colors sm:flex-row sm:items-center sm:gap-4 sm:px-6',
                          isExpanded ? 'bg-brand-50/40' : 'hover:bg-slate-50/80'
                        )
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => toggleExpand(c)}
                        className={cn(
                          'shrink-0 self-start rounded-lg p-1.5 transition-colors sm:self-center',
                          isExpanded
                            ? 'bg-brand-100 text-brand-700'
                            : 'text-slate-400 hover:bg-slate-200 hover:text-slate-700'
                        )}
                        aria-expanded={isExpanded}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">
                            {c.numero_interno}
                          </span>
                          <p className="text-base font-semibold text-slate-900">{c.nombre}</p>
                          {pillActivo(c.activo)}
                        </div>
                        <p className="mt-1 text-sm text-slate-600">{c.empresa}</p>
                        <button
                          type="button"
                          onClick={() => toggleExpand(c)}
                          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-800"
                        >
                          <Truck className="h-3 w-3" />
                          {c.vehiculos_count} vehículo{c.vehiculos_count === 1 ? '' : 's'}
                        </button>
                      </div>

                      <div className="flex shrink-0 items-center gap-2 sm:justify-end">
                        {hasPermiso('camioneros.editar') && (
                          <Button
                            variant="secondary"
                            size="sm"
                            className="rounded-lg"
                            onClick={() => openEdit(c)}
                          >
                            <Pencil className="h-4 w-4" />
                            Editar
                          </Button>
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-brand-100/80 bg-gradient-to-b from-surface-muted/30 to-white px-4 py-4 sm:px-6">
                        <div className="ml-2 border-l-2 border-brand-200 pl-4 sm:ml-10">
                          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Vehículos de {c.nombre}
                          </p>
                          {loadingVehiculos ? (
                            <div className="flex items-center gap-2 text-sm text-slate-500">
                              <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
                              Cargando...
                            </div>
                          ) : !vehiculos || vehiculos.length === 0 ? (
                            <p className="text-sm text-slate-500">
                              Sin vehículos. Editá el camionero para agregar.
                            </p>
                          ) : (
                            <ul className="space-y-2">
                              {vehiculos.map((v) => (
                                <li
                                  key={v.id}
                                  className={cn(
                                    'flex flex-wrap items-center gap-2 rounded-lg border border-surface-border px-3 py-2.5 text-sm',
                                    v.activo ? 'bg-white' : 'bg-slate-50 opacity-75'
                                  )}
                                >
                                  <span className="font-mono font-semibold text-slate-900">
                                    {v.patente}
                                  </span>
                                  <span className="text-slate-600">
                                    {v.marca} {v.modelo}
                                  </span>
                                  {pillActivo(v.activo)}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
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
