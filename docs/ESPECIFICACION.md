# BodegaStock — Especificación del proyecto

> Documento vivo. Se irá refinando antes de iniciar el desarrollo.

---

## 1. Visión general

**BodegaStock** es un sistema de gestión de inventario para bodega/depósito. Permite controlar productos, stock por sectores, movimientos diarios (ingresos, salidas, retornos, roturas) e inventarios físicos realizados por dos personas en paralelo desde celulares.

### Objetivos principales

- Tener trazabilidad completa de cada cambio de stock.
- Operar en **red local (LAN)** sin depender de internet.
- Permitir trabajo simultáneo desde **PC (administración)** y **celulares (operaciones en bodega)**.
- Soportar **doble verificación** en procesos críticos (retornos e inventario).
- Generar **reportes y estadísticas** del día y por rangos de fecha.

### Usuarios típicos

| Perfil | Uso principal |
|--------|---------------|
| Administrador/Desktop | Administración, reportes, altas, configuración |
| Operador de bodega | Roturas, movimientos (celular o PC); ingresos en PC |
| Planillero | Carga de planillas con camionero asignado |
| Verificador | Confirma retornos cargados por otro usuario |
| Contador | Participa en inventarios desde el celular |
| Supervisor | Cierra inventarios, ve reportes, ajustes |
| Administrador | Usuarios, permisos, sectores, productos |

---

## 2. Arquitectura propuesta

```
┌─────────────────────────────────────────────────────────┐
│              PC SERVIDOR (Electron)                      │
│  ┌──────────────────┐    ┌───────────────────────────┐  │
│  │  UI Escritorio   │    │  API REST + WebSockets    │  │
│  │  (admin/reportes)│    │  (Node.js embebido)       │  │
│  └──────────────────┘    └─────────────┬─────────────┘  │
│                                          │                │
│                               ┌──────────▼──────────┐     │
│                               │  Base de datos      │     │
│                               │  (SQLite / Postgres)│     │
│                               └─────────────────────┘     │
└───────────────────────────────┬───────────────────────────┘
                                │  Red local (WiFi/LAN)
              ┌─────────────────┼─────────────────┐
              │                 │                 │
        ┌─────▼─────┐     ┌─────▼─────┐     ┌─────▼─────┐
        │ Celular 1 │     │ Celular 2 │     │ Celular N │
        │  (APK)    │     │  (APK)    │     │  (APK)    │
        └───────────┘     └───────────┘     └───────────┘
```

### Principios técnicos

1. **Un solo servidor:** el PC con Electron aloja la base de datos y la API.
2. **Clientes móviles:** se conectan por IP local (ej. `http://192.168.1.50:3847`).
3. **Tiempo real:** WebSockets opcionales (inventario y avisos); v1 puede usar REST + polling. Ver [APP-MOVIL.md](APP-MOVIL.md).
4. **Stock por sector:** un producto puede existir en varios sectores con cantidades distintas.
5. **Ledger de movimientos:** casi todo cambio de stock genera un registro auditable; no se edita stock "a mano" salvo ajustes autorizados post-inventario.
6. **Sin internet requerido:** funciona en LAN interna.

### Conexión móvil

- App **APK Android** separada del instalador de PC (no es la misma app Electron).
- Al iniciar: ingreso manual de **IP del servidor** + puerto `3847`, o escaneo de **código QR** generado por el PC servidor.
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

**Nota:** el producto no almacena una única cantidad global como fuente de verdad; el stock real está distribuido por sectores y **por líneas de desglose** dentro de cada sector (ver [DESGLOSE-DE-CANTIDADES.md](DESGLOSE-DE-CANTIDADES.md)).

---

### 3.2 Consulta

Búsqueda y visualización de información de stock.

**Funcionalidades:**
- Buscar por **código interno**, código de barras, nombre o sector (buscador dinámico)
- Ver stock total del producto
- Ver **desglose por sector** (líneas: pallet × unidades, sueltos — sin fusionar)
- Ver **desglose por ubicación/pila** dentro de cada sector
- Ver historial reciente de movimientos del producto (opcional)

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

**Posible extensión futura:** importación desde Excel/CSV.

---

### 3.5 Gestión de retornos

Productos que vuelven o se recuperan. Requiere **doble verificación**: una persona carga, otra verifica antes de sumar al stock.

**Flujo:**

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
| Verificado por | Auto | Usuario que confirmó (debe ser distinto) |

**Regla:** el mismo usuario **no puede** cargar y verificar el mismo retorno.

**Efecto al verificar:** suma stock. Genera movimientos tipo `RETORNO`.

---

### 3.6 Roturas y pérdidas

Productos dañados, rotos, perdidos o en mal estado durante el trabajo.

**Campos:**
- Producto + cantidad
- Sector origen
- Motivo/tipo (roto, perdido, mal estado)
- Observación (opcional)

