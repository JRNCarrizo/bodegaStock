# BodegaStock — Especificación del proyecto

> Documento vivo, alineado a la versión implementada **v0.3.45** (Electron + Fastify + SQLite + React + Capacitor Android).  
> Panorama global: [ESTADO-ACTUAL.md](ESTADO-ACTUAL.md)

---

## 1. Visión general

**BodegaStock** (nombre comercial **ControlStock**) es un sistema de gestión de inventario para bodega/depósito. Permite controlar productos, stock por sectores, movimientos diarios (ingresos, salidas, retornos, roturas) e inventarios físicos desde celulares (verificación **Simple** o **Doble** por sector).

### Objetivos principales

- Tener trazabilidad completa de cada cambio de stock.
- Operar en **red local (LAN)** sin depender de internet (despliegue actual en planta).
- Opcionalmente conectar a **servidor en la nube** (Railway + Postgres) — implementado, no en uso productivo aún.
- Permitir trabajo simultáneo desde **PC (administración)** y **celulares (operaciones en bodega)**.
- Soportar **doble verificación configurable** en retornos y movimientos internos; en inventario, **Simple (1 contador)** o **Doble (2 contadores)** por sector.
- Soportar **dos logísticas** (Esmeralda / NAKBE) en la misma instalación, con stock y documentos aislados.
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
│     MODO LOCAL (producción actual en planta)            │
│              PC SERVIDOR (Electron)                      │
│  ┌──────────────────┐    ┌───────────────────────────┐  │
│  │  UI Escritorio   │    │  API REST (Fastify :3847) │  │
│  └──────────────────┘    └─────────────┬─────────────┘  │
│                               ┌──────────▼──────────┐     │
│                               │  SQLite (PC)        │     │
│                               └─────────────────────┘     │
└───────────────────────────────┬───────────────────────────┘
                                │  LAN / WiFi
              ┌─────────────────┼─────────────────┐
        ┌─────▼─────┐     ┌─────▼─────┐     ┌─────▼─────┐
        │ Celular   │     │ Celular   │     │ Celular N │
        │ web / APK │     │ web / APK │     │ web / APK │
        └───────────┘     └───────────┘     └───────────┘

┌─────────────────────────────────────────────────────────┐
│     MODO NUBE (implementado; activación futura)         │
│  PC / APK ──HTTPS──► Railway (Fastify + Postgres)       │
│  Migrador SQLite→PG en Configuración (admin)            │
└─────────────────────────────────────────────────────────┘
```

### Principios técnicos

1. **Un solo servidor:** el PC con Electron aloja la base de datos, la API y la **UI web** (puerto `3847`).
2. **Clientes móviles:** se conectan por IP local (ej. `http://192.168.1.50:3847`) — **navegador** y/o **APK** (Capacitor).
3. **Tiempo real:** WebSockets opcionales (inventario y avisos); también REST + polling. Ver [APP-MOVIL.md](APP-MOVIL.md).
4. **Stock por sector:** un producto puede existir en varios sectores con cantidades distintas.
5. **Ledger de movimientos:** casi todo cambio de stock genera un registro auditable; no se edita stock "a mano" salvo ajustes autorizados post-inventario.
6. **Sin internet requerido:** funciona en LAN interna.
7. **Base de datos:** **SQLite** en el PC servidor (producción actual). **PostgreSQL** disponible vía `DATABASE_URL` para despliegue Railway (modo nube).

### Conexión móvil

- **Modo local (en uso):** IP del PC + puerto `3847` (web o APK).
- **Modo nube (preparado):** URL `https://….railway.app` en Configuración / login APK.
- **Web:** abrir URL/QR en el navegador del celular (misma WiFi en local).
- **APK:** app Android (Capacitor); misma UI y API; inventario offline + sync P2P.
- Login con usuario/contraseña; permisos determinan pantallas visibles.
- Detalle: [APP-MOVIL.md](APP-MOVIL.md) · [ESTADO-ACTUAL.md](ESTADO-ACTUAL.md)
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

**Listado administrativo:** paginado en bloques de 50 productos; código interno destacado y estado activo/inactivo junto a la acción de edición.

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
- **Ver todos** utiliza paginación de 50 productos para mantener fluidez con catálogos grandes.

