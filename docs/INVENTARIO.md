# BodegaStock — Módulo de Inventario

> **Documento de referencia.** Define el flujo completo del inventario físico: doble conteo, reconteo, comparación vs sistema, reorganización del depósito y cierre con reporte.

Ver también: [DESGLOSE-DE-CANTIDADES.md](DESGLOSE-DE-CANTIDADES.md) · [MODELO-DE-DATOS.md](MODELO-DE-DATOS.md) · [APP-MOVIL.md](APP-MOVIL.md)

---

## 1. Propósito

Realizar un **conteo físico** del stock en la bodega, sector por sector, con **dos personas contando en paralelo** desde el celular (**navegador web** y, cuando exista, **APK** — ambos canales conviven; ver [APP-MOVIL.md](APP-MOVIL.md)). Cada contador registra **líneas independientes** por ubicación/pila (pallet × unidades, pucherios sueltos).

El inventario cumple **dos funciones**:

| Función | Qué hace |
|---------|----------|
| **Auditoría** | Detecta diferencias de cantidad (faltantes/sobrantes reales) |
| **Reorganización** | Alinea sectores y líneas del sistema con la realidad física del depósito |

En la operación diaria es muy común mover mercadería entre sectores **sin registrarlo** en el sistema. El inventario corrige eso: al cerrar, el mapa del depósito en `stock_lineas` queda **igual a cómo quedó físicamente**, no solo el total global.

### Objetivos

- Doble conteo independiente con vistas separadas (sin fusionar líneas).
- Desglose visible: pallet × cajas/unidades + sueltos, no solo total.
- Detectar y localizar diferencias por producto (entre contadores y vs sistema).
- Reorganizar stock entre sectores (movimientos parciales incluidos).
- Generar reporte persistente: cómo estaba el sistema vs cómo quedó.

### Alcance típico

- **4–5 sectores** por inventario.
- **2 contadores distintos** por sector.
- Por defecto se inventarian **todos los sectores**; opción de elegir solo algunos (inventario parcial).

### Plataforma de conteo

| Canal | Dispositivo | Estado |
|-------|-------------|--------|
| **Web** | Navegador del celular (URL `:3847` del PC servidor) | Disponible; se **mantiene** |
| **APK** | App Android (otro instalador) | Necesaria para **modo offline** de inventario; no reemplaza la web online |
| **Supervisor** | PC (Electron) | Crear sesión, supervisar, cerrar |

Contadores pueden usar **web y/o APK** en la misma sesión. Ver [APP-MOVIL.md](APP-MOVIL.md).

**Modo de conectividad del conteo:** se puede elegir **con red al PC** u **offline entre celulares** (alternativa cuando no hay WiFi en el depósito). Ver §3.1.

Supervisor siempre opera desde **PC (Electron)**.

---

## 2. Actores

| Actor | Rol | Dispositivo |
|-------|-----|-------------|
| **Supervisor** | Crea sesión, asigna sectores y contadores, supervisa, cierra inventario, confirma ajustes | PC (Electron) |
| **Contador 1** | Cuenta productos en sector asignado | Celular (navegador / APK) |
| **Contador 2** | Cuenta productos en el mismo sector | Celular (navegador / APK) |

### Reglas de asignación

- Cada sector tiene exactamente **2 contadores distintos** (Contador 1 ≠ Contador 2).
- Un contador **puede estar asignado a varios sectores** en la misma sesión (ej. Juan en Depósito A y Reserva).
- Un contador **no debe tener dos sectores activos al mismo tiempo** (evita confusión operativa).
- Productos no catalogados: **rechazar en v1** (el supervisor los da de alta desde PC si hace falta).

---

## 3. Flujo general

