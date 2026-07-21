# BodegaStock — Especificación del proyecto

> Documento vivo, alineado a la versión implementada **v0.3.9** (Electron + Fastify + SQLite + React + Capacitor Android).

---

## 1. Visión general

**BodegaStock** (nombre comercial **ControlStock**) es un sistema de gestión de inventario para bodega/depósito. Permite controlar productos, stock por sectores, movimientos diarios (ingresos, salidas, retornos, roturas) e inventarios físicos realizados por dos personas en paralelo desde celulares.

### Objetivos principales

- Tener trazabilidad completa de cada cambio de stock.
- Operar en **red local (LAN)** sin depender de internet.
- Permitir trabajo simultáneo desde **PC (administración)** y **celulares (operaciones en bodega)**.
- Soportar **doble verificación configurable** en retornos y movimientos internos (además del inventario dual).
- Generar **reportes y estadísticas** del día y por rangos de fecha.

### Usuarios típicos

| Perfil | Uso principal |
|--------|---------------|
| Administrador/Desktop | Administración, reportes, altas, configuración |
| Operador de bodega | Roturas, movimientos (celular o PC); ingresos en PC |
| Planillero | Carga de planillas con camionero asignado |
| Verificador | Confirma retornos/movimientos cuando la doble verificación está activa |
| Contador | Participa en inventarios desde el celular |
| Supervisor | Cierra inventarios, ve reportes, ajustes |
| Administrador | Usuarios, permisos, sectores, productos |

---

## 2. Arquitectura

```
┌─────────────────────────────────────────────────────────┐
│              PC SERVIDOR (Electron)                      │
│  ┌──────────────────┐    ┌───────────────────────────┐  │
│  │  UI Escritorio   │    │  API REST + WebSockets    │  │
│  │  (admin/reportes)│    │  (Fastify embebido)       │  │
│  └──────────────────┘    └─────────────┬─────────────┘  │
│                                          │                │
│                               ┌──────────▼──────────┐     │
│                               │  Base de datos      │     │
│                               │  SQLite (producción)│     │
│                               │  Postgres opcional  │     │
│                               │  (futuro)           │     │
│                               └─────────────────────┘     │
└───────────────────────────────┬───────────────────────────┘
                                │  Red local (WiFi/LAN)
              ┌─────────────────┼─────────────────┐
              │                 │                 │
        ┌─────▼─────┐     ┌─────▼─────┐     ┌─────▼─────┐
        │ Celular 1 │     │ Celular 2 │     │ Celular N │
        │ web / APK │     │ web / APK │     │ web / APK │
        └───────────┘     └───────────┘     └───────────┘
```

### Principios técnicos

1. **Un solo servidor:** el PC con Electron aloja la base de datos, la API y la **UI web** (puerto `3847`).
2. **Clientes móviles:** se conectan por IP local (ej. `http://192.168.1.50:3847`) — **navegador** y/o **APK** (Capacitor).
3. **Tiempo real:** WebSockets opcionales (inventario y avisos); también REST + polling. Ver [APP-MOVIL.md](APP-MOVIL.md).
4. **Stock por sector:** un producto puede existir en varios sectores con cantidades distintas.
5. **Ledger de movimientos:** casi todo cambio de stock genera un registro auditable; no se edita stock "a mano" salvo ajustes autorizados post-inventario.
6. **Sin internet requerido:** funciona en LAN interna.
7. **Base de datos:** **SQLite** en producción. PostgreSQL queda como opción futura si hiciera falta multi-servidor o mayor concurrencia.

### Conexión móvil

- **Web (siempre):** abrir la URL/QR de Configuración en el navegador del celular (misma WiFi).
- **APK (disponible):** app Android (Capacitor) separada del instalador de PC; misma UI React y misma API; **no reemplaza** la web.
- Login con usuario/contraseña; permisos determinan pantallas visibles.
- Detalle completo: [APP-MOVIL.md](APP-MOVIL.md).
---

## 3. Módulos funcionales