**Efecto:** descuenta stock aplicando la [regla de sectores de descuento](DESGLOSE-DE-CANTIDADES.md#8-regla-de-descuento-planillas-roturas-y-pérdidas). Genera movimientos tipo `ROTURA` o `PERDIDA`.

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
| Retornos | Total sumado por retornos verificados |
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

**Exportación (futuro):** PDF, Excel.

---

### 3.11 Inventario (módulo principal)

Conteo físico realizado por **dos personas** conectadas desde celulares (navegador en v1; APK después). Cada uno registra **líneas independientes** con desglose (pallet × unidades, sueltos). Ver documentos:

- [INVENTARIO.md](INVENTARIO.md) — flujo completo
- [DESGLOSE-DE-CANTIDADES.md](DESGLOSE-DE-CANTIDADES.md) — formato de cantidades

**Resumen:**
1. Sesión con sectores (todos o parcial) y dos contadores por sector.
2. Al iniciar: snapshot del stock + bloqueo global de movimientos.
3. Buscador dinámico o escaneo; líneas independientes (no se fusionan).
4. Comparación A: contador vs contador al finalizar cada sector; reconteo con referencia del desglose anterior.
5. Comparación B: total contado vs sistema al cerrar; detecta cantidad y reorganización entre sectores.
6. Supervisor confirma → `stock_lineas` se alinea con lo contado + reporte antes/después.

---

### 3.12 Gestión de usuarios

Administración de cuentas y permisos. Ver documento: [USUARIOS-Y-PERMISOS.md](USUARIOS-Y-PERMISOS.md).

---

## 4. Reglas de negocio globales

| # | Regla |
|---|-------|
| R1 | Todo cambio de stock debe quedar registrado como movimiento auditable |
| R2 | Cada movimiento registra: usuario, fecha/hora, tipo, producto, cantidad, sector(es) |
| R3 | Un producto puede tener stock en múltiples sectores simultáneamente |
| R4 | Retornos: quien carga ≠ quien verifica |
| R5 | Inventario: dos contadores distintos por sector; vistas independientes; comparación A al finalizar ambos; reconteo solo con diferencia; comparación B vs sistema al cerrar; reorganización del depósito |
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

| Módulo | PC (Electron) | Celular (APK) |
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

## 6. Fases de desarrollo sugeridas

### Fase 1 — Base
- [ ] Proyecto Electron + servidor embebido
- [ ] Base de datos inicial
- [ ] Usuarios, login, permisos
- [ ] Productos (CRUD + código de barras + imagen)
- [ ] Sectores
- [ ] Consulta de stock

### Fase 2 — Movimientos core
- [ ] Camioneros
- [ ] Ingresos (remito, transporte, observación)
- [ ] Carga de planillas
- [ ] Roturas y pérdidas
- [ ] Movimientos entre sectores
- [ ] Ledger de movimientos

### Fase 3 — Retornos
- [ ] Flujo carga + verificación dual
- [ ] Regla mismo usuario no puede verificar lo propio

### Fase 4 — Reportes
- [ ] Movimientos del día
- [ ] Filtros por fecha, sector, camionero, etc.

### Fase 5 — App móvil (APK)

Ver [APP-MOVIL.md](APP-MOVIL.md).

- [ ] Login + permisos + conexión LAN (IP / QR)
- [ ] Escaneo de código de barras (cámara)
- [ ] **Consulta** de stock con desglose
- [ ] ~~**Ingresos** desde bodega~~ → solo PC (remito; ver APP-MOVIL.md)
- [ ] **Retornos** (cargar + verificar)
- [ ] **Roturas** y pérdidas
- [ ] Carga de planillas / movimientos internos
- [ ] **Inventario dual** (prioridad móvil; WebSockets)

### Fase 6 — Inventario dual
- [ ] Sesiones de inventario
- [ ] WebSockets
- [ ] Comparación y reconteo
- [ ] Cierre y reporte de diferencias

### Fase 7 — Pulido
- [ ] Export PDF/Excel
- [ ] Import planillas (Excel/CSV)
- [ ] Backup automático
- [ ] QR para conexión móvil

---

## 7. Decisiones pendientes

Items a definir antes o durante el desarrollo:

- [ ] ¿Planilla requiere camionero obligatorio siempre o solo recomendado?
- [ ] ¿Número de remito único global o por proveedor/fecha?
- [ ] ¿Importación de planillas desde Excel en v1 o fase posterior?
- [ ] ¿Flutter vs React Native para APK?
- [ ] ¿SQLite suficiente o PostgreSQL desde el inicio?
- [ ] Detalle completo del flujo de inventario (ver [INVENTARIO.md](INVENTARIO.md)) — *definido*
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
| **Retorno** | Devolución de productos que vuelven al stock (tras verificación) |
| **Ledger** | Registro histórico de todos los movimientos de stock |
| **Sesión de inventario** | Proceso de conteo físico con dos personas por sector |
| **Sector de descuento** | Sector marcado como origen preferido al descontar stock (planillas, roturas) |
| **Pucherio** | Cantidad suelta de unidades (no formando pallet/caja completa) |