```
┌─────────────────────────────────────────────────────────────────┐
│  FASE 0: PREPARACIÓN (Supervisor - PC)                          │
│  • Crear sesión de inventario (nombre, fecha)                   │
│  • Seleccionar sectores (todos o solo algunos)                  │
│  • Asignar Contador 1 y Contador 2 por sector                   │
│  • Snapshot del stock del sistema (estado inicial)              │
│  • Iniciar sesión → EN_PROGRESO                                 │
│  • BLOQUEO GLOBAL de movimientos en todo el depósito            │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  FASE 1: CONTEO INDEPENDIENTE (Contadores - Celular)            │
│  • Cada contador trabaja SOLO en su vista (no ve al otro)       │
│  • Busca producto: buscador dinámico O escaneo                  │
│  • Registra LÍNEAS independientes por ubicación/pila            │
│  • Las líneas NO se fusionan (ni entre sí ni con el otro)       │
│  • Mismo producto puede tener varias líneas en el mismo sector  │
│  • Cuando termina → marca "Finalicé este sector"                │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  FASE 2: COMPARACIÓN A — Contador vs Contador (por sector)     │
│  • Solo cuando AMBOS finalizaron el sector en la ronda actual   │
│  • Compara TOTAL por producto (suma de líneas de cada uno)      │
│  • AMBOS ven el resultado; se destacan diferencias              │
│  • Si todo coincide → sector CERRADO_OK                         │
│  • Si hay diferencias → sector CON_DIFERENCIAS → reconteo     │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  FASE 3: RECONTEO (solo productos con diferencia entre contadores)│
│  • Nueva ronda; solo productos que no coincidieron              │
│  • Muestra desglose anterior de AMBOS como REFERENCIA           │
│  • Cada uno cuenta de nuevo como quiera (totales deben coincidir)│
│  • Al finalizar ambos → nueva Comparación A                     │
│  • Repetir hasta diferencia = 0 en todos los productos          │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  FASE 4: COMPARACIÓN B — Contado vs Sistema (Supervisor - PC)   │
│  • Todos los sectores elegidos deben estar CERRADO_OK           │
│  • Por producto, en todos los sectores del inventario:          │
│      - ¿Total global contado vs sistema?                        │
│      - ¿Distribución por sector coincide?                       │
│  • Detecta: ajustes de cantidad + reorganizaciones              │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  FASE 5: CIERRE (Supervisor - PC)                               │
│  • Revisar propuesta: ajustes + reorganizaciones                │
│  • Supervisor confirma                                          │
│  • stock_lineas se reemplaza por el desglose contado            │
│  • Movimientos AJUSTE_INVENTARIO en el ledger                  │
│  • Genera REPORTE (antes / después)                             │
│  • Sesión → CERRADA → DESBLOQUEO de movimientos                 │
└─────────────────────────────────────────────────────────────────┘
```

Las fases 1–3 son las mismas en espíritu; cambia **dónde** viven el conteo y la Comparación A según el **modo de conectividad** (§3.1).

---

## 3.1 Modos de conectividad (con red vs offline)

> **Contexto operativo (julio 2026):** en el lugar de trabajo puede no haber WiFi en el depósito (solo en oficina). Por eso el inventario admite **dos modos elegibles**. No se reemplazan entre sí.

### Resumen

| | **Modo con red** | **Modo offline** |
|--|------------------|------------------|
| Cuándo | Hay WiFi/LAN del celular al PC servidor | Depósito sin WiFi hacia el PC |
| Cliente típico | Web `:3847` y/o APK online | **APK** (base local; la web sola no alcanza para P2P cómodo) |
| Catálogo | Online al servidor | Se **baja en la oficina** al PC |
| Conteo | Líneas van al servidor en vivo | Cada celular guarda **su** conteo en base local |
| Comparación A | El **PC** la dispara cuando ambos finalizan | Los **dos celulares** sincronizan entre sí al final del sector |
| Comparación B / cierre | En el PC | En el PC, **después de importar** el sector |

En una misma sesión puede haber sectores contados **con red** y otros **offline**. El PC solo exige que cada sector llegue a estado “OK entre contadores” antes de la Comparación B.

### Cómo se elige

- Al preparar el sector (supervisor o contador al “Preparar”): **Con red** u **Offline**.
- El modo queda asociado al sector de esa sesión (detalle de UI a definir en implementación).

### Modo con red

1. Celulares conectados al PC (`:3847`).
2. Cuentan; las líneas se persisten en el servidor.
3. Ambos marcan “Finalicé” → el **servidor** hace Comparación A.
4. Reconteo online si hace falta.
5. Cuando todos los sectores OK → Comparación B + cierre en PC.

### Modo offline — flujo acordado

```
OFICINA (WiFi al PC)              DEPÓSITO (sin WiFi al PC)           OFICINA de nuevo
─────────────────────             ─────────────────────────           ─────────────────
Ambos celulares al sistema        Cada uno cuenta solo                Conectar al PC
Bajan paquete offline             (base local propia)                 Importar sector(es)
(sesión, sector, rol,             Ambos marcan “Finalicé”             PC ensambla
 catálogo, ubicaciones)           Se conectan entre sí (hotspot)      Comparación B + cierre
                                  Sync → Comparación A
                                  OK o diferencias → reconteo local
```

