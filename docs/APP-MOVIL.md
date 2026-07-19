# BodegaStock — App móvil (APK Android) y acceso web

> Documento de referencia para la fase móvil. La **APK** es **otra aplicación**, distinta del instalador de PC, pero usa **la misma API y la misma base de datos** del PC servidor.
>
> **Decisión acordada (julio 2026):** el acceso por **navegador/celular (web)** y la **APK** (Capacitor) **conviven**. La web no se reemplaza: son dos puertas al mismo servidor.

---

## 1. Visión

La operación en bodega desde el celular no depende de un solo canal. Hay **dos clientes móviles** previstos (y el desktop):

| Canal | Qué es | Rol |
|--------|--------|-----|
| **Web (navegador)** | Misma UI servida por el PC en el puerto **3847** (URL/QR de Configuración) | Disponible **ya**; pruebas, inventario, operación sin instalar APK |
| **APK Android** | App instalable (Capacitor) | Día a día más cómodo (ícono fijo, cámara, inventario offline, sin barra del navegador) |
| **PC (Electron)** | Instalador ControlStock | Servidor + administración + supervisión |

Varios usuarios en el depósito usarían celular (web y/o APK) para:

- **Consulta** de stock (escaneo o búsqueda)
- **Retornos** (cargar y verificar)
- **Roturas** y pérdidas
- **Movimientos internos** entre sectores
- **Planillas** (salidas con camionero)
- **Inventario** (conteo con dos personas en paralelo)

**Ingresos** quedan **solo en PC por ahora** (ver §5): el control con remito físico permite cargarlos después en escritorio.

El **PC (Electron)** sigue siendo el centro de administración: catálogo, sectores, usuarios, reportes completos, **ingresos con remito**, supervisión de inventario y cierre de sesiones.

```
                    ┌─────────────────────────┐
                    │   PC servidor (Electron) │
                    │   API + UI web + SQLite  │
                    │   Admin + supervisor     │
                    └───────────┬─────────────┘
                                │  WiFi / LAN :3847
          ┌─────────────────────┼─────────────────────┐
          │                     │                     │
    ┌─────▼─────┐         ┌─────▼─────┐         ┌─────▼─────┐
    │ Celular   │         │ Celular   │         │ Celular N │
    │ navegador │         │  (APK)    │         │ web/APK   │
    │   (web)   │         │ operación │         │           │
    └───────────┘         └───────────┘         └───────────┘
```

Los tres caminos (PC, web, APK) consumen la **misma API**, mismos usuarios y permisos.

---

## 2. Web y APK en paralelo (decisión)

### No son excluyentes

- La **web** permanece siempre disponible mientras el PC servidor esté en modo servidor.
- La **APK** (Capacitor, Android) es canal adicional; **no** obliga a sacar la web.
- En una misma sesión de inventario puede haber contadores por **navegador** y por **APK**, siempre que hablen con el mismo servidor.

### Por qué mantener la web

| Beneficio | Detalle |
|-----------|---------|
| Sin instalación | Abrir la URL de Configuración en el celular (misma WiFi) |
| Pruebas y capacitación | Inventario / flujos sin distribuir APK |
| Contingencia | Si un teléfono no tiene la APK, sigue operando por navegador |
| Base para Capacitor | Si el stack móvil reutiliza React, la web responsive es el punto de partida |

### Por qué igualmente conviene la APK

Con **muchos usuarios** y **varios módulos**, la APK reduce fricción operativa:

| Riesgo con solo web (link) | Con APK instalada |
|----------------------------|-------------------|
| Cada uno guarda el link distinto o usa favoritos viejos | Ícono fijo en el celular |
| Botón "atrás" del navegador sale del flujo | Navegación interna sin barra del navegador |
| Cambia la IP del servidor → links rotos | IP se configura una vez (o QR desde PC) |
| Escaneo de barras más incómodo | Cámara integrada, pensada para depósito |

**Conclusión acordada:** web **siempre** como opción; APK como **mejora de operación diaria**, no como reemplazo obligatorio.