**Funcionalidades:**
- Buscar por **código interno**, código de barras, nombre o sector (buscador dinámico)
- Ver stock total del producto
- Ver **desglose por sector** (líneas: pallet × unidades, sueltos — sin fusionar)
- Ver **desglose por ubicación/pila** dentro de cada sector
- Ver historial reciente de movimientos del producto (opcional)
- **Export Excel:** `GET /api/consulta/export/stock-productos` (código, nombre y cantidad; `incluir_cero=1` para incluir stock 0)

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

**Flujo actual de carga:** formulario en 2 pasos (datos del documento → líneas producto/cantidad CAJA o BOTELLA) → vista previa de descuento → confirmar. Escáner de barras existe en otros módulos pero **aún no** en Planillas.

**Extensiones futuras (no implementadas):**

| Idea | Doc / notas |
|------|-------------|
| **Foto/OCR de planilla impresa** (“Informe de Planillas de Carga A Despachar”) → borrador de líneas por código + cantidad | [PLANILLAS-OCR-FUTURO.md](PLANILLAS-OCR-FUTURO.md) |
| Import Excel/CSV | Alternativa si administración exporta archivo |
| Escáner de barras en pantalla Planillas | Mejora rápida de carga manual, sin OCR |

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

**UX (v0.3.44–0.3.45):** al elegir producto, el sector por defecto es el de **menor stock** (entre sectores con cantidad > 0). En la carga, cantidad y total se muestran **sin** la palabra “cajas”.

**Export Excel del día:** `GET /api/roturas/export-dia?fecha=` — incluye columna **Observación**.

---

### 3.6b Agenda de turnos (v0.3.42+)

Registro de turnos de insumos (fecha, producto, cantidad opcional, estado). Confirmación desde PC o APK. Contador de pendientes en el menú lateral. Permisos: `agenda_turnos.ver` / `.crear` / `.editar`.

---

### 3.6c Multi-logística (v0.3.39+)

Dos contextos operativos (**Esmeralda**, **NAKBE**) en una sola base. Sectores, camioneros, stock, documentos e inventarios aislados; catálogo de productos compartido. Ver [MULTI-LOGISTICA.md](MULTI-LOGISTICA.md).

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

**Comportamiento actual (implementado):**

- **Lista abierta compartida** (`tipo=LISTA`, `estado=ABIERTA`): historial de cerrados + botón crear/continuar; origen/destino arriba del buscador; buscador filtrado por stock del origen; tilde (`verificada`) obligatoria por línea; **Finalizar** aplica stock (−origen / +destino) y deja `COMPLETADO`. Detalle: [MOVIMIENTOS-LISTA-ABIERTA-FUTURO.md](MOVIMIENTOS-LISTA-ABIERTA-FUTURO.md).
- Ledger `MOVIMIENTO_INTERNO` al finalizar.
- Mientras hay inventario `EN_PROGRESO`, no se crean/finalizan movimientos.
- El setting `movimientos_doble_verificacion` y el flujo Enviar/Recibir + `PENDIENTE` quedan solo por compatibilidad con registros legados.

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

Conteo físico desde celulares (**navegador web** y **APK** — canales en **paralelo**; ver [APP-MOVIL.md](APP-MOVIL.md)). Por sector se elige **verificación Simple o Doble** y **conectividad Online u Offline**. Líneas independientes con desglose (pallet × unidades, sueltos). Ver:

- [INVENTARIO.md](INVENTARIO.md) — flujo completo
- [INVENTARIO-OFFLINE-ESTADO.md](INVENTARIO-OFFLINE-ESTADO.md) — modo offline / P2P
- [DESGLOSE-DE-CANTIDADES.md](DESGLOSE-DE-CANTIDADES.md) — formato de cantidades

**Resumen:**
1. Sesión con sectores (todos o parcial). Por sector: **Doble** (2 contadores, default) o **Simple** (1 contador); y **Offline** (default) u **Online**.
2. Al iniciar: snapshot del stock + bloqueo global de movimientos.
3. **Doble + Offline:** bajar paquete → contar → sync P2P (puerto **3850**) → Comparación A → import PC. **Doble + Online:** Comparación A en el servidor. **Simple:** un contador cuenta → finaliza/importa → sector `CERRADO_OK` **sin** Comparación A ni P2P; sigue Comparación B vs sistema en PC.
4. Buscador dinámico o escaneo; líneas independientes. Ubicaciones obligatorias si el sector las tiene.
5. Comparación B (siempre en PC tras sectores OK): contado vs sistema; ajustes / reorganización.
6. Supervisor confirma → `stock_lineas` alineado + reporte.