#### API ya implementada (PC servidor)

| Método | Path | Uso |
|--------|------|-----|
| Crear sesión | `POST /api/inventario/sesiones` | Body `sectores[].modo_conectividad`: `ONLINE` \| `OFFLINE` |
| Cambiar modo | `PATCH /api/inventario/sectores/:id/modo` | Solo si el sector está `PENDIENTE` |
| Descargar paquete | `GET /api/inventario/sectores/:id/paquete-offline` | Contador asignado; catálogo + rol + snapshot |
| Importar conteo | `POST /api/inventario/sectores/:id/importar-offline` | Líneas de ambos + `ronda_actual` → Comparación A en el PC |

Columnas en `inventario_sectores`: `modo_conectividad`, `paquete_descargado_at`, `importado_at`.

El conteo online (líneas/finalizar/reconteo por REST) **queda bloqueado** en sectores `OFFLINE`; esos flujos viven en la APK + import.

> **Estado julio 2026:** el flujo offline de punta a punta está **implementado** en APK (conteo local, sync P2P por hotspot, Comparación A, import, limpieza). Detalle de estado, archivos y “no desviarse”: **[INVENTARIO-OFFLINE-ESTADO.md](INVENTARIO-OFFLINE-ESTADO.md)**.

#### 1) Carga en oficina (ambos al PC)

Los dos contadores se conectan al sistema en la oficina y reciben un **paquete offline** por sector asignado:

- Id de sesión y sector
- Rol (Contador 1 / Contador 2)
- **Catálogo de productos** (código interno, barras, nombre, unidad, defaults pallet/caja)
- Ubicaciones del sector (si aplica)
- Opcional: referencia del snapshot del sistema (solo lectura, para reconteo)

Cada celular guarda eso en **su base local**. No hace falta que los celulares se conecten entre sí todavía.

#### 2) Conteo en depósito (independiente)

- Cada uno cuenta **solo su vista** (no ve el desglose del compañero mientras cuenta).
- Líneas independientes; mismas reglas que online (no fusionar).
- Trabajan **sin red al PC**.

#### 3) Sync solo al final del sector (ambos terminaron)

Modelo acordado: **ambos tienen base local**; **no** hace falta un servidor permanente entre ellos mientras cuentan.

1. Contador 1 marca “Finalicé este sector”.
2. Contador 2 marca “Finalicé este sector”.
3. Se juntan / uno activa hotspot; el otro se conecta.
4. **Sincronizan** el conteo de ese sector / ronda **por HTTP local** (puerto 3850; UI host/cliente en la APK). Plan B: archivo JSON.
5. La app detecta que hay **dos conteos completos** → dispara **Comparación A** (totales por producto).
6. Resultado:
   - **OK** → sector cerrado offline, listo para importar.
   - **Diferencias** → reconteo con referencia de ambos; al finalizar otra vez → nueva sync.

Quién “sabe” que ambos finalizaron en el depósito: **las apps de los celulares** al sincronizar. El PC **no** se entera hasta el import.

Plan B si falla el hotspot: exportar archivo de conteo (respaldo en la UI offline).

#### 4) Import en oficina

1. Uno o ambos se conectan otra vez al PC.
2. **Importan** el sector (líneas contador 1, líneas contador 2, resultado Comparación A, ronda, metadatos).
3. El PC marca el sector como recibido / CERRADO_OK (según corresponda).
4. Cuando todos los sectores de la sesión están OK → Comparación B vs snapshot → cierre como siempre.

### Qué no es el modo offline

- **No** es editar el stock del PC desde el celular sin red.
- **No** es un dump ciego de todo el inventario al final sin Comparación A (eso se descartó porque rompe reconteo entre contadores).
- Offline = conteo + Comparación A **entre pares**; la verdad de stock y Comparación B siguen en el **PC**.

### Estado del sector en el PC mientras está offline

Mientras el conteo ocurre en el depósito, el PC puede mostrar el sector como p. ej. **EN_CONTEO_OFFLINE** / **PENDIENTE_IMPORT** (nombre exacto a definir en implementación), sin levantar el bloqueo global de movimientos de la sesión.

---

### Las dos comparaciones