### Cómo abrir la web hoy

1. PC con ControlStock en modo **servidor**.
2. En **Configuración**, copiar la URL (ej. `http://192.168.1.50:3847`) o usar el QR.
3. En el celular (misma WiFi), abrir esa URL → pantalla de **login**.
4. Firewall de Windows: permitir el puerto **3847**.

---

## 3. ¿Qué es cada pieza?

| Pieza | Qué es |
|-------|--------|
| **PC servidor** | Electron + API + **UI web estática** + SQLite (única fuente de verdad) |
| **PC cliente** | Misma app Electron, modo cliente → IP del servidor |
| **Celular (web)** | Navegador → misma URL `:3847` (login + módulos según permiso) |
| **Celular (APK)** | App Android → misma API por WiFi/LAN (otro artefacto de instalación) |

La APK **online** habla con la API del PC. Para **inventario en modo offline** (depósito sin WiFi al servidor), la APK **sí** lleva base local del **paquete de sesión/conteo** (no es la SQLite del PC). Ver [INVENTARIO.md](INVENTARIO.md) §3.1.

**No** se adopta un dump ciego de todo el inventario sin Comparación A entre contadores. El offline acordado es: conteo local + sync entre pares al final del sector + import al PC.

---

## 4. Conexión

1. El **PC servidor** debe estar encendido con ControlStock en modo servidor.
2. Celular y PC en la **misma red WiFi** de la empresa.
3. **Web:** abrir la URL de Configuración (ej. `http://192.168.1.50:3847`) en el navegador del celular.
4. **APK:** configurar **IP del servidor** + puerto **`3847`**, o escanear el **QR** del PC.
5. **Login** con usuario/contraseña (mismos usuarios que en escritorio).
6. Permisos del usuario determinan qué pantallas ve en el celular.

```
Celular (navegador o APK)  ──HTTP (+ WebSocket opcional)──►  PC servidor :3847  ──►  SQLite + UI web
```

---

## 5. Módulos en celular

Pensado para **usar con las manos en el depósito**, escaneando códigos con la cámara del teléfono. Aplica tanto a **web** como a **APK** (misma API).

### Operación diaria (prioridad alta en celular)

| Módulo | Para qué en el celular | Notas |
|--------|------------------------|-------|
| **Consulta** | Buscar producto y ver stock con desglose por sector/ubicación | Tres modos: por producto, por sector, ver todos. Export Excel (`consulta.ver`). Escaneo con cámara. |
| **Retornos** | Cargar devoluciones **y** verificar las de otro usuario | Respeta config del servidor: doble verificación solo si `retornos_doble_verificacion` está on. |
| **Roturas** | Registrar baja de stock con motivo | Descuento por reglas de sectores (prioridad + menor stock). |
| **Movimientos internos** | Traslado entre sectores | Mismo modelo de líneas que en PC. Si `movimientos_doble_verificacion` está on, aplica verificación dual según config. |
| **Inventario** | Conteo físico por sector, **dos personas en paralelo** | Ver [INVENTARIO.md](INVENTARIO.md). Supervisor opera desde PC. |

### También previsto en móvil (fase posterior)

| Módulo | Uso |
|--------|-----|
| **Planillas** | Salidas con camionero y vehículo |
| **Reportes** | Vista limitada (ej. movimientos del día) |

### Solo en PC (no en celular v1)

| Módulo | Motivo |
|--------|--------|
| **Ingresos** | El ingreso se controla con el **remito físico**; la carga al sistema puede hacerse **después en la PC** con el papel a mano, sin urgencia en el pasillo. No es prioritario en celular por ahora. |
| Productos (alta/edición catálogo) | Administración; en móvil solo consulta/escaneo |
| Sectores / ubicaciones | Configuración |
| Camioneros (ABM) | Configuración; en móvil solo **selector** al cargar planilla |
| Usuarios y permisos | Administración |
| Reportes completos / ABM admin | Escritorio (exports Excel de módulos operativos sí están en celular si hay `*.ver`) |
| Crear/cerrar sesión de inventario | Supervisor en PC |