**Export Excel de sesión:** diferencias (`…/export`) y stock final (`…/export-stock`) tras el cierre; export por sectores con botellas cuando aplica.

**UX y robustez (implementado):**
- Layout sticky en conteo (header/totales fijos).
- Cuentas rápidas en cantidades; botellas/caja recordadas/sincronizadas con el producto/stock.
- Sync P2P: IP/QR autorrefrescable; en carga manual **solo se edita la IP**, puerto fijo **3850**.
- “Seguir editando” antes del sync; reconteo con líneas en cero.
- PC: “Recibiendo conteo…”; Plan B archivo JSON con checksum.
- Badges Simple/Doble/Offline en supervisión.

---

### 3.12 Gestión de usuarios y configuración

Administración de cuentas y permisos. Ver documento: [USUARIOS-Y-PERMISOS.md](USUARIOS-Y-PERMISOS.md).

**Configuración (admin):**
- Toggles de **doble verificación** para retornos (`retornos_doble_verificacion`) y movimientos internos (`movimientos_doble_verificacion`).
- Red/LAN, URL y QR de conexión móvil, actualizaciones (Windows + Descargar APK).
- En **APK** no se muestran Red ni Verificación de documentos (v0.3.44); sidebar opaca.

**Pie de copyright:** visible en **Inicio** y **Configuración** (`© ControlStock` / contacto del desarrollador).

---

## 4. Reglas de negocio globales

| # | Regla |
|---|-------|
| R1 | Todo cambio de stock debe quedar registrado como movimiento auditable |
| R2 | Cada movimiento registra: usuario, fecha/hora, tipo, producto, cantidad, sector(es) |
| R3 | Un producto puede tener stock en múltiples sectores simultáneamente |
| R4 | Retornos: quien carga ≠ quien verifica **solo cuando la doble verificación de retornos está activa** |
| R5 | Inventario: por sector, verificación **DOBLE** (2 contadores, Comparación A + reconteo) o **SIMPLE** (1 contador, sin Comparación A); conectividad ONLINE u OFFLINE; Comparación B vs sistema al cerrar; reorganización del depósito |
| R6 | Planillas y retornos deben asociar camionero |
| R7 | Ingresos deben registrar número de remito |
| R8 | Permisos por sección determinan acceso a cada módulo |
| R9 | Stock no puede quedar negativo (validar al confirmar movimiento) |
| R10 | Usuarios inactivos no pueden iniciar sesión |
| R11 | Stock y conteos se visualizan con desglose (pallet × unidades + sueltos), no solo total |
| R12 | Descuentos (planillas, roturas): primero sectores marcados por prioridad; si no alcanza, sectores con menor stock del producto |
| R13 | Inventario en `EN_PROGRESO`: bloqueo global de movimientos hasta cierre o cancelación |
| R14 | Operaciones de stock/documentos respetan la **logística activa** (Esmeralda / NAKBE); no cruzar datos entre logísticas |

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
| Agenda de turnos | ✓ | ✓ |
| Usuarios/permisos | ✓ | — |

---

## 6. Fases de desarrollo

Estado respecto a **v0.3.45**:

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

### Fase 6 — Inventario
- [x] Sesiones de inventario
- [x] Comunicación en tiempo real / polling
- [x] Comparación A + reconteo (modo Doble)
- [x] Cierre y reporte de diferencias
- [x] Modo offline P2P + import al PC
- [x] Import offline con estado de recepción en PC + archivo final Plan B
- [x] Verificación **Simple / Doble** por sector (v0.3.28+)
- [x] Sync manual: IP editable, puerto fijo 3850 (v0.3.30)

