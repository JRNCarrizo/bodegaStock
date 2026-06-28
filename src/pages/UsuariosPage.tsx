import { useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, UserCog, X } from 'lucide-react'
import { api } from '@/lib/utils'
import type { Rol, UsuarioListItem } from '@/types'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge, Card, CardBody, CardHeader } from '@/components/ui/Card'

const ROL_DEFAULT = 'Supervisor'

function emptyCreateForm(defaultRolId = '') {
  return {
    username: '',
    password: '',
    nombre: '',
    rol_id: defaultRolId
  }
}

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
    const preferred = roles.find((r) => r.nombre === ROL_DEFAULT) ?? roles.find((r) => r.nombre === 'Administrador')
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
    load()
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
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Usuarios</h1>
        <p className="mt-1 text-slate-500">
          Cada usuario necesita un rol — eso define qué secciones ve y qué puede hacer (incluido verificar retornos).
        </p>
      </div>

      <Card>
        <CardHeader
          title="Listado de usuarios"
          description={`${usuarios.length} usuario(s) registrado(s)`}
          action={
            hasPermiso('usuarios.crear') && (
              <Button size="sm" onClick={abrirNuevo}>
                <Plus className="h-4 w-4" />
                Nuevo usuario
              </Button>
            )
          }
        />

        {showForm && hasPermiso('usuarios.crear') && (
          <CardBody className="border-b border-surface-border bg-surface-muted/50">
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
                  className="w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-sm"
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
              <div className="sm:col-span-2 rounded-lg border border-brand-100 bg-brand-50/50 px-3 py-2 text-xs text-slate-600">
                Para probar retornos: cargá con un usuario <strong>Operador</strong> y verificá con{' '}
                <strong>Supervisor</strong> o <strong>Administrador</strong> (usuario distinto).
              </div>
              <div className="flex gap-2 sm:col-span-2">
                <Button type="submit" disabled={saving}>
                  {saving ? 'Guardando...' : 'Guardar usuario'}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                  Cancelar
                </Button>
              </div>
            </form>
          </CardBody>
        )}

        {editingId !== null && hasPermiso('usuarios.editar') && (
          <CardBody className="border-b border-surface-border bg-amber-50/40">
            <form onSubmit={handleUpdate} className="grid gap-4 sm:grid-cols-2">
              <p className="sm:col-span-2 text-sm font-medium text-slate-800">
                Editar usuario #{editingId}
              </p>
              <Input
                label="Nombre completo"
                value={editForm.nombre}
                onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })}
                required
              />
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">Rol *</label>
                <select
                  className="w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-sm"
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
              <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={editForm.activo}
                  onChange={(e) => setEditForm({ ...editForm, activo: e.target.checked })}
                />
                Usuario activo
              </label>
              <div className="flex gap-2 sm:col-span-2">
                <Button type="submit" disabled={saving}>
                  {saving ? 'Guardando...' : 'Guardar cambios'}
                </Button>
                <Button type="button" variant="secondary" onClick={cancelarEditar}>
                  <X className="h-4 w-4" />
                  Cancelar
                </Button>
              </div>
            </form>
          </CardBody>
        )}

        <CardBody className="space-y-4 border-b border-surface-border bg-slate-50/50 px-6 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Roles disponibles</p>
          <ul className="grid gap-2 sm:grid-cols-3">
            {roles.map((r) => (
              <li key={r.id} className="rounded-lg border border-surface-border bg-white px-3 py-2 text-sm">
                <p className="font-medium text-slate-900">{r.nombre}</p>
                <p className="mt-0.5 text-xs text-slate-500">{r.descripcion ?? '—'}</p>
              </li>
            ))}
          </ul>
        </CardBody>

        <CardBody className="p-0">
          {error && (
            <div className="border-b border-red-100 bg-red-50 px-6 py-3 text-sm text-red-700">{error}</div>
          )}
          {loading ? (
            <p className="p-6 text-sm text-slate-500">Cargando...</p>
          ) : usuarios.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <UserCog className="h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">No hay usuarios</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-border bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-6 py-3">Nombre</th>
                    <th className="px-6 py-3">Usuario</th>
                    <th className="px-6 py-3">Rol</th>
                    <th className="px-6 py-3">Estado</th>
                    {hasPermiso('usuarios.editar') && <th className="px-6 py-3" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {usuarios.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/50">
                      <td className="px-6 py-3 font-medium text-slate-900">{u.nombre}</td>
                      <td className="px-6 py-3 text-slate-600">{u.username}</td>
                      <td className="px-6 py-3">
                        {u.rol_nombre ? (
                          <span className="text-slate-700">{u.rol_nombre}</span>
                        ) : (
                          <span className="font-medium text-amber-700">Sin rol — sin permisos</span>
                        )}
                      </td>
                      <td className="px-6 py-3">
                        <Badge variant={u.activo ? 'success' : 'muted'}>
                          {u.activo ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </td>
                      {hasPermiso('usuarios.editar') && (
                        <td className="px-6 py-3 text-right">
                          <Button type="button" variant="ghost" size="sm" onClick={() => abrirEditar(u)}>
                            <Pencil className="h-4 w-4" />
                            Editar
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