*Ingresos en APK:* misma API que PC; evaluar en fase posterior si la operación lo requiere.

---

## 6. Menú por rol (propuesta)

La APK **no** replica el menú completo de PC. Muestra solo lo que el usuario puede hacer según permisos.

| Perfil | Pantallas típicas en APK |
|--------|-------------------------|
| **Operario de bodega** | Consulta, roturas, movimientos (según permiso) |
| **Planillero** | Consulta, planillas |
| **Verificador de retornos** | Consulta, retornos (verificar) — solo relevante si doble verificación está on |
| **Cargador de retornos** | Consulta, retornos (cargar) |
| **Contador de inventario** | Consulta (opcional), inventario → sectores asignados |
| **Supervisor** | Principalmente PC; en celular solo consulta o vista de estado si hace falta |
| **Administrador** | Solo PC |

Reglas transversales en APK:

- Sin pantallas de configuración (usuarios, sectores, productos).
- Banner global si hay **inventario en curso** (bloqueo de movimientos).
- Cada módulo es un flujo acotado: entrar → operar → confirmar → volver al menú móvil.

---

## 7. Experiencia por módulo

### Consulta
- Tres modos (igual que escritorio): **por producto**, **por sector**, **ver todos**.
- Buscador + escaneo de código de barras.
- Ver stock total y desglose por sector (y ubicación si aplica).
- Ampliar imagen del producto.
- **Exportar Excel** de stock por productos (`GET /api/consulta/export/stock-productos`, permiso `consulta.ver`).

### Ingresos (solo PC por ahora)

No incluido en la APK v1. Operación acordada:

- La mercadería que entra se controla con el **remito en papel**.
- Quien recibe en bodega no necesita cargar el ingreso en el momento en el celular.
- Más tarde, en la **PC**, se carga el ingreso con el remito a mano (nº remito, líneas, desglose, sector).

Si en el futuro hiciera falta cargar ingresos en el pasillo, la API ya existe; sería sumar pantalla móvil en una fase posterior.

### Retornos
- **Cargar:** producto, cantidades, camionero, observación → estado pendiente de verificación (si la doble verificación está activa).
- **Verificar:** otro usuario revisa y confirma → suma stock (solo si `retornos_doble_verificacion` está on).
- Regla RN-U2 (`cargado_por` ≠ `verificado_por`): aplica **solo** con doble verificación activada en el servidor.

### Roturas
- Producto, sector, desglose a descontar, motivo.
- Aplica regla de sectores de descuento.

### Movimientos internos
- Origen, destino, producto, desglose, observación.
- Misma lógica de sectores y ubicaciones que en PC.
- Respeta `movimientos_doble_verificacion` del servidor si está activada.

### Planillas
- Camionero, vehículo, líneas de salida con desglose.
- Modo cajas / botellas según reglas de negocio en PC.

### Inventario
- Supervisor crea sesión en PC; contadores entran desde web y/o APK.
- **Modo elegible:** **con red** (conteo y Comparación A en el PC) u **offline** (bajar paquete en oficina → contar en depósito → sync entre celulares al final del sector → import al PC). Detalle: [INVENTARIO.md](INVENTARIO.md) §3.1.
- Cada contador ve **su vista independiente** (no la del compañero durante el conteo).
- Carga líneas con desglose por ubicación; **no se fusionan** (mismo producto dos veces = dos filas).
- Al cerrar sector por ambos: **Comparación A** (en PC si online; entre celulares si offline).
- Si hay diferencia: **reconteo** con desglose anterior como referencia.
- Cierre global y Comparación B vs sistema: **solo supervisor en PC**.
- Mientras `EN_PROGRESO`: **bloqueo global** de movimientos.
- Ver [INVENTARIO.md](INVENTARIO.md) en detalle.

---

## 8. Permisos móviles