### Fase 7 — Pulido / futuro
- [x] Export Excel por módulo (consulta, ingresos, planillas, retornos, roturas día, inventario sesión, plantilla/import productos)
- [ ] Export PDF
- [ ] Import planillas Excel/CSV
- [ ] **OCR / foto de planilla impresa** → borrador de líneas ([PLANILLAS-OCR-FUTURO.md](PLANILLAS-OCR-FUTURO.md))
- [ ] Escáner de barras en pantalla Planillas
- [x] **Movimientos: lista abierta** (origen/destino + buscador, tilde, finalizar) — [MOVIMIENTOS-LISTA-ABIERTA-FUTURO.md](MOVIMIENTOS-LISTA-ABIERTA-FUTURO.md) — **implementado v0.3.30**
- [x] Guías de ayuda por sección (`?`) + PDF — v0.3.36
- [x] Modo conexión local vs nube (Configuración + APK) — v0.3.32+
- [x] Migrador SQLite → Postgres — v0.3.32
- [x] Multi-logística Esmeralda / NAKBE — v0.3.39+
- [x] Agenda de turnos — v0.3.42+
- [x] Update APK in-app + Descargar APK desde PC — v0.3.42+
- [ ] Backup automático
- [x] QR para conexión móvil
- [x] Toggles de doble verificación (retornos / movimientos) en Configuración
- [ ] Firma de código Windows (evitar falsos positivos de Defender al actualizar)

---

## 7. Decisiones pendientes / resueltas

Items a definir o ya definidos:

- [ ] ¿Planilla requiere camionero obligatorio siempre o solo recomendado?
- [ ] ¿Número de remito único global o por proveedor/fecha?
- [ ] ¿Importación / OCR de planillas: cuándo priorizar? (doc: [PLANILLAS-OCR-FUTURO.md](PLANILLAS-OCR-FUTURO.md))
- [x] Movimientos lista abierta — implementado v0.3.30+ ([MOVIMIENTOS-LISTA-ABIERTA-FUTURO.md](MOVIMIENTOS-LISTA-ABIERTA-FUTURO.md))
- [x] Multi-logística Esmeralda / NAKBE — implementado v0.3.39+ ([MULTI-LOGISTICA.md](MULTI-LOGISTICA.md))
- [x] APK: **Capacitor** (React), no Flutter ni React Native
- [x] Base de datos: **SQLite** en producción local; **PostgreSQL** en modo nube Railway
- [x] Importación Excel de productos: plantilla propia o formato logístico con encabezados previos (`Código de producto` + `Descripción`); omite duplicados
- [x] Inventario online + offline + Simple/Doble (ver [INVENTARIO.md](INVENTARIO.md))
- [x] Ajustes de stock post-inventario: híbrido con confirmación del supervisor; reorganización entre sectores
- [x] Estrategia de descuento: sectores marcados + fallback por menor stock ([DESGLOSE-DE-CANTIDADES.md](DESGLOSE-DE-CANTIDADES.md))
- [x] Agenda de turnos — v0.3.42+
- [x] Updates APK in-app + Descargar APK desde PC — v0.3.42+
- [x] Reconteo: mostrar desglose anterior del producto con diferencia ([INVENTARIO.md](INVENTARIO.md))
- [x] Sectores chicos / poco movidos: verificación **Simple** (1 contador) sin Comparación A

---

## 8. Glosario

| Término | Significado |
|---------|-------------|
| **Sector** | Ubicación física o lógica dentro de la bodega (estantería, depósito, camión) |
| **Planilla** | Documento de pedido/salida que descuenta stock |
| **Verificación Simple** | Inventario de sector con 1 contador; sin sync entre pares; Comparación B vs sistema en PC |
| **Verificación Doble** | Inventario de sector con 2 contadores; Comparación A + reconteo; luego Comparación B |
| **Remito** | Documento de ingreso de mercadería |
| **Retorno** | Devolución de productos al stock (tras verificación, o ingreso directo si la doble verificación está off) |
| **Ingreso directo** | Retorno o movimiento que aplica stock al crear, sin segundo verificador |
| **Ledger** | Registro histórico de todos los movimientos de stock |
| **Sesión de inventario** | Proceso de conteo físico con dos personas por sector |
| **Sector de descuento** | Sector marcado como origen preferido al descontar stock (planillas, roturas) |
| **Pucherio** | Cantidad suelta de unidades (no formando pallet/caja completa) |