| | Comparación A | Comparación B |
|---|---------------|---------------|
| **Entre** | Contador 1 vs Contador 2 | Total contado vs stock del sistema |
| **Cuándo** | Al finalizar cada sector (por ronda) | Al cerrar toda la sesión |
| **Granularidad** | Total por producto en el sector | Total global + distribución por sector y líneas |
| **Si difiere** | Reconteo (solo ese producto) | Ajuste y/o reorganización (supervisor confirma) |
| **Quién ve** | Ambos contadores | Supervisor |

---

## 4. Bloqueo de movimientos

Mientras la sesión esté en `EN_PROGRESO`, se **bloquean todos los movimientos** en todo el depósito hasta que el supervisor cierre o cancele el inventario.

```
BLOQUEADO:
  ✗ Ingresos
  ✗ Planillas
  ✗ Retornos (cargar y verificar)
  ✗ Roturas y pérdidas
  ✗ Movimientos internos
  ✗ Reorganizar stock

PERMITIDO:
  ✓ Consulta (solo lectura)
  ✓ Inventario (contar, supervisar)
  ✓ Ver reportes existentes
```

En PC y celular debe mostrarse un **banner global**: *"Inventario en curso — operaciones suspendidas"*.

Al pasar a `CERRADA` o `CANCELADA` se desbloquea todo.

---

## 5. Estados

### Sesión de inventario

| Estado | Descripción |
|--------|-------------|
| `ABIERTA` | Creada, configurando sectores/contadores |
| `EN_PROGRESO` | Contadores trabajando; movimientos bloqueados |
| `CERRADA` | Finalizada; ajustes aplicados; reporte generado |
| `CANCELADA` | Cancelada sin efecto en stock |

### Sector dentro de la sesión

| Estado | Descripción |
|--------|-------------|
| `PENDIENTE` | Asignado, conteo no iniciado |
| `EN_CONTEO` | Al menos un contador registró líneas |
| `ESPERANDO_COMPANERO` | Un contador finalizó, falta el otro |
| `CON_DIFERENCIAS` | Totales no coinciden entre contadores |
| `CERRADO_OK` | Ambos contadores coinciden en todos los productos del sector |

---

## 6. Líneas independientes (regla fundamental)

### Durante el conteo

- Cada registro es una **fila nueva**; no se fusionan ni suman en pantalla.
- Si el mismo producto se cuenta **dos veces en el mismo sector** (dos pilas distintas), son **dos filas separadas**.
- Si se agrega otra pila del mismo producto, es una **nueva línea** (Línea 4, 5…), no se suma a una existente.

```
Producto: Aceite 1L  (PRD-004521) — Depósito A
─────────────────────────────────
  Línea 1: 3 pallet × 112        (336 u)   ← pila fondo izq
  Línea 2: pucherio 23            ( 23 u)   ← estantería
  Línea 3: 2 pallet × 128        (256 u)   ← pasillo
  Línea 4: 1 pallet × 112        (112 u)   ← otra pila del mismo producto
─────────────────────────────────
  Total producto: 727 u   ← visible, secundario
```

### Al cerrar inventario

En cada sector inventariado donde el desglose contado difiere del sistema, las `stock_lineas` del producto se **reemplazan** por el desglose acordado entre los dos contadores (última ronda OK). No se fusionan líneas al persistir.

---

## 7. Experiencia del contador (celular)

### Pantalla: Mis sectores

- Lista de sectores asignados al usuario.
- Estado: pendiente / en conteo / esperando compañero / diferencias / ok.
- Botón "Iniciar" / "Continuar".

### Pantalla: Conteo en sector

**Dos formas de seleccionar producto:**

| Método | Cuándo usarlo |
|--------|---------------|
| **Buscador dinámico** | Código interno, código de barras o nombre → sugerencias en vivo |
| **Escaneo** | Cámara lee código de barras (cuando la etiqueta es accesible) |

> En depósitos reales el escaneo a veces es difícil por la posición de la mercadería. El buscador dinámico es tan importante como el escaneo.

### Registrar una línea de conteo

```
Tipo:     [ Pallet ▼ ]  [ Caja ]  [ Suelto/pucherio ]
Bultos:   [ 3 ]
Por bulto:[ 112 ]
Ubicación:[ Fondo izq ]  (opcional)
         [ + Agregar línea ]
```

### Vista independiente entre contadores

| Durante el conteo | Al finalizar ambos |
|-------------------|---------------------|
| Cada contador ve **solo sus líneas** | **Ambos** ven la comparación |
| No ve las líneas del otro | Se destacan productos con diferencia |
| No ve totales del otro | Ven totales lado a lado por producto |