### 3.1 Productos

Alta y gestión del catálogo de productos.

**Campos principales:**
- **Código interno** (identificador propio de la empresa, ej. `PRD-004521`)
- **Código de barras** (escaneo físico)
- Nombre / descripción
- Imagen
- Estado activo/inactivo

> **Importante:** el producto solo describe **qué es**. Cómo está armado el stock (pallet, caja, suelto, 112, 128, etc.) se define **en cada línea** al ingresar mercadería, contar inventario o ver stock — no en el catálogo.

**Identificación — dos códigos:**
| Código | Uso |
|--------|-----|
| Código interno | Búsqueda, reportes, operación diaria |
| Código de barras | Escaneo con cámara o lector |

**Código de barras — tres formas de asignar:**
1. **Escaneo por cámara** — botón en Productos (webcam en PC; cámara del celular en APK)
2. **Carga manual** (teclado)
3. **Generación aleatoria** (código alfanumérico interno)

**Buscador dinámico:** en toda la app se puede buscar por código interno, código de barras o nombre con autocompletado.

**Importación Excel:**
- Plantilla: `GET /api/productos/plantilla`
- Importar: `POST /api/productos/import` (permiso `productos.crear`)
- Omite filas duplicadas (código interno ya existente) y filas incompletas.

**Nota:** el producto no almacena una única cantidad global como fuente de verdad; el stock real está distribuido por sectores y **por líneas de desglose** dentro de cada sector (ver [DESGLOSE-DE-CANTIDADES.md](DESGLOSE-DE-CANTIDADES.md)).

---

### 3.2 Consulta

Búsqueda y visualización de información de stock.

**Modos de consulta:**
- **Por producto** — buscador dinámico y detalle con desglose
- **Por sector** — listado de productos/stock de un sector
- **Ver todos** — catálogo con stock; solo productos con **stock > 0**

**Funcionalidades:**
- Buscar por **código interno**, código de barras, nombre o sector (buscador dinámico)
- Ver stock total del producto
- Ver **desglose por sector** (líneas: pallet × unidades, sueltos — sin fusionar)
- Ver **desglose por ubicación/pila** dentro de cada sector
- Ver historial reciente de movimientos del producto (opcional)
- **Export Excel:** `GET /api/consulta/export/stock-productos`

**Ejemplo de visualización:**
```
Aceite 1L — Depósito A
  3 pallet × 112 cajas     → 336 u
  pucherio                  →  23 u
  2 pallet × 128 cajas     → 256 u
  ─────────────────────────────
  Total sector:               615 u
```

Ver [DESGLOSE-DE-CANTIDADES.md](DESGLOSE-DE-CANTIDADES.md).

**Disponible en:** PC y celular (según permiso `consulta.ver`).

---

### 3.3 Ingresos

Registro de mercadería que ingresa a la bodega, asociada a un remito.

**Campos del documento:**
| Campo | Obligatorio | Descripción |
|-------|-------------|-------------|
| Número de remito | Sí | Identificador del documento de ingreso |
| Observación | No | Notas libres (ej. "cajas en mal estado") |
| Transporte | No | Nombre del transporte o empresa de fletes (ej. "Flete Norte", "Camión propio") |
| Camionero | No | Si corresponde, camionero de la lista |
| Sector destino | Sí | Dónde se deposita la mercadería |
| Ítems | Sí | Producto + **líneas de desglose** (ej. 3 pallet × 112) + total |

**Efecto:** suma stock en el sector destino, creando o actualizando **líneas de desglose** (no solo un número total). Genera movimientos tipo `INGRESO`.

**Usuario:** quien carga queda registrado (`usuario_id`).

**Export Excel:** `GET /api/ingresos/:id/export`
- Hoja **Productos:** Código interno, Nombre, Descripción, Cantidad + fila **TOTAL**
- Hoja **Resumen:** sin sector ni usuario creador (fecha, remito, observación, total)

---

### 3.4 Carga de planillas

