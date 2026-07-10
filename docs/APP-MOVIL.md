# BodegaStock — App móvil (APK Android)

> Documento de referencia para la fase móvil. La app de celular es **otra aplicación** (APK), distinta del instalador de PC, pero usa **la misma API y la misma base de datos** del PC servidor.

---

## 1. Visión

La APK no es solo un accesorio para inventario: es la **terminal de operación en bodega** para el día a día.

Varios usuarios en el depósito la usarían para:

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
                    │   API + SQLite           │
                    │   Admin + supervisor     │
                    └───────────┬─────────────┘
                                │  WiFi / LAN :3847
          ┌─────────────────────┼─────────────────────┐
          │                     │                     │
    ┌─────▼─────┐         ┌─────▼─────┐         ┌─────▼─────┐
    │ Celular 1 │         │ Celular 2 │         │ Celular N │
    │   (APK)   │         │   (APK)   │         │   (APK)   │
    │ operación │         │ operación │         │ operación │
    └───────────┘         └───────────┘         └───────────┘
```

---

## 2. ¿Por qué APK y no un link web?

Con **muchos usuarios** y **varios módulos**, repartir un link del navegador genera fricción operativa:

| Riesgo con web (link) | Con APK instalada |
|------------------------|-------------------|
| Cada uno guarda el link distinto o usa favoritos viejos | Icono fijo en el celular |
| No refrescan y ven datos desactualizados | La app controla cuándo pedir datos nuevos |
| Entran a pantallas que no les corresponden | Menú acotado por permisos del usuario |
| Botón "atrás" del navegador sale del flujo | Navegación interna sin barra del navegador |
| Cambia la IP del servidor → links rotos | IP se configura una vez (o QR desde PC) |
| Escaneo de barras más incómodo | Cámara integrada, pensada para depósito |

**Conclusión acordada:** el navegador puede servir para **probar** flujos; para **producción con muchos operarios**, la APK es más organizada y predecible.

### Web como etapa intermedia (opcional)

| Etapa | Uso |
|-------|-----|
| **Web responsive** | Validar flujos con pocos usuarios antes de invertir en APK |
| **APK** | Operación diaria en bodega con muchos usuarios |

No son excluyentes: la misma API y permisos sirven para ambos.

---

## 3. ¿Qué es cada pieza?

| Pieza | Qué es |
|-------|--------|
| **PC servidor** | Electron + API + SQLite (única fuente de verdad) |
| **PC cliente** | Misma app Electron, modo cliente → IP del servidor |
| **Celular (APK)** | App Android → misma API por WiFi/LAN |

**No** lleva base de datos propia en v1. **No** funciona sin red local hacia el servidor (salvo cache temporal de UI, no planificado en v1).

---

## 4. Conexión

1. El **PC servidor** debe estar encendido con ControlStock en modo servidor.
2. Celular y PC en la **misma red WiFi** de la empresa.
3. En la APK: configurar **IP del servidor** (ej. `192.168.1.50`) y puerto **`3847`**.
4. Alternativa planificada: **escanear QR** generado desde el PC servidor.
5. **Login** con usuario/contraseña (mismos usuarios que en escritorio).
6. Permisos del usuario determinan qué pantallas ve en el celular.

```
Celular (APK)  ──HTTP (+ WebSocket opcional)──►  PC servidor :3847  ──►  SQLite
```

---

## 5. Módulos en celular

Pensado para **usar con las manos en el depósito**, escaneando códigos con la cámara del teléfono.

### Operación diaria (prioridad alta en APK)

| Módulo | Para qué en el celular | Notas |
|--------|------------------------|-------|
| **Consulta** | Buscar producto y ver stock con desglose por sector/ubicación | Solo lectura. Escaneo con cámara. Puerta de entrada habitual en bodega. |
| **Retornos** | Cargar devoluciones **y** verificar las de otro usuario | Doble verificación: quien carga ≠ quien verifica. |
| **Roturas** | Registrar baja de stock con motivo | Descuento por reglas de sectores (prioridad + menor stock). |
| **Movimientos internos** | Traslado entre sectores | Mismo modelo de líneas que en PC. |
| **Inventario** | Conteo físico por sector, **dos personas en paralelo** | Ver [INVENTARIO.md](INVENTARIO.md). Supervisor opera desde PC. |

### También previsto en móvil (fase posterior)

| Módulo | Uso |
|--------|-----|
| **Planillas** | Salidas con camionero y vehículo |
| **Reportes** | Vista limitada (ej. movimientos del día) |

### Solo en PC (no APK en v1)

| Módulo | Motivo |
|--------|--------|
| **Ingresos** | El ingreso se controla con el **remito físico**; la carga al sistema puede hacerse **después en la PC** con el papel a mano, sin urgencia en el pasillo. No es prioritario en celular por ahora. |
| Productos (alta/edición catálogo) | Administración; en móvil solo consulta/escaneo |
| Sectores / ubicaciones | Configuración |
| Camioneros (ABM) | Configuración; en móvil solo **selector** al cargar planilla |
| Usuarios y permisos | Administración |
| Reportes completos / exportación | Escritorio |
| Crear/cerrar sesión de inventario | Supervisor en PC |

*Ingresos en APK:* misma API que PC; evaluar en fase posterior si la operación lo requiere.

---

## 6. Menú por rol (propuesta)

La APK **no** replica el menú completo de PC. Muestra solo lo que el usuario puede hacer según permisos.

| Perfil | Pantallas típicas en APK |
|--------|-------------------------|
| **Operario de bodega** | Consulta, roturas, movimientos (según permiso) |
| **Planillero** | Consulta, planillas |
| **Verificador de retornos** | Consulta, retornos (verificar) |
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
- Buscador + escaneo de código de barras.
- Ver stock total y desglose por sector (y ubicación si aplica).
- Ampliar imagen del producto.

### Ingresos (solo PC por ahora)

No incluido en la APK v1. Operación acordada:

- La mercadería que entra se controla con el **remito en papel**.
- Quien recibe en bodega no necesita cargar el ingreso en el momento en el celular.
- Más tarde, en la **PC**, se carga el ingreso con el remito a mano (nº remito, líneas, desglose, sector).

Si en el futuro hiciera falta cargar ingresos en el pasillo, la API ya existe; sería sumar pantalla móvil en una fase posterior.

### Retornos
- **Cargar:** producto, cantidades, camionero, observación → estado pendiente de verificación.
- **Verificar:** otro usuario revisa y confirma → suma stock.
- Regla: el verificador **no** puede ser quien cargó.

### Roturas
- Producto, sector, desglose a descontar, motivo.
- Aplica regla de sectores de descuento.

### Movimientos internos
- Origen, destino, producto, desglose, observación.
- Misma lógica de sectores y ubicaciones que en PC.

### Planillas
- Camionero, vehículo, líneas de salida con desglose.
- Modo cajas / botellas según reglas de negocio en PC.

### Inventario
- Supervisor crea sesión en PC; contadores entran desde la APK.
- Cada contador ve **su vista independiente** (no la del compañero durante el conteo).
- Carga líneas con desglose por ubicación; **no se fusionan** (mismo producto dos veces = dos filas).
- Al cerrar sector por ambos: **Comparación A** (contador vs contador).
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

**Prioridad sugerida:** primero APK con REST; WebSocket después si el polling molesta en operación.

---

## 10. Requisitos técnicos previstos

| Tema | Decisión / pendiente |
|------|----------------------|
| Plataforma | **APK Android** |
| Enfoque de desarrollo | **Pendiente:** Flutter vs React Native vs **Capacitor** (reutilizar React del PC) |
| API | REST existente (Fastify, puerto `3847`) |
| Tiempo real | WebSocket opcional (fase posterior); v1 con polling |
| Auth | JWT (igual que PC) |
| Escaneo | Cámara del dispositivo (código de barras / QR conexión) |
| Offline | No en v1 — requiere LAN al servidor |
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

| Fase | Contenido | Objetivo |
|------|-----------|----------|
| **0** | Infra LAN: servidor en red, health check, QR de conexión (PC) | Que los celulares lleguen al API |
| **1** | APK base: login, permisos, configurar IP, menú móvil vacío | App instalable y conectada |
| **2** | **Consulta** | Primera pantalla útil; escaneo en pasillo |
| **3** | **Roturas** | Bajas de stock en el momento en bodega |
| **4** | **Retornos** | Flujo dual cargar / verificar |
| **5** | **Movimientos internos + planillas** | Completar operación diaria en celular |
| **6** | **Inventario** (conteo desde APK) | Módulo más exigente; polling o WebSocket |
| **7** | WebSocket, pulido de escaneo, reportes móviles limitados | Mejora de UX y coordinación |
| *—* | *Ingresos en APK* | *Fuera de v1; cargar en PC con remito. Evaluar después.* |

### Alternativa: web móvil antes de APK

Si se quiere validar sin compilar APK:

1. UI responsive en la app web actual, **menú móvil acotado** (sin admin).
2. Probar con operarios reales en LAN.
3. Empaquetar con **Capacitor** → misma UI en APK.

---

## 13. Decisiones tomadas y pendientes

### Tomadas

- [x] **Ingresos fuera de APK v1:** se cargan en **PC** con el remito físico; no es prioritario en celular.
- [x] **Consulta primero** en la APK (después de infra + app base).

### Pendientes

- [ ] **Stack APK:** Flutter vs React Native vs Capacitor (reutilizar React del PC).
- [ ] **Planillas en móvil:** ¿en la primera versión de APK o después de retornos?
- [ ] **Web intermedia:** ¿probar en navegador antes de APK o ir directo a APK?
- [ ] **WebSocket:** ¿en la misma entrega que inventario móvil o después?
- [ ] **Ingresos en APK** (fase futura): ¿hace falta algún día cargar en el pasillo?
- [ ] **Cache offline mínimo** (solo consulta) — probablemente no en v1.
- [ ] **Versión mínima de Android** soportada.
- [ ] **Distribución y actualización** de la APK (fuera de Play Store vs cuenta interna).

---

## 14. Resumen

**Una APK Android que se conecta por WiFi al PC servidor y funciona como terminal de bodega:** consulta, retornos, roturas, movimientos, planillas e inventario — según permisos. **Ingresos solo en PC** (remito físico, carga posterior en escritorio). El PC sigue siendo administración y supervisión.

---

## 15. Próximo paso (para decidir con el equipo)

1. Confirmar **orden de módulos** (tabla fase 12).
2. Elegir **stack** (Capacitor vs nativo).
3. Definir si hay **web móvil intermedia** o se va directo a APK.
4. Arrancar por **fase 0 + 1 + 2** (infra + APK base + consulta).