### Indicador de ronda

- **Ronda 1:** conteo inicial.
- **Ronda 2+:** reconteo solo de productos con diferencia.

### Botón "Finalicé este sector"

- Bloquea edición de ese contador en esa ronda (supervisor puede desbloquear).
- Si el compañero aún no finalizó → `ESPERANDO_COMPANERO`.
- Cuando **ambos** finalizaron → Comparación A automática.

---

## 8. Comparación A — Entre contadores

### Cuándo

Solo cuando ambos contadores marcaron **"Finalicé este sector"** en la ronda actual. No hay comparación en tiempo real durante el conteo.

### Lógica (por producto, por sector)

```
Para cada producto P contado en el sector S:

  total_1 = suma de total_unidades de todas las líneas
            del Contador 1 (ronda actual)
  total_2 = suma de total_unidades de todas las líneas
            del Contador 2 (ronda actual)

  Si total_1 == total_2  →  Producto OK
  Si total_1 != total_2  →  DIFERENCIA → pasa a reconteo
```

**Importante:** la comparación es por **total del producto**, no línea por línea. Cada contador puede haber organizado las pilas distinto; lo que importa es que el total coincida.

### Producto contado por uno solo

Si Contador 1 tiene líneas para producto X y Contador 2 no → `total_2 = 0` → **diferencia**. Ambos deben recontar ese producto.

### Pantalla de resultado (ambos contadores)

```
Sector: Depósito A — Ronda 1
═══════════════════════════════════════
✓ OK (8 productos)
✗ DIFERENCIAS (2 productos):

  Aceite 1L
    Contador 1 (Juan):  615 u
    Contador 2 (María): 600 u
    Diferencia:         +15 u

  Yerba 500g
    Contador 1 (Juan):  200 u
    Contador 2 (María):  212 u
    Diferencia:         -12 u
═══════════════════════════════════════
[ Iniciar reconteo de productos con diferencia ]
```

---

## 9. Reconteo

Nueva ronda incrementada. Solo aparecen los **productos con diferencia** entre contadores.

### Desglose anterior como referencia

En reconteo se muestra el **desglose de la ronda anterior** de ambos contadores, lado a lado, **solo lectura**. Sirve para ubicar **dónde** pudo estar el error físicamente.

**No es obligatorio repetir el mismo formato de líneas.** Cada contador puede contar como le resulte natural en la nueva ronda:

| Juan (ronda 2) | María (ronda 2) | ¿OK? |
|----------------|-----------------|------|
| 3×112 + puch. 23 + 2×128 | 3×112 + 124 suelto + 2×128 | ✓ (mismo total, distinto desglose) |

Lo que importa es que los **totales coincidan** al finalizar la ronda 2.

### Reglas del reconteo

- El desglose anterior queda visible como **referencia** (historial, no editable).
- Se cargan **líneas nuevas** para la ronda actual (cada uno a su manera).
- El sistema compara solo **totales** otra vez.
- Repetir hasta **diferencia = 0** en todos los productos del sector.

### Ejemplo

```
RONDA 1 — referencia (solo lectura)
──────────────────────────────────────────────────────
  Juan (615 u)              María (600 u)
  1. 3 pallet × 112         1. 3 pallet × 112    ✓
  2. pucherio 23            2. pucherio 10       ✗  ← ir a mirar acá
  3. 2 pallet × 128         3. 2 pallet × 128    ✓
──────────────────────────────────────────────────────
RONDA 2 — contar de nuevo
  Juan: 3×112 + puch.23 + 2×128 = 615 u
  María: 3×112 + 124 suelto + 2×128 = 615 u   ← distinto desglose, OK
```

---

## 10. Comparación B — Contado vs sistema

Cuando **todos los sectores elegidos** están `CERRADO_OK`, el supervisor ejecuta la comparación global.

### Por producto, en todos los sectores del inventario

```
Para cada producto P:

  1. Total global
     cantidad_contada = suma de totales acordados (todos sectores inventariados)
     cantidad_sistema   = suma de stock_lineas (mismos sectores + sectores no inventariados si aplica)
     → Si difieren: FALTANTE o SOBRANTE real

  2. Distribución por sector
     Por cada sector S inventariado:
       desglose_contado[S]  vs  desglose_sistema[S]
     → Si difieren (aunque el total global coincida): REORGANIZACIÓN
```

### Reorganización (muy común)