Mismos códigos de permiso que escritorio (`ingresos.crear`, `retornos.verificar`, `inventario.contar`, etc.). La APK oculta menús según permisos; el **servidor valida en cada request**.

Referencia: [USUARIOS-Y-PERMISOS.md](USUARIOS-Y-PERMISOS.md).

---

## 9. Tiempo real (WebSocket)

**No es obligatorio** para que la APK funcione. La API REST + SQLite en el servidor es suficiente para guardar y consultar datos.

| Módulo | ¿Necesita WebSocket? | Alternativa en v1 |
|--------|----------------------|-------------------|
| Consulta | No | REST al buscar |
| Roturas / movimientos | No | REST al guardar |
| Ingresos | — | Solo PC (no APK v1) |
| Retornos | Útil (aviso de pendientes de verificar) | Polling o refresh al entrar |
| Inventario | **Útil** (compañero finalizó, comparación lista) | Polling cada 5–10 s en sesión activa |
| Planillas | No | REST al guardar |

Eventos de inventario que justificarían WebSocket (fase posterior):

| Evento | Quién recibe |
|--------|--------------|
| `sector.companero_finalizo` | Contador que ya terminó |
| `sector.comparacion_lista` | Ambos contadores del sector |
| `sector.cerrado_ok` / `sector.con_diferencias` | Contadores + supervisor |
| `sesion.lista_cierre` | Supervisor |

Durante el conteo **no** se emiten las líneas del otro contador (independencia). Ver sección 13 de [INVENTARIO.md](INVENTARIO.md).

**Prioridad sugerida:** APK ya opera con REST; WebSocket después si el polling molesta en operación.

---

## 10. Requisitos técnicos previstos

| Tema | Decisión / pendiente |
|------|----------------------|
| Plataforma | **APK Android** |
| Enfoque de desarrollo | **Capacitor** (reutiliza React del PC; mismo UI de inventario/reconteo). iOS más adelante con `npx cap add ios`. |
| API | REST existente (Fastify, puerto `3847`) |
| Tiempo real | WebSocket opcional (fase posterior); v1 con polling |
| Auth | JWT (igual que PC) |
| Escaneo | Cámara del dispositivo (código de barras / QR conexión) |
| Offline | **Inventario offline implementado** (paquete + conteo local + sync P2P/hotspot + import). Consulta/cola genérica offline: pendiente. Online requiere LAN al servidor. |
| Iconos | Fuente: `build/icon.svg` → `npm run icons` genera desktop (`icon.png`/`icon.ico`) y mipmaps Android. `npm run cap:sync` = icons + `build:mobile` + `cap sync`. |
| Imágenes productos | Servidas por API (`GET /api/productos/:id/imagen`) |
| Distribución | APK firmada; instalación manual o enlace de descarga (release GitHub u otro) |
| Actualizaciones APK | Pendiente (Play Store interna, descarga directa, etc.) |

---

## 11. Relación con PC

| | PC servidor | PC cliente | APK |
|---|:---:|:---:|:---:|
| Instalador | Electron (ControlStock) | Mismo Electron | **APK Android** |
| Base de datos | ✓ local | — | — |
| Configuración | Modo servidor | IP del servidor | IP del servidor (+ QR) |
| Pantallas admin | ✓ | Según permiso | No |
| Operación en bodega | ✓ (ingresos, etc.) | ✓ | ✓ (sin ingresos en v1) |
| Inventario supervisión/cierre | ✓ | ✓ | No (solo contar) |

---

## 12. Fases de implementación (propuesta)

Orden sugerido para ir sumando valor en bodega. **Sujeto a priorización** con el equipo.

