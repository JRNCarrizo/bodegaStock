import { useEffect, useMemo, useState } from 'react'
import { Loader2, Pencil, Plus, Shield, UserCog, X } from 'lucide-react'
import { api, cn } from '@/lib/utils'
import type { Rol, UsuarioListItem } from '@/types'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardBody } from '@/components/ui/Card'

const ROL_DEFAULT = 'Supervisor'

function emptyCreateForm(defaultRolId = '') {
  return {
    username: '',
    password: '',
    nombre: '',
    rol_id: defaultRolId
  }
}

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

function pillRol(rolNombre: string | null) {
  if (!rolNombre) {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-100">
        Sin rol
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-800 ring-1 ring-brand-100">
      <Shield className="h-3 w-3" />
      {rolNombre}
    </span>
  )
}

const selectClass =
  'w-full rounded-xl border border-surface-border bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20'

export function UsuariosPage() {
  const { hasPermiso } = useAuth()
  const [usuarios, setUsuarios] = useState<UsuarioListItem[]>([])
  const [roles, setRoles] = useState<Rol[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState(emptyCreateForm())
  const [editForm, setEditForm] = useState({
    nombre: '',
    rol_id: '',
    activo: true,
    password: ''
  })

  const defaultRolId = useMemo(() => {
    const preferred =
      roles.find((r) => r.nombre === ROL_DEFAULT) ?? roles.find((r) => r.nombre === 'Administrador')
    return preferred ? String(preferred.id) : roles[0] ? String(roles[0].id) : ''
  }, [roles])

  async function load() {
    setLoading(true)
    try {
      const [u, r] = await Promise.all([
        api<UsuarioListItem[]>('/api/usuarios'),
        api<Rol[]>('/api/roles')
      ])
      setUsuarios(u)
      setRoles(r)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    if (showForm && !form.rol_id && defaultRolId) {
      setForm((prev) => ({ ...prev, rol_id: defaultRolId }))
    }
  }, [showForm, defaultRolId, form.rol_id])

  function abrirNuevo() {
    setEditingId(null)
    setForm(emptyCreateForm(defaultRolId))
    setShowForm(true)
    setError('')
  }

  function abrirEditar(u: UsuarioListItem) {
    setShowForm(false)
    setEditingId(u.id)
    setEditForm({
      nombre: u.nombre,
      rol_id: u.rol_id ? String(u.rol_id) : defaultRolId,
      activo: !!u.activo,
      password: ''
    })
    setError('')
  }

  function cancelarEditar() {
    setEditingId(null)
    setEditForm({ nombre: '', rol_id: '', activo: true, password: '' })
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.rol_id) {
      setError('Seleccioná un rol para el usuario')
      return
    }
    setSaving(true)
    setError('')
    try {
      await api('/api/usuarios', {
        method: 'POST',
        body: JSON.stringify({
          username: form.username,
          password: form.password,
          nombre: form.nombre,
          rol_id: Number(form.rol_id)
        })
      })
      setForm(emptyCreateForm(defaultRolId))
      setShowForm(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear')
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    if (!editingId) return
    if (!editForm.rol_id) {
      setError('Seleccioná un rol para el usuario')
      return
    }
    setSaving(true)
    setError('')
    try {
      await api(`/api/usuarios/${editingId}`, {
        method: 'PUT',
        body: JSON.stringify({
          nombre: editForm.nombre,
          rol_id: Number(editForm.rol_id),
          activo: editForm.activo,
          ...(editForm.password.trim() ? { password: editForm.password } : {})
        })
      })
      cancelarEditar()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  function rolDescripcion(rolId: number | null): string | null {
    if (!rolId) return null
    return roles.find((r) => r.id === rolId)?.descripcion ?? null
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Administración
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Usuarios
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-500">
            Cada usuario necesita un rol — define qué secciones ve y qué puede hacer (incluido
            verificar retornos).
          </p>
        </div>
        {hasPermiso('usuarios.crear') && !showForm && editingId === null && (
          <Button className="rounded-xl px-4" onClick={abrirNuevo}>
            <Plus className="h-4 w-4" />
            Nuevo usuario
          </Button>
        )}
      </section>

      <Card className="overflow-hidden shadow-panel">
        <div className="border-b border-brand-100 bg-gradient-to-r from-brand-50/80 via-white to-white px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Roles disponibles</p>
              <p className="text-xs text-slate-500">Permisos asignados por tipo de usuario</p>
            </div>
          </div>
        </div>
        <CardBody className="border-b border-surface-border bg-slate-50/50">
          <ul className="grid gap-2 sm:grid-cols-3">
            {roles.map((r) => (
              <li
                key={r.id}
                className="rounded-xl border border-surface-border bg-white px-4 py-3 shadow-sm"
              >
                <p className="font-semibold text-slate-900">{r.nombre}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  {r.descripcion ?? '—'}
                </p>
              </li>
            ))}
          </ul>
        </CardBody>

        {showForm && hasPermiso('usuarios.crear') && (
          <CardBody className="border-b border-brand-100 bg-gradient-to-b from-brand-50/40 to-white">
            <p className="mb-4 text-sm font-semibold text-slate-900">Nuevo usuario</p>
            <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Nombre completo"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                required
              />
              <Input
                label="Usuario (login)"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
              />
              <Input
                label="Contraseña"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">Rol *</label>
                <select
                  className={selectClass}
                  value={form.rol_id}
                  onChange={(e) => setForm({ ...form, rol_id: e.target.value })}
                  required
                >
                  <option value="">Seleccionar rol...</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre}
                    </option>
                  ))}
                </select>
                {form.rol_id && (
                  <p className="text-xs text-slate-500">{rolDescripcion(Number(form.rol_id))}</p>
                )}
              </div>
              <div className="sm:col-span-2 rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3 text-xs leading-relaxed text-slate-600">
                Para probar retornos: cargá con un usuario <strong>Operador</strong> y verificá con{' '}
                <strong>Supervisor</strong> o <strong>Administrador</strong> (usuario distinto).
              </div>
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <Button type="submit" className="rounded-xl" disabled={saving}>
                  {saving ? 'Guardando...' : 'Guardar usuario'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="rounded-xl"
                  onClick={() => setShowForm(false)}
                >
                  Cancelar
                </Button>
              </div>
            </form>
          </CardBody>
        )}

        {editingId !== null && hasPermiso('usuarios.editar') && (
          <CardBody className="border-b border-amber-100 bg-gradient-to-b from-amber-50/50 to-white">
            <p className="mb-4 text-sm font-semibold text-slate-900">Editar usuario #{editingId}</p>
            <form onSubmit={handleUpdate} className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Nombre completo"
                value={editForm.nombre}
                onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })}
                required
              />
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">Rol *</label>
                <select
                  className={selectClass}
                  value={editForm.rol_id}
                  onChange={(e) => setEditForm({ ...editForm, rol_id: e.target.value })}
                  required
                >
                  <option value="">Seleccionar rol...</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <Input
                label="Nueva contraseña"
                type="password"
                value={editForm.password}
                onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                placeholder="Dejar vacío para no cambiar"
              />
              <label className="flex items-center gap-3 self-end rounded-xl border border-surface-border bg-white px-4 py-3">
                <input
                  type="checkbox"
                  checked={editForm.activo}
                  onChange={(e) => setEditForm({ ...editForm, activo: e.target.checked })}
                  className="h-4 w-4 rounded border-surface-border text-brand-600"
                />
                <span className="text-sm font-medium text-slate-700">Usuario activo</span>
              </label>
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <Button type="submit" className="rounded-xl" disabled={saving}>
                  {saving ? 'Guardando...' : 'Guardar cambios'}
                </Button>
                <Button type="button" variant="secondary" className="rounded-xl" onClick={cancelarEditar}>
                  <X className="h-4 w-4" />
                  Cancelar
                </Button>
              </div>
            </form>
          </CardBody>
        )}

        <div className="flex items-center justify-between gap-3 border-b border-surface-border bg-slate-50/80 px-5 py-3.5 sm:px-6">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Listado</h2>
            <p className="text-xs text-slate-500">{usuarios.length} usuario(s) registrado(s)</p>
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
              Cargando usuarios...
            </div>
          ) : usuarios.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <UserCog className="h-7 w-7" />
              </div>
              <p className="mt-4 text-sm font-medium text-slate-700">No hay usuarios</p>
              <p className="mt-1 text-xs text-slate-500">Creá el primer usuario con rol asignado</p>
              {hasPermiso('usuarios.crear') && (
                <Button className="mt-4 rounded-xl" size="sm" onClick={abrirNuevo}>
                  <Plus className="h-4 w-4" />
                  Nuevo usuario
                </Button>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-surface-border">
              {usuarios.map((u) => (
                <li
                  key={u.id}
                  className={cn(
                    'flex flex-col gap-3 px-4 py-4 transition-colors sm:flex-row sm:items-center sm:gap-4 sm:px-6',
                    editingId === u.id ? 'bg-amber-50/50' : 'hover:bg-slate-50/80'
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold text-slate-900">{u.nombre}</p>
                      {pillActivo(u.activo)}
                    </div>
                    <p className="mt-1 font-mono text-sm text-slate-600">@{u.username}</p>
                    <div className="mt-2">{pillRol(u.rol_nombre)}</div>
                    {!u.rol_nombre && (
                      <p className="mt-1 text-xs text-amber-700">Sin permisos hasta asignar un rol</p>
                    )}
                  </div>
                  {hasPermiso('usuarios.editar') && (
                    <div className="flex shrink-0 sm:justify-end">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="rounded-lg"
                        onClick={() => abrirEditar(u)}
                      >
                        <Pencil className="h-4 w-4" />
                        Editar
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