Por movimientos físicos no registrados, es habitual que **parte** de un producto esté en un sector y **parte** en otro, distinto a lo que dice el sistema:

```
SISTEMA — Aceite 1L (total 815 u)
  Depósito A:  3×112 + puch.23 + 2×128  = 615 u
  Depósito B:  1×200                    = 200 u

CONTADO — Aceite 1L (total 815 u)
  Depósito A:  puch.23 + 1×128          = 151 u   ← quedó menos
  Depósito B:  3×112 + 1×128 + 1×200    = 664 u   ← llegó mercadería desde A

Total global: OK (815 = 815)
Acción: REORGANIZAR — reemplazar stock_lineas en A y B por el desglose contado
```

Los movimientos pueden ser **parciales**: no se mueve el producto entero, solo las pilas que cambiaron de lugar.

### Sectores no incluidos en inventario parcial

Si el stock del sistema figura en un sector **no inventariado** pero el producto se contó en otro sector inventariado, el sistema **propone reubicación** (ej. sacar de Reserva, poner en Depósito B). El supervisor **confirma** explícitamente.

---

## 11. Cierre y ajustes

### Enfoque: híbrido con confirmación del supervisor

Requiere permiso `ajustes.crear` (rol Supervisor / Administrador).

Antes de cerrar, el supervisor puede revisar cada diferencia y elegir por producto:

| Opción | Efecto |
|--------|--------|
| **Aplicar contado** (default) | El stock pasa a lo que contaron ambos contadores |
| **Mantener sistema** | No se ajusta ese producto; queda como estaba al iniciar el inventario |
| **Corregir manualmente** | El supervisor ingresa las líneas finales (útil si ambos contadores omitieron algo) |

Las decisiones se envían en el cierre (`POST .../cerrar` con `decisiones[]`) y quedan registradas en el reporte (`decision_modo`, `total_aplicado`, `desglose_aplicado`).

### Qué se aplica al confirmar

| Situación | Acción |
|-----------|--------|
| Total y desglose coinciden en un sector | **Sin cambio** |
| Total difiere (faltante/sobrante) | **Ajuste de cantidad** + reemplazo de `stock_lineas` en ese sector |
| Total coincide pero desglose/sector difiere | **Reorganización** — reemplazo de `stock_lineas` por desglose contado |
| Producto contado en sector X, sistema lo tenía en sector Y | **Reubicación** — vaciar origen, crear líneas en destino |

En sectores inventariados donde hubo conteo acordado, el desglose contado es la **nueva verdad** para `stock_lineas`.

### Movimientos en el ledger

Cada cambio genera movimiento `AJUSTE_INVENTARIO` con trazabilidad (producto, sector origen/destino, cantidad, usuario, sesión de inventario).

### Snapshot inicial

Al **iniciar** la sesión (`EN_PROGRESO`) se guarda snapshot del stock del sistema (`inventario_snapshot`). El reporte siempre puede mostrar **cómo estaba al arrancar**, independiente de lo que pase después.

---

## 12. Reporte de cierre

El reporte es **obligatorio y persistente**. Es la parte más importante del cierre: documenta cómo era y cómo quedó todo.

### 1. Cabecera

- Nombre de sesión, fecha inicio/cierre.
- Supervisor que cerró.
- Sectores incluidos.
- Contadores por sector.

### 2. Resumen ejecutivo

```
Productos revisados:                    142
Sin cambio (coincidencia exacta):       120
Ajustes de cantidad:                      6
Reorganizaciones (mismo total global):   24
Productos con ambos (cantidad + reorg.):  3
Faltantes (no encontrados):               2
Sobrantes:                                1
Unidades netas ajustadas:              +35
```

### 3. Detalle por producto y sector

| Producto | Sector | Sistema (desglose) | Contado (desglose) | Dif. | Acción |
|----------|--------|--------------------|--------------------|------|--------|
| Aceite 1L | Dep. A | 3×112 + puch.23 + 2×128 = **615** | puch.23 + 1×128 = **151** | −464 | Reorganizado → Dep. B |
| Aceite 1L | Dep. B | 1×200 = **200** | 3×112 + 1×128 + 1×200 = **664** | +464 | Recibido desde Dep. A |
| Yerba 500g | Dep. A | 10×24 = **240** | 10×24 = **240** | 0 | Sin cambio |

### 4. Sección de reorganizaciones

