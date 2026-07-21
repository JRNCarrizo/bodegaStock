# BodegaStock — Usuarios y permisos

---

## 1. Objetivo

Controlar quién puede acceder a cada sección del sistema, tanto en la app de escritorio como en el celular. Los permisos se evalúan en el servidor en cada request; la UI solo oculta opciones según permisos del usuario logueado.

---

## 2. Modelo de permisos

### Estructura: `seccion.accion`

Cada permiso es una combinación de sección + acción.

| Sección | Acciones posibles |
|---------|-------------------|
| `productos` | `ver`, `crear`, `editar`, `eliminar` |
| `consulta` | `ver` |
| `ingresos` | `ver`, `crear` |
| `planillas` | `ver`, `crear` |
| `retornos` | `ver`, `crear`, `verificar` |
| `roturas` | `ver`, `crear` |
| `sectores` | `ver`, `crear`, `editar` |
| `movimientos_internos` | `ver`, `crear` |
| `camioneros` | `ver`, `crear`, `editar` |
| `reportes` | `ver`, `exportar` |
| `inventario` | `ver`, `crear_sesion`, `contar`, `supervisar`, `cerrar` |
| `usuarios` | `ver`, `crear`, `editar` |
| `ajustes` | `crear` (ajustes post-inventario) |

---

## 3. Roles predefinidos (plantillas)

Al crear un usuario se asigna un rol. Los permisos del rol se pueden ajustar individualmente si hace falta.

### Administrador
- **Todos** los permisos.
- Gestión de usuarios, sectores, configuración general.

### Supervisor
- Ver y operar en todos los módulos operativos.
- Verificar retornos.
- Crear/cerrar sesiones de inventario.
- Ver y exportar reportes.
- Ajustes post-inventario.
- **No** gestiona usuarios (salvo decisión contraria).

### Operador de bodega
- `consulta.ver`
- `ingresos.ver`, `ingresos.crear`
- `movimientos_internos.ver`, `movimientos_internos.crear`
- `roturas.ver`, `roturas.crear`
- `camioneros.ver`

### Planillero
- `consulta.ver`
- `planillas.ver`, `planillas.crear`
- `camioneros.ver`

### Verificador de retornos
- `consulta.ver`
- `retornos.ver`, `retornos.verificar`
- `camioneros.ver`

### Contador de inventario
- `consulta.ver`
- `inventario.ver`, `inventario.contar`

---

## 4. Reglas de negocio vinculadas a usuarios

| Regla | Descripción |
|-------|-------------|
| **RN-U1** | Usuario inactivo no puede iniciar sesión |
| **RN-U2** | Retornos: `cargado_por` ≠ `verificado_por` — solo aplica si `retornos_doble_verificacion` está **activado** en configuración |
| **RN-U3** | Inventario: contador 1 ≠ contador 2 en el mismo sector |
| **RN-U4** | Solo usuarios con `retornos.verificar` pueden verificar retornos (cuando la doble verificación está on) |
| **RN-U5** | Solo usuarios con `inventario.crear_sesion` pueden crear sesiones de inventario |
| **RN-U6** | Solo usuarios con `inventario.cerrar` pueden cerrar sesiones |
| **RN-U7** | Cambios de permisos aplican en el próximo login (o invalidar token/sesión activa) |
| **RN-U8** | El contador puede importar su sector offline por red; la importación manual del archivo Plan B en la PC requiere `inventario.supervisar` |

### Exportaciones Excel y otros permisos de operación

- Los **exports Excel** de cada módulo usan el permiso `*.ver` de ese módulo (`consulta.ver`, `inventario.ver`, `planillas.ver`, `retornos.ver`, `roturas.ver`, etc.). **No** exigen necesariamente `reportes.exportar`.
- Plantilla e importación masiva de productos: `productos.crear` (`GET /api/productos/plantilla`, import Excel).
- Toggles de configuración (`retornos_doble_verificacion`, `movimientos_doble_verificacion`): **GET** abierto a autenticados; **PUT** solo **administrador**.

---

## 5. Pantallas de gestión de usuarios (PC)

### Listado de usuarios
- Tabla: username, nombre, rol, activo, acciones (editar, desactivar)

### Alta/edición de usuario
- Username (único)
- Nombre
- Contraseña (solo en creación o cambio)
- Rol (selector)
- Activo (checkbox)
- Permisos extra (opcional: override respecto al rol)

### Gestión de roles (solo admin)
- CRUD de roles
- Asignar permisos al rol (checkboxes por sección)

---

## 6. Autenticación

### Escritorio (Electron)
- Login local contra el servidor embebido
- Token JWT o sesión con expiración
- Recordar sesión (opcional)

### Móvil (APK — Capacitor, implementada)
- Misma API de login (app Android en `android/`)
- Token almacenado de forma segura en el dispositivo
- Re-login si token expira o servidor reinicia; login offline para inventario sin red al PC

### Endpoints previstos
```
POST /api/auth/login     → { token, usuario, permisos[] }
POST /api/auth/logout
GET  /api/auth/me        → usuario actual + permisos
```

---

## 7. Auditoría por usuario

Todo movimiento y documento registra `usuario_id`. Reportes pueden filtrar:
- "Planillas cargadas por Juan"
- "Retornos verificados por María"
- "Inventarios supervisados por..."

Campos de auditoría mínimos en documentos:
- `usuario_id` (creador)
- `created_at`
- En retornos: `cargado_por_id`, `verificado_por_id`
- En inventario: contadores asignados por sector
