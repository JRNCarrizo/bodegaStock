# BodegaStock — App móvil (APK Android)

> Documento de referencia para la fase móvil. La app de celular es **otra aplicación** (APK), distinta del instalador de PC, pero usa **la misma API y la misma base de datos** del PC servidor.

---

## 1. ¿Qué es?

| Pieza | Qué es |
|-------|--------|
| **PC servidor** | Electron + API + SQLite (una sola fuente de verdad) |
| **PC cliente** | Misma app Electron, modo cliente → IP del servidor |
| **Celular (APK)** | App Android nativa/híbrida → misma API por WiFi/LAN |

**No** lleva base de datos propia. **No** funciona sin red local hacia el servidor (salvo cache temporal de UI).

---

## 2. Conexión

1. El **PC servidor** debe estar encendido con BodegaStock en modo servidor.
2. Celular y PC en la **misma red WiFi** de la empresa.
3. En la APK: configurar **IP del servidor** (ej. `192.168.1.50`) y puerto **`3847`**.
4. Alternativa planificada: **escanear QR** generado desde el PC servidor.
5. **Login** con usuario/contraseña (mismos usuarios que en escritorio).
6. Permisos del usuario determinan qué pantallas ve en el celular.

```
Celular (APK)  ──HTTP/WebSocket──►  PC servidor :3847  ──►  SQLite
```

---

## 3. Módulos en celular (alcance acordado)

Prioridad operativa en bodega — pensado para **usar con las manos en el depósito**, escaneando códigos con la cámara del teléfono.

### Prioridad alta

| Módulo | Para qué en el celular | Notas |
|--------|------------------------|-------|
| **Inventario** | Conteo físico por sector, **dos personas en paralelo** | Caso de uso principal del móvil. Ver [INVENTARIO.md](INVENTARIO.md). WebSockets para sincronización en vivo. |
| **Consulta** | Buscar producto (código interno, barras, nombre) y ver stock con desglose por sector/ubicación | Solo lectura. Escaneo con cámara. |
| **Retornos** | Cargar devoluciones **y** verificar las cargadas por otro usuario | Doble verificación: quien carga ≠ quien verifica. |
| **Ingresos** | Registrar entrada de mercadería con remito, líneas de desglose y sector | Mismo modelo de líneas que en PC (pallet × u, sueltos, ubicación en GPI, etc.). |
| **Roturas y pérdidas** | Registrar baja de stock en bodega con motivo | Descuento por reglas de sectores (prioridad + menor stock). |

### También previsto en móvil

| Módulo | Uso |
|--------|-----|
| **Carga de planillas** | Salidas con camionero y vehículo |
| **Movimientos internos** | Traslado entre sectores |
| **Reportes** | Vista limitada (ej. movimientos del día) |

### Solo en PC (no APK)

| Módulo | Motivo |
|--------|--------|
| Productos (alta/edición catálogo) | Administración; en móvil solo consulta/escaneo |
| Sectores / ubicaciones | Configuración |
| Camioneros (ABM) | Configuración; en móvil solo **selector** al cargar planilla/ingreso |
| Usuarios y permisos | Administración |
| Reportes completos / exportación | Escritorio |

---

## 4. Experiencia por módulo (borrador)

### Consulta
- Buscador + escaneo de código de barras.
- Ver stock total y desglose por sector (y ubicación si aplica).
- Ampliar imagen del producto.

### Ingresos
- Nº remito, transporte, observación, camionero (opcional).
- Líneas: producto + sector + ubicación (si el sector la usa) + desglose.
- Confirmación suma stock y genera movimientos.

### Retornos
- **Cargar:** producto, cantidades, camionero, observación → estado pendiente de verificación.
- **Verificar:** otro usuario revisa y confirma → suma stock.
- Regla: el verificador **no** puede ser quien cargó.

### Roturas
- Producto, sector, desglose a descontar, motivo.
- Aplica regla de sectores de descuento.

### Inventario (foco principal)
- Supervisor crea sesión en PC; contadores entran desde el celular (**navegador en v1**, APK después).
- Cada contador ve **su vista independiente** (no la del compañero durante el conteo).
- Carga líneas con desglose por ubicación; **no se fusionan** (mismo producto dos veces = dos filas).
- Al cerrar sector por ambos: **Comparación A** (contador vs contador).
- Si hay diferencia: **reconteo** con desglose anterior como referencia (cada uno puede contar distinto si el total coincide).
- Al cerrar sesión: **Comparación B** vs sistema; ajustes + reorganización entre sectores; reporte antes/después.
- Mientras `EN_PROGRESO`: **bloqueo global** de movimientos.
- Ver [INVENTARIO.md](INVENTARIO.md) en detalle.

---

## 5. Permisos móviles

Mismos códigos de permiso que escritorio (`ingresos.crear`, `retornos.verificar`, `inventario.contar`, etc.). La APK oculta menús según permisos; el servidor valida en cada request.

Referencia: [USUARIOS-Y-PERMISOS.md](USUARIOS-Y-PERMISOS.md).

---

## 6. Requisitos técnicos previstos

| Tema | Decisión / pendiente |
|------|----------------------|
| Plataforma | **APK Android** (Flutter o React Native — pendiente) |
| API | REST existente (Fastify, puerto `3847`) |
| Tiempo real | **WebSockets** para inventario (fase posterior; v1 con refresh/polling) |
| Auth | JWT (igual que PC) |
| Escaneo | Cámara del dispositivo (código de barras / QR conexión) |
| Offline | No en v1 — requiere LAN al servidor |
| Imágenes productos | Servidas por API (`GET /api/productos/:id/imagen`) |

---

## 7. Relación con PC cliente

| | PC servidor | PC cliente | APK |
|---|:---:|:---:|:---:|
| Instalador | Mismo Electron | Mismo Electron | **APK Android** |
| Base de datos | ✓ local | — | — |
| Configuración | Modo servidor | IP del servidor | IP del servidor (+ QR) |
| Pantallas admin | ✓ | Según permiso | No |
| Operación en bodega | ✓ | ✓ | ✓ (optimizado) |

---

## 8. Fases de implementación móvil (sugerido)

1. **Infra LAN** — servidor escuchando en red; QR de conexión; PC modo cliente.
2. **APK base** — login, permisos, configurar IP, health check.
3. **Consulta** — primera pantalla útil en bodega.
4. **Ingresos + roturas** — movimientos que suman/restan stock.
5. **Retornos** — flujo dual cargar/verificar.
6. **Planillas + movimientos internos**.
7. **Inventario dual** — WebSockets + reconteo (el módulo más exigente).

---

## 9. Decisiones pendientes (móvil)

- [ ] Flutter vs React Native vs Capacitor (reutilizar React del PC).
- [ ] ¿Planillas en móvil en v1 o solo después de ingresos/retornos?
- [ ] Cache offline mínimo (solo consulta) — probablemente no en v1.
- [ ] Versión mínima de Android soportada.

---

## 10. Resumen en una frase

**Una APK Android que se conecta por WiFi al PC servidor y permite operar en la bodega: consultar, ingresar, retornar (con verificación), roturas y — sobre todo — inventario con dos personas contando en paralelo.**