| Fase | Contenido | Objetivo / estado |
|------|-----------|-------------------|
| **0** | Infra LAN: servidor en red, health check, QR de conexión (PC) | Hecho |
| **1** | APK base: login, permisos, IP, menú | Hecho (Capacitor) |
| **2** | **Consulta** (3 modos + export Excel) | Hecho |
| **3** | **Roturas** | Hecho / en uso |
| **4** | **Retornos** (según config doble verificación) | Hecho / en uso |
| **5** | **Movimientos internos + planillas** | Movimientos en uso; planillas móvil a confirmar |
| **6** | **Inventario** online + **offline** (paquete, P2P, import) | Flujo principal hecho; probar en 2 físicos |
| **7** | WebSocket, pulido de escaneo, reportes móviles limitados | Pendiente / opcional |
| *—* | *Ingresos en APK* | *Fuera de v1; cargar en PC con remito* |

### Alternativa histórica: “solo web antes de APK”

Eso ya está **superado**:

1. UI web en `:3847` (desde v0.3.3) — login y operación en LAN.
2. APK Capacitor en el monorepo (`android/`) — convive con la web.
3. Inventario offline en APK (paquete / P2P / import) — ver [INVENTARIO-OFFLINE-ESTADO.md](INVENTARIO-OFFLINE-ESTADO.md).

---

## 13. Decisiones tomadas y pendientes

### Tomadas

- [x] **Ingresos fuera de APK v1:** se cargan en **PC** con el remito físico; no es prioritario en celular.
- [x] **Consulta primero** en la APK (después de infra + app base).
- [x] **Web + APK en paralelo:** el acceso por navegador se **mantiene**; la APK no lo reemplaza (julio 2026).
- [x] **UI web en el puerto 3847:** el PC servidor sirve API + interfaz (desde v0.3.3).
- [x] **Inventario modo dual:** **con red** (Comparación A en el PC) **u offline** (ambos bajan datos en oficina; cuentan en base local; sync entre celulares al final del sector; import al PC). Ver [INVENTARIO.md](INVENTARIO.md) §3.1. Se descartó solo el “volcar todo al final sin comparación entre contadores”.

### Pendientes

- [x] **Stack APK:** **Capacitor** (julio 2026). Misma UI React; Android primero; iOS después.
- [ ] **Planillas en móvil:** ¿en la primera versión de APK o después de retornos?
- [ ] **WebSocket:** ¿en la misma entrega que inventario móvil o después?
- [ ] **Ingresos en APK** (fase futura): ¿hace falta algún día cargar en el pasillo?
- [x] **Inventario offline (APK):** flujo principal listo (paquete, conteo local, sync P2P/hotspot, Comparación A, import PC, limpieza). Ver [INVENTARIO-OFFLINE-ESTADO.md](INVENTARIO-OFFLINE-ESTADO.md). Queda **probar en 2 físicos y pulir**.
- [ ] **Cache offline mínimo** (consulta / cola corta si corta WiFi) — aparte del modo inventario offline.
- [ ] **Versión mínima de Android** soportada.
- [ ] **Distribución y actualización** de la APK (fuera de Play Store vs cuenta interna).
- [ ] **iOS:** agregar cuando haga falta (`npx cap add ios` + Apple Developer).
- [x] **Repo:** monorepo en la raíz del proyecto (`android/` + Capacitor).

---

## 14. Resumen

**Terminales de bodega:** celular por **navegador (web siempre disponible)** y **APK Android** (Capacitor). Online contra el PC por WiFi; **inventario** además admite **modo offline** (APK, sync entre contadores, import) cuando no hay WiFi en depósito — ver [INVENTARIO.md](INVENTARIO.md) §3.1 y [INVENTARIO-OFFLINE-ESTADO.md](INVENTARIO-OFFLINE-ESTADO.md). Mismos módulos según permisos. **Ingresos solo en PC**. Web y APK **no se excluyen**.

---

## 15. Próximo paso (para decidir con el equipo)

1. **Probar inventario offline en dos celulares** (hotspot → Comparación A → import → Comparación B en PC).
2. Pulir UX/errores de red (IP, notificaciones del servidor local).
3. Confirmar **orden de módulos** APK restantes (tabla fase 12).
4. Seguir puliendo la **experiencia web en celular** (modo con red) en paralelo.