```
REORGANIZACIONES
─────────────────────────────────────────────────────
Aceite 1L
  Depósito A — ANTES:  3×112 + puch.23 + 2×128 (615 u)
  Depósito A — AHORA:  puch.23 + 1×128 (151 u)

  Depósito B — ANTES:  1×200 (200 u)
  Depósito B — AHORA:  3×112 + 1×128 + 1×200 (664 u)
```

### 5. Ajustes aplicados (ledger)

Lista de movimientos `AJUSTE_INVENTARIO` generados.

### 6. Stock final

Desglose de cómo quedó cada producto en cada sector después del cierre.

Exportación PDF/Excel: fase posterior; los datos deben persistirse desde v1.

---

## 13. Tiempo real (WebSockets)

Fase posterior a v1 REST. En v1 puede usarse refresh manual o polling.

| Evento | Quién recibe | Cuándo |
|--------|--------------|--------|
| `sector.companero_finalizo` | Contador que ya terminó | El otro marca finalizado |
| `sector.comparacion_lista` | Ambos contadores del sector | Ambos finalizaron → hay resultado |
| `sector.cerrado_ok` | Contadores + Supervisor | Sin diferencias entre contadores |
| `sector.con_diferencias` | Contadores + Supervisor | Hay productos para reconteo |
| `sesion.lista_cierre` | Supervisor | Todos los sectores OK |

Durante el conteo **no** se emiten las líneas del otro contador (independencia).

---

## 14. Pantallas del supervisor (PC)

### Crear sesión

- Nombre/fecha.
- Selección de sectores (todos o parcial).
- Asignación de 2 contadores por sector.
- Botón "Iniciar inventario" (snapshot + bloqueo).

### Panel de sesión activa

- Banner: inventario en curso.
- Estado por sector (colores).
- Progreso: X de Y sectores cerrados.
- Ver conteos en vivo **por contador por separado** (solo supervisor).
- Ver comparaciones y rondas.

### Cierre global

- Comparación B: diferencias de cantidad + reorganizaciones propuestas.
- Confirmar ajustes.
- Generar y guardar reporte.
- Cerrar sesión → desbloqueo.

---

## 15. Casos especiales

### Contador se desconecta

Líneas parciales guardadas; continúa al reconectar en la misma ronda.

### Mismo producto, varias pilas en el sector

Comportamiento normal: una línea por pila/ubicación. No fusionar.

### Escaneo vs buscador

Si el escaneo falla → buscar por código interno o nombre.

### Sector vacío

Ambos confirman "sector sin productos" explícitamente. Si uno cuenta y el otro dice vacío → diferencia → reconteo.

### Inventario parcial

Solo sectores seleccionados. Comparación B y ajustes aplican a esos sectores. Sectores no incluidos pueden aparecer como origen de reubicaciones propuestas (con confirmación).

### Inventario cancelado

Sesión → `CANCELADA`. Sin cambios en stock. Desbloqueo de movimientos.

---

## 16. Datos que se persisten

| Entidad | Qué guarda |
|---------|------------|
| `inventario_sesiones` | Cabecera, estado, fechas |
| `inventario_sectores` | Sector, contadores, estado, ronda actual |
| `inventario_conteo_lineas` | Cada línea de desglose (producto, contador, ronda, tipo bulto, cantidades, ubicación) |
| `inventario_diferencias` | Diferencias entre contadores y vs sistema (tipo: `ENTRE_CONTADORES`, `CANTIDAD`, `REORGANIZACION`, `FALTANTE`, `SOBRANTE`) |
| `inventario_snapshot` | Stock del sistema al iniciar sesión (desglose por producto/sector) |
| `inventario_reportes` | Reporte final persistente (antes/después, JSON o tablas relacionadas) |

Ver [MODELO-DE-DATOS.md](MODELO-DE-DATOS.md).

---

## 17. Decisiones resueltas

