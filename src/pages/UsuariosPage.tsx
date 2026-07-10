import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Pencil, Plus, Search, Shield, UserCog, X } from 'lucide-react'
import { api, cn } from '@/lib/utils'
import type { Rol, UsuarioListItem } from '@/types'
import { useAuth } from '@/context/AuthContext'
import { SECCIONES_ASIGNABLES, SECCION_GROUPS, SECCION_LABELS, type SeccionId } from '@/config/secciones'
import { useEscHandler } from '@/hooks/useEscHandler'
import { useRegistroListKeyboard } from '@/hooks/useRegistroListKeyboard'
import { focusAndScrollIntoView } from '@/lib/scroll'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardBody } from '@/components/ui/Card'

const ROL_ADMIN = 'Administrador'
const ROL_USUARIO = 'Usuario'
const ROL_DEFAULT = ROL_USUARIO

function emptyCreateForm(defaultRolId = '') {
  return {
    username: '',
    password: '',
    nombre: '',
    rol_id: defaultRolId,
    secciones: [] as SeccionId[]
  }
}

function rolIdEsUsuario(roles: Rol[], rolId: string): boolean {
  if (!rolId) return false
  return roles.find((r) => String(r.id) === rolId)?.nombre === ROL_USUARIO
}

function SeccionCheckboxes({
  secciones,
  onChange,
  disabled,
  compact
}: {
  secciones: SeccionId[]
  onChange: (next: SeccionId[]) => void
  disabled?: boolean
  compact?: boolean
}) {
  function toggle(id: SeccionId) {
    if (disabled) return
    onChange(secciones.includes(id) ? secciones.filter((s) => s !== id) : [...secciones, id])
  }

  return (
    <div className={cn('space-y-4', !compact && 'sm:col-span-2')}>
      <div>
        <p className="text-sm font-medium text-slate-700">Secciones permitidas *</p>
        <p className="mt-1 text-xs text-slate-500">
          Marcá las pantallas a las que puede acceder este usuario.
        </p>
      </div>
      {SECCION_GROUPS.map((group) => (
        <div key={group}>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{group}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {SECCIONES_ASIGNABLES.filter((s) => s.group === group).map((seccion) => (
              <label
                key={seccion.id}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-xl border border-surface-border bg-white px-4 py-3 transition-colors',
                  secciones.includes(seccion.id) && 'border-brand-200 bg-brand-50/40',
                  disabled && 'cursor-not-allowed opacity-60'
                )}
              >
                <input
                  type="checkbox"
                  checked={secciones.includes(seccion.id)}
                  onChange={() => toggle(seccion.id)}
                  disabled={disabled}
                  className="h-4 w-4 rounded border-surface-border text-brand-600"
                />
                <span className="text-sm font-medium text-slate-700">{seccion.label}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
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

function EditarUsuarioModal({
  open,
  usuario,
  roles,
  rolesActivos,
  editForm,
  setEditForm,
  saving,
  error,
  onClose,
  onSubmit
}: {
  open: boolean
  usuario: UsuarioListItem | null
  roles: Rol[]
  rolesActivos: Rol[]
  editForm: {
    nombre: string
    rol_id: string
    activo: boolean
    password: string
    secciones: SeccionId[]
  }
  setEditForm: React.Dispatch<
    React.SetStateAction<{
      nombre: string
      rol_id: string
      activo: boolean
      password: string
      secciones: SeccionId[]
    }>
  >
  saving: boolean
  error: string
  onClose: () => void
  onSubmit: (e: React.FormEvent) => void
}) {
  useEscHandler(open, () => {
    if (saving) return false
    onClose()
    return true
  })

  if (!open || !usuario) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50" onClick={saving ? undefined : onClose} aria-hidden />
      <div
        className="relative z-10 flex max-h-[min(90vh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-surface-border bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="editar-usuario-title"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-surface-border bg-gradient-to-r from-amber-50/60 via-white to-white px-5 py-4">
          <div className="min-w-0">
            <h3 id="editar-usuario-title" className="font-semibold text-slate-900">
              Editar usuario
            </h3>
            <p className="mt-0.5 truncate text-sm text-slate-600">{usuario.nombre}</p>
            <p className="font-mono text-xs text-slate-400">@{usuario.username}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-50"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {error && (
              <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-100">
                {error}
              </div>
            )}
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
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    rol_id: e.target.value,
                    secciones: rolIdEsUsuario(roles, e.target.value) ? editForm.secciones : []
                  })
                }
                required
              >
                <option value="">Seleccionar rol...</option>
                {rolesActivos.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
              </select>
            </div>
            {rolIdEsUsuario(roles, editForm.rol_id) && (
              <SeccionCheckboxes
                compact
                secciones={editForm.secciones}
                onChange={(secciones) => setEditForm({ ...editForm, secciones })}
              />
            )}
            <Input
              label="Nueva contraseña"
              type="password"
              value={editForm.password}
              onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
              placeholder="Dejar vacío para no cambiar"
            />
            <label className="flex items-center gap-3 rounded-xl border border-surface-border bg-white px-4 py-3">
              <input
                type="checkbox"
                checked={editForm.activo}
                onChange={(e) => setEditForm({ ...editForm, activo: e.target.checked })}
                className="h-4 w-4 rounded border-surface-border text-brand-600"
              />
              <span className="text-sm font-medium text-slate-700">Usuario activo</span>
            </label>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2 border-t border-surface-border bg-slate-50/80 px-5 py-4">
            <Button type="submit" className="rounded-xl" disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </Button>
            <Button type="button" variant="secondary" className="rounded-xl" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function UsuariosPage() {
  const { hasPermiso } = useAuth()
  const [usuarios, setUsuarios] = useState<UsuarioListItem[]>([])
  const [roles, setRoles] = useState<Rol[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [editError, setEditError] = useState('')
  const [form, setForm] = useState(emptyCreateForm())
  const [editForm, setEditForm] = useState({
    nombre: '',
    rol_id: '',
    activo: true,
    password: '',
    secciones: [] as SeccionId[]
  })
  const searchRef = useRef<HTMLInputElement>(null)

  const listadoActivo = !showForm && editingId === null

  const usuariosFiltrados = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return usuarios
    return usuarios.filter(
      (u) =>
        u.nombre.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        (u.rol_nombre?.toLowerCase().includes(q) ?? false)
    )
  }, [usuarios, search])

  const defaultRolId = useMemo(() => {
    const preferred =
      roles.find((r) => r.nombre === ROL_DEFAULT) ?? roles.find((r) => r.nombre === ROL_ADMIN)
    return preferred ? String(preferred.id) : roles[0] ? String(roles[0].id) : ''
  }, [roles])

  const rolesActivos = useMemo(
    () => roles.filter((r) => r.nombre === ROL_ADMIN || r.nombre === ROL_USUARIO),
    [roles]
  )

  const editingUsuario = useMemo(
    () => (editingId != null ? usuarios.find((u) => u.id === editingId) ?? null : null),
    [editingId, usuarios]
  )

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
      password: '',
      secciones: (u.secciones ?? []) as SeccionId[]
    })
    setEditError('')
    setError('')
  }

  function cancelarEditar() {
    setEditingId(null)
    setEditForm({ nombre: '', rol_id: '', activo: true, password: '', secciones: [] })
    setEditError('')
  }

  const registroListKb = useRegistroListKeyboard({
    enabled: listadoActivo,
    items: usuariosFiltrados,
    listSearchRef: searchRef,
    canCreate: hasPermiso('usuarios.crear'),
    onCreate: abrirNuevo,
    onOpenDetail: (u) => {
      if (hasPermiso('usuarios.editar')) abrirEditar(u)
    }
  })

  useEscHandler(showForm, () => {
    if (saving) return false
    setShowForm(false)
    return true
  })

  useEffect(() => {
    if (!listadoActivo) return
    const timer = setTimeout(() => focusAndScrollIntoView(searchRef.current), 80)
    return () => clearTimeout(timer)
  }, [listadoActivo])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.rol_id) {
      setError('Seleccioná un rol para el usuario')
      return
    }
    if (rolIdEsUsuario(roles, form.rol_id) && form.secciones.length === 0) {
      setError('Seleccioná al menos una sección para el usuario')
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
          rol_id: Number(form.rol_id),
          secciones: rolIdEsUsuario(roles, form.rol_id) ? form.secciones : []
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
      setEditError('Seleccioná un rol para el usuario')
      return
    }
    if (rolIdEsUsuario(roles, editForm.rol_id) && editForm.secciones.length === 0) {
      setEditError('Seleccioná al menos una sección para el usuario')
      return
    }
    setSaving(true)
    setEditError('')
    try {
      await api(`/api/usuarios/${editingId}`, {
        method: 'PUT',
        body: JSON.stringify({
          nombre: editForm.nombre,
          rol_id: Number(editForm.rol_id),
          activo: editForm.activo,
          secciones: rolIdEsUsuario(roles, editForm.rol_id) ? editForm.secciones : [],
          ...(editForm.password.trim() ? { password: editForm.password } : {})
        })
      })
      cancelarEditar()
      await load()
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Error al guardar')
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
            Administrador tiene acceso total. Usuario accede solo a las secciones que marques abajo.
          </p>
        </div>
        {hasPermiso('usuarios.crear') && listadoActivo && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="hidden rounded-full border border-surface-border bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 shadow-card sm:inline-flex">
              Enter = nuevo usuario
            </span>
            <Button className="rounded-xl px-4" onClick={abrirNuevo}>
              <Plus className="h-4 w-4" />
              Nuevo usuario
            </Button>
          </div>
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
          <ul className="grid gap-2 sm:grid-cols-2">
            {rolesActivos.map((r) => (
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
                  onChange={(e) =>
                    setForm({
                      ...form,
                      rol_id: e.target.value,
                      secciones: rolIdEsUsuario(roles, e.target.value) ? form.secciones : []
                    })
                  }
                  required
                >
                  <option value="">Seleccionar rol...</option>
                  {rolesActivos.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre}
                    </option>
                  ))}
                </select>
                {form.rol_id && (
                  <p className="text-xs text-slate-500">{rolDescripcion(Number(form.rol_id))}</p>
                )}
              </div>
              {rolIdEsUsuario(roles, form.rol_id) && (
                <SeccionCheckboxes
                  secciones={form.secciones}
                  onChange={(secciones) => setForm({ ...form, secciones })}
                />
              )}
              <div className="sm:col-span-2 rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3 text-xs leading-relaxed text-slate-600">
                Ejemplo: un usuario con sección <strong>Retornos</strong> puede cargar y verificar
                retornos. El <strong>Administrador</strong> ve todo, incluida Configuración.
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

        <div className="flex flex-col gap-3 border-b border-surface-border bg-slate-50/80 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Listado</h2>
            <p className="text-xs text-slate-500">
              {loading
                ? 'Cargando usuarios...'
                : search.trim()
                  ? `${usuariosFiltrados.length} de ${usuarios.length} usuario(s)`
                  : `${usuarios.length} usuario(s) registrado(s)`}
            </p>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400" />
            <input
              ref={searchRef}
              type="search"
              placeholder="Buscar por nombre, usuario o rol..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={registroListKb.handleListSearchKeyDown}
              disabled={!listadoActivo}
              className="w-full rounded-xl border border-surface-border bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-100"
            />
          </div>
          {loading && <Loader2 className="hidden h-5 w-5 shrink-0 animate-spin text-brand-600 sm:block" />}
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
          ) : usuariosFiltrados.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <UserCog className="h-7 w-7" />
              </div>
              <p className="mt-4 text-sm font-medium text-slate-700">
                {search.trim() ? 'No hay usuarios con esa búsqueda' : 'No hay usuarios'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {search.trim()
                  ? 'Probá con otro término'
                  : 'Creá el primer usuario con rol asignado'}
              </p>
              {!search.trim() && hasPermiso('usuarios.crear') && (
                <Button className="mt-4 rounded-xl" size="sm" onClick={abrirNuevo}>
                  <Plus className="h-4 w-4" />
                  Nuevo usuario
                </Button>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-surface-border">
              {usuariosFiltrados.map((u, index) => (
                <li
                  key={u.id}
                  {...registroListKb.listItemProps(
                    index,
                    'flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-slate-50/80 sm:flex-row sm:items-center sm:gap-4 sm:px-6'
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold text-slate-900">{u.nombre}</p>
                      {pillActivo(u.activo)}
                    </div>
                    <p className="mt-1 font-mono text-sm text-slate-600">@{u.username}</p>
                    <div className="mt-2">{pillRol(u.rol_nombre)}</div>
                    {u.rol_nombre === ROL_USUARIO && u.secciones.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {u.secciones.map((s) => (
                          <span
                            key={s}
                            className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600"
                          >
                            {SECCION_LABELS[s as SeccionId] ?? s}
                          </span>
                        ))}
                      </div>
                    )}
                    {u.rol_nombre === ROL_USUARIO && u.secciones.length === 0 && (
                      <p className="mt-1 text-xs text-amber-700">Sin secciones asignadas</p>
                    )}
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

      {hasPermiso('usuarios.editar') && (
        <EditarUsuarioModal
          open={editingId !== null}
          usuario={editingUsuario}
          roles={roles}
          rolesActivos={rolesActivos}
          editForm={editForm}
          setEditForm={setEditForm}
          saving={saving}
          error={editError}
          onClose={cancelarEditar}
          onSubmit={handleUpdate}
        />
      )}
    </div>
  )
}