Registro de pedidos/planillas que **descuentan** stock (salida de mercadería).

**Campos del documento:**
| Campo | Obligatorio | Descripción |
|-------|-------------|-------------|
| Número/referencia de planilla | Sí | Identificador interno |
| Camionero | Sí* | Camionero asignado (* según regla de negocio) |
| Sector origen | — | El sistema elige origen según sectores de descuento configurados |
| Ítems | Sí | Producto + cantidad |

**Efecto:** descuenta stock aplicando la [regla de sectores de descuento](DESGLOSE-DE-CANTIDADES.md#8-regla-de-descuento-planillas-roturas-y-pérdidas). Genera movimientos tipo `PLANILLA`.

**Export Excel:** `GET /api/planillas/:id/export`
- Hoja **Productos:** Código interno, Nombre, Descripción, Cantidad + fila **TOTAL**
- Hoja **Resumen:** sin sector ni usuario creador

**Posible extensión futura:** importación desde Excel/CSV.

---

### 3.5 Gestión de retornos

Productos que vuelven o se recuperan. La **doble verificación** es **configurable** (`retornos_doble_verificacion` en Configuración).

**Si la doble verificación está desactivada:**
- Al crear el retorno queda como `ingreso_directo`
- El stock se suma en el momento de la creación (sin paso de verificación)

**Si la doble verificación está activada:**

```
Operador A carga retorno  →  estado: PENDIENTE_VERIFICACION
Supervisor B verifica     →  estado: VERIFICADO → suma stock
                         o  estado: RECHAZADO → no suma stock
```

**Campos del documento:**
| Campo | Obligatorio | Descripción |
|-------|-------------|-------------|
| Camionero | Sí | Camionero que trae la devolución |
| Planilla origen | No | Vincular a planilla original (muy recomendado) |
| Sector destino | Sí | Dónde se reintegra |
| Ítems | Sí | Producto + cantidad |
| Cargado por | Auto | Usuario que registró |
| Verificado por | Auto | Usuario que confirmó (debe ser distinto; solo si hay doble verificación) |

**Regla (solo con doble verificación activa):** el mismo usuario **no puede** cargar y verificar el mismo retorno.

**Efecto:** suma stock al verificar (o al crear si es ingreso directo). Genera movimientos tipo `RETORNO`.

**Export Excel:** `GET /api/retornos/:id/export`

---

### 3.6 Roturas y pérdidas

Productos dañados, rotos, perdidos o en mal estado durante el trabajo.

**Campos:**
- Producto + cantidad
- Sector origen
- Motivo/tipo (roto, perdido, mal estado)
- Observación (opcional)

**Efecto:** descuenta stock aplicando la [regla de sectores de descuento](DESGLOSE-DE-CANTIDADES.md#8-regla-de-descuento-planillas-roturas-y-pérdidas). Genera movimientos tipo `ROTURA` o `PERDIDA`.

**Export Excel del día:** `GET /api/roturas/export-dia?fecha=` — incluye columna **Observación**.

---

### 3.7 Gestión de sectores

Organización física/lógica de la bodega.

**Funcionalidades:**
- Crear, editar y desactivar sectores
- Nombre, código, descripción
- Ver stock actual por sector (con desglose de líneas)
- **Marcar sectores de descuento** y su prioridad (ver abajo)

**Regla clave:** el **mismo producto puede estar en varios sectores** con cantidades independientes.

**Sectores de descuento:**

En la configuración de cada sector se puede indicar:
- Si es **sector de descuento** (origen preferido al descontar stock)
- **Prioridad de descuento** (orden entre los marcados)

Usado en planillas, roturas y pérdidas. Si no alcanza el stock en esos sectores, el sistema descuenta del resto empezando por los sectores con **menor cantidad** de ese producto.

Ver regla completa: [DESGLOSE-DE-CANTIDADES.md §8](DESGLOSE-DE-CANTIDADES.md#8-regla-de-descuento-planillas-roturas-y-pérdidas)

Ejemplo:
```
Producto "Tornillo M8"
  → Sector "Depósito A": 500 u  (sector descuento, prioridad 1)
  → Sector "Camión 3":    50 u  (sector descuento, prioridad 2)
  → Sector "Reserva":    300 u  (no marcado — solo fallback)
  → Total sistema:       850 u
```

---

### 3.8 Movimientos entre sectores

Transferencia de productos de un sector a otro.

La **doble verificación** es **configurable** (`movimientos_doble_verificacion`), con el mismo patrón que retornos:

- **Desactivada:** el movimiento se completa como `ingreso_directo` y aplica stock al crear.
- **Activada:** un usuario carga y otro distinto confirma (carga ≠ verificación) antes de completar.

**Campos:**
- Producto + cantidad
- Sector origen
- Sector destino
- Observación (opcional)

**Efecto:** descuenta origen, suma destino. Genera movimiento tipo `MOVIMIENTO_INTERNO`.

---

### 3.9 Gestión de camioneros

Catálogo de camioneros/transportistas internos.

**Campos:**
- Nombre completo
- Código interno (opcional)
- Teléfono/contacto (opcional)
- Activo/inactivo
- Observaciones

**Uso:**
- **Obligatorio/requerido** en carga de planillas y retornos
- **Opcional** en ingresos
- Filtrable en reportes ("planillas por camionero", etc.)

---

### 3.10 Movimientos del día / Reportes

Estadísticas y reportes basados en el ledger de movimientos.

**Vista del día (por defecto):**
| Concepto | Descripción |
|----------|-------------|
| Stock inicial | Stock al inicio del período |
| Ingresos | Total sumado por ingresos |
| Planillas | Total descontado por planillas |
| Retornos | Total sumado por retornos verificados / ingreso directo |
| Roturas/pérdidas | Total descontado |
| Movimientos internos | Transferencias entre sectores |
| Stock final | Stock al cierre del período |

**Filtros:**
- Rango de fechas (de fecha a fecha)
- Por sector
- Por producto
- Por camionero
- Por usuario
- Por tipo de movimiento

**Exportación:**
- **Excel:** disponible por módulo (productos/consulta, ingresos, planillas, retornos, roturas del día, inventario de sesión, etc.).
- **PDF:** futuro.

---

### 3.11 Inventario (módulo principal)

Conteo físico realizado por **dos personas** desde celulares (**navegador web** y **APK** — canales en **paralelo**; ver [APP-MOVIL.md](APP-MOVIL.md)). Cada uno registra **líneas independientes** con desglose (pallet × unidades, sueltos). Ver documentos:

- [INVENTARIO.md](INVENTARIO.md) — flujo completo (online + offline)
- [INVENTARIO-OFFLINE-ESTADO.md](INVENTARIO-OFFLINE-ESTADO.md) — estado del modo offline / P2P
- [DESGLOSE-DE-CANTIDADES.md](DESGLOSE-DE-CANTIDADES.md) — formato de cantidades

**Resumen:**
1. Sesión con sectores (todos o parcial) y dos contadores por sector.
2. Al iniciar: snapshot del stock + bloqueo global de movimientos.
3. **Modo elegible por sector:** **con red** (celulares → PC) u **offline** (bajar catálogo en oficina → contar en depósito → sync P2P entre celulares al final → import al PC). El import principal es por red y sector por sector; existe archivo final validado como Plan B. Documentado en [INVENTARIO.md](INVENTARIO.md) y [INVENTARIO-OFFLINE-ESTADO.md](INVENTARIO-OFFLINE-ESTADO.md).
4. Buscador dinámico o escaneo; líneas independientes (no se fusionan).
5. Comparación A: contador vs contador al finalizar cada sector (en PC si online; entre celulares si offline); reconteo con referencia del desglose anterior.
6. Comparación B: total contado vs sistema al cerrar (siempre en PC); detecta cantidad y reorganización entre sectores.
7. Supervisor confirma → `stock_lineas` se alinea con lo contado + reporte antes/después.

**Export Excel de sesión:** `GET /api/inventario/sesiones/:id/export` — agregado **por producto** (sin sector ni desglose por líneas).

**UX y robustez:**
- Listado móvil con actualización automática/al recuperar foco y botón manual.
- Panel de cantidades adaptado al teclado; tipografía y áreas táctiles ampliadas.
- “Seguir editando” antes del sync y alta directa de líneas en cero durante reconteo.
- Hotspot con actualización automática/manual de IP y QR.
- La PC muestra “Recibiendo conteo…” durante el import; un sector importado no puede reabrirse.
- Plan B: celular genera paquete JSON final con checksum; supervisor lo importa manualmente en la fila del sector.

---

### 3.12 Gestión de usuarios y configuración

Administración de cuentas y permisos. Ver documento: [USUARIOS-Y-PERMISOS.md](USUARIOS-Y-PERMISOS.md).

**Configuración (admin):**
- Toggles de **doble verificación** para retornos (`retornos_doble_verificacion`) y movimientos internos (`movimientos_doble_verificacion`).
- Red/LAN, URL y QR de conexión móvil, actualizaciones.

**Pie de copyright:** visible en **Inicio** y **Configuración** (`© ControlStock` / contacto del desarrollador).

---

## 4. Reglas de negocio globales

| # | Regla |
|---|-------|
| R1 | Todo cambio de stock debe quedar registrado como movimiento auditable |
| R2 | Cada movimiento registra: usuario, fecha/hora, tipo, producto, cantidad, sector(es) |
| R3 | Un producto puede tener stock en múltiples sectores simultáneamente |
| R4 | Retornos: quien carga ≠ quien verifica **solo cuando la doble verificación de retornos está activa** |
| R5 | Inventario: dos contadores distintos por sector; vistas independientes; comparación A al finalizar ambos (PC online o sync entre celulares offline); reconteo solo con diferencia; comparación B vs sistema al cerrar; reorganización del depósito; modo con red u offline elegible |
| R6 | Planillas y retornos deben asociar camionero |
| R7 | Ingresos deben registrar número de remito |
| R8 | Permisos por sección determinan acceso a cada módulo |
| R9 | Stock no puede quedar negativo (validar al confirmar movimiento) |
| R10 | Usuarios inactivos no pueden iniciar sesión |
| R11 | Stock y conteos se visualizan con desglose (pallet × unidades + sueltos), no solo total |
| R12 | Descuentos (planillas, roturas): primero sectores marcados por prioridad; si no alcanza, sectores con menor stock del producto |
| R13 | Inventario en `EN_PROGRESO`: bloqueo global de movimientos hasta cierre o cancelación |

---

## 5. Plataformas por módulo

| Módulo | PC (Electron) | Celular (web / APK) |
|--------|:-------------:|:-------------:|
| Productos (alta/edición) | ✓ | Consulta/escaneo |
| Consulta | ✓ | ✓ |
| Ingresos | ✓ | — (v1; solo PC, ver [APP-MOVIL.md](APP-MOVIL.md)) |
| Carga planillas | ✓ | ✓ |
| Retornos (cargar) | ✓ | ✓ |
| Retornos (verificar) | ✓ | ✓ |
| Roturas y pérdidas | ✓ | ✓ |
| Sectores | ✓ | — |
| Movimientos internos | ✓ | ✓ |
| Camioneros | ✓ | Selector |
| Reportes | ✓ | Limitado |
| Inventario (conteo) | Supervisión | ✓ |
| Usuarios/permisos | ✓ | — |

---

## 6. Fases de desarrollo

Estado respecto a **v0.3.9**:

### Fase 1 — Base
- [x] Proyecto Electron + servidor embebido (Fastify)
- [x] Base de datos inicial (SQLite)
- [x] Usuarios, login, permisos
- [x] Productos (CRUD + código de barras + imagen + import Excel)
- [x] Sectores
- [x] Consulta de stock (Por producto / Por sector / Ver todos)

### Fase 2 — Movimientos core
- [x] Camioneros
- [x] Ingresos (remito, transporte, observación)
- [x] Carga de planillas
- [x] Roturas y pérdidas
- [x] Movimientos entre sectores
- [x] Ledger de movimientos

### Fase 3 — Retornos
- [x] Flujo carga + verificación dual (configurable)
- [x] Regla mismo usuario no puede verificar lo propio (si doble verificación activa)
- [x] Ingreso directo cuando la doble verificación está desactivada

### Fase 4 — Reportes
- [x] Movimientos del día
- [x] Filtros por fecha, sector, camionero, etc.

### Fase 5 — App móvil (APK)

Ver [APP-MOVIL.md](APP-MOVIL.md).

- [x] Login + permisos + conexión LAN (IP / QR)
- [x] Escaneo de código de barras (cámara)
- [x] **Consulta** de stock con desglose
- [x] ~~**Ingresos** desde bodega~~ → solo PC (remito; ver APP-MOVIL.md)
- [x] **Retornos** (cargar + verificar / ingreso directo)
- [x] **Roturas** y pérdidas
- [x] Carga de planillas / movimientos internos
- [x] **APK Android** (Capacitor)
- [x] **Inventario dual** (prioridad móvil; online + offline)

### Fase 6 — Inventario dual
- [x] Sesiones de inventario
- [x] Comunicación en tiempo real / polling
- [x] Comparación y reconteo
- [x] Cierre y reporte de diferencias
- [x] Modo offline P2P + import al PC
- [x] Import offline con estado de recepción en PC + archivo final validado como Plan B

### Fase 7 — Pulido
- [x] Export Excel por módulo (consulta, ingresos, planillas, retornos, roturas día, inventario sesión, plantilla/import productos)
- [ ] Export PDF
- [ ] Import planillas (Excel/CSV)
- [ ] Backup automático
- [x] QR para conexión móvil
- [x] Toggles de doble verificación (retornos / movimientos) en Configuración

---

## 7. Decisiones pendientes / resueltas

Items a definir o ya definidos:

- [ ] ¿Planilla requiere camionero obligatorio siempre o solo recomendado?
- [ ] ¿Número de remito único global o por proveedor/fecha?
- [ ] ¿Importación de planillas desde Excel en v1 o fase posterior?
- [x] APK: **Capacitor** (React), no Flutter ni React Native
- [x] Base de datos: **SQLite** en producción; PostgreSQL opcional a futuro
- [x] Importación Excel de productos: plantilla + import (omite duplicados)
- [x] Detalle completo del flujo de inventario (ver [INVENTARIO.md](INVENTARIO.md)) — *definido e implementado (online + offline)*
- [x] Ajustes de stock post-inventario: híbrido con confirmación del supervisor; reorganización entre sectores
- [x] Estrategia de descuento: sectores marcados + fallback por menor stock ([DESGLOSE-DE-CANTIDADES.md](DESGLOSE-DE-CANTIDADES.md))
- [x] Reconteo: mostrar desglose anterior del producto con diferencia ([INVENTARIO.md](INVENTARIO.md))

---

## 8. Glosario

| Término | Significado |
|---------|-------------|
| **Sector** | Ubicación física o lógica dentro de la bodega (estantería, depósito, camión) |
| **Planilla** | Documento de pedido/salida que descuenta stock |
| **Remito** | Documento de ingreso de mercadería |
| **Retorno** | Devolución de productos al stock (tras verificación, o ingreso directo si la doble verificación está off) |
| **Ingreso directo** | Retorno o movimiento que aplica stock al crear, sin segundo verificador |
| **Ledger** | Registro histórico de todos los movimientos de stock |
| **Sesión de inventario** | Proceso de conteo físico con dos personas por sector |
| **Sector de descuento** | Sector marcado como origen preferido al descontar stock (planillas, roturas) |
| **Pucherio** | Cantidad suelta de unidades (no formando pallet/caja completa) |