- [x] **D1:** Vistas independientes durante conteo; ambos ven resultado al finalizar sector.
- [x] **D2:** Comparación A solo cuando ambos finalizan el sector.
- [x] **D3:** Reconteo solo productos con diferencia entre contadores.
- [x] **D4:** Ajustes híbridos — sistema propone, supervisor confirma.
- [x] **D5:** Un contador puede estar en varios sectores; no dos activos a la vez.
- [x] **D6:** Cada registro es una línea nueva; no fusionar en pantalla ni al contar el mismo producto dos veces.
- [x] **D7:** Producto no catalogado — rechazar en v1.
- [x] **D8:** No operar con inventario abierto — bloqueo global de movimientos.
- [x] **D9:** Bloquear **todos** los movimientos del depósito mientras `EN_PROGRESO`.
- [x] **D10:** Conteo desde celular por **navegador**; APK después **en paralelo** (no reemplaza la web). Offline de inventario requiere APK (§3.1).
- [x] **D11:** En reconteo, desglose anterior visible como referencia; cada uno puede contar distinto si el total coincide.
- [x] **D12:** Inventario parcial — elegir sectores al crear sesión.
- [x] **D13:** Snapshot del sistema al iniciar sesión.
- [x] **D14:** Al cerrar, reorganizar sectores y líneas según conteo físico (movimientos parciales incluidos).
- [x] **D15:** Reporte persistente antes/después obligatorio al cerrar.
- [x] **D16:** **Modo dual de conectividad:** se elige **con red al PC** u **offline** (alternativa si no hay WiFi en depósito). Ver §3.1.
- [x] **D17:** Offline: ambos bajan catálogo en oficina; cada uno cuenta en base local; **sync entre celulares solo cuando ambos finalizaron** el sector → Comparación A; import al PC para ensamble y Comparación B.
- [x] **Desglose:** pallet × unidades + sueltos en todo el flujo.

---

## 18. Wireframes (celular)

### Conteo — Ronda 1

```
┌──────────────────────────────────┐
│  ← Inventario                    │
│  Sector: Depósito A  ·  Ronda 1  │
├──────────────────────────────────┤
│  [ 🔍 Buscar producto...       ] │
│  [  Escanear código de barras 📷 ]│
├──────────────────────────────────┤
│  Aceite 1L  (PRD-004521)         │
│  ┌────────────────────────────┐  │
│  │ + Nueva línea              │  │
│  │ Tipo: Pallet  Bultos: 3    │  │
│  │ Por bulto: 112             │  │
│  │ Ubicación: Fondo izq       │  │
│  │         [ Agregar ]        │  │
│  └────────────────────────────┘  │
├──────────────────────────────────┤
│  Mis líneas (no se fusionan):    │
│  1. 3 pallet × 112      (336 u)  │
│  2. pucherio              (23 u)  │
│  3. 2 pallet × 128      (256 u)  │
│  ─────────────────────────────   │
│  Total producto: 615 u           │
├──────────────────────────────────┤
│  [ Finalicé este sector ]        │
└──────────────────────────────────┘
```

### Reconteo — Ronda 2

```
┌──────────────────────────────────┐
│  ← Reconteo — Aceite 1L          │
│  Sector: Depósito A  ·  Ronda 2  │
├──────────────────────────────────┤
│  RONDA 1 (referencia)            │
│  Vos (615 u)    Compañero (600 u)│
│  1. 3×112       1. 3×112    ✓    │
│  2. puch. 23    2. puch. 10 ✗    │
│  3. 2×128       3. 2×128    ✓    │
├──────────────────────────────────┤
│  RONDA 2 — contar de nuevo       │
│  + Nueva línea (como quieras)    │
│  Ej: pucherio [ 23 ]             │
│  Ej: 124 suelto (equivale a      │
│      112+12, está bien)          │
├──────────────────────────────────┤
│  [ Finalicé reconteo ]           │
└──────────────────────────────────┘
```

---

## 19. Relación con el resto del sistema

- Desglose compartido → [DESGLOSE-DE-CANTIDADES.md](DESGLOSE-DE-CANTIDADES.md)
- Permisos → [USUARIOS-Y-PERMISOS.md](USUARIOS-Y-PERMISOS.md)
- App móvil → [APP-MOVIL.md](APP-MOVIL.md)
- Producto: código interno + código de barras para buscador.
- Cierre actualiza `stock_lineas` y genera `AJUSTE_INVENTARIO` en `movimientos`.

---

## 20. Fases de implementación sugeridas

| Fase | Entregable |
|------|------------|
| 1 | Tablas + API core (sesiones, sectores, líneas, estados) |
| 2 | Comparación A + rondas de reconteo |
| 3 | Bloqueo global de movimientos |
| 4 | UI supervisor PC |
| 5 | UI conteo responsive (celular navegador) |
| 6 | Comparación B + cierre + ajustes/reorganización |
| 7 | Reporte persistente |
| 8 | WebSockets (opcional, mejora UX online) |
| 9 | APK nativa (online + **modo offline** §3.1: paquete, sync P2P, import) |
| 10 | Offline inventario: preparar/descargar, sync al final de sector, import PC |
