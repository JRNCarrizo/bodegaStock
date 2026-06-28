# BodegaStock — Módulo de Inventario

> **Documento borrador para iterar.** Refinado con reglas de desglose, buscador dinámico y flujo de comparación acordado.

---

## 1. Propósito

Realizar un **conteo físico** del stock en la bodega, sector por sector, con **dos personas contando en paralelo** desde sus celulares. Cada contador registra **líneas independientes** por ubicación (pallet × unidades, pucherios sueltos). Al terminar ambos un sector, el sistema compara; si hay diferencias, recontean **solo esos productos** hasta dar cero. Al cerrar todos los sectores, se compara el total contado contra el stock del sistema.

Ver también: [DESGLOSE-DE-CANTIDADES.md](DESGLOSE-DE-CANTIDADES.md)

### Objetivos
- Doble conteo independiente con vistas separadas (sin fusionar líneas).
- Desglose visible: pallet × cajas/unidades + sueltos, no solo total.
- Detectar y localizar diferencias por producto.
- Comparación final vs stock del sistema.

---

## 2. Actores

| Actor | Rol | Dispositivo |
|-------|-----|-------------|
| **Supervisor** | Crea sesión, asigna sectores y contadores, supervisa, cierra inventario | PC (Electron) |
| **Contador 1** | Cuenta productos en sector asignado | Celular (APK) |
| **Contador 2** | Cuenta productos en el mismo sector | Celular (APK) |

### Reglas de asignación
- Cada sector tiene exactamente **2 contadores distintos**.
- Contador 1 ≠ Contador 2 en el mismo sector.
- Un contador puede estar en uno o varios sectores (a definir).

---

## 3. Flujo general

```
┌─────────────────────────────────────────────────────────────────┐
│  FASE 0: PREPARACIÓN (Supervisor - PC)                          │
│  • Crear sesión de inventario                                   │
│  • Seleccionar sectores a inventariar                           │
│  • Asignar Contador 1 y Contador 2 por sector                   │
│  • Iniciar sesión → EN_PROGRESO                                 │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  FASE 1: CONTEO INDEPENDIENTE (Contadores - Celular)            │
│  • Cada contador trabaja SOLO en su vista (no ve al otro)       │
│  • Busca producto: buscador dinámico O escaneo                  │
│  • Registra LÍNEAS independientes por ubicación/pila:             │
│      ej. "3 pallet × 112", "pucherio 23", "2 pallet × 128"      │
│  • Las líneas NO se fusionan en pantalla                        │
│  • Mismo producto puede tener varias líneas en el mismo sector  │
│  • Cuando termina → marca "Finalicé este sector"                │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  FASE 2: COMPARACIÓN DEL SECTOR (cuando AMBOS finalizaron)      │
│  • El sistema compara totales por producto (suma de líneas)     │
│  • Contador 1 total vs Contador 2 total, producto por producto  │
│  • AMBOS ven el resultado, destacando dónde hubo diferencia     │
│  • Si todo coincide → sector CERRADO_OK                         │
│  • Si hay diferencias → sector CON_DIFERENCIAS                  │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  FASE 3: RECONTEO (solo productos con diferencia)               │
│  • Nueva ronda                                                   │
│  • Solo recontean los productos que no coincidieron             │
│  • Misma mecánica: líneas independientes con desglose           │
│  • Al finalizar ambos otra vez → nueva comparación              │
│  • Repetir hasta diferencia = 0 en todos los productos          │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  FASE 4: COMPARACIÓN GLOBAL vs SISTEMA (Supervisor - PC)        │
│  • Todos los sectores deben estar CERRADO_OK                    │
│  • Total contado (todos sectores) vs stock general del sistema  │
│  • Reporte de diferencias VS_SISTEMA                            │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  FASE 5: CIERRE Y AJUSTES (Supervisor - PC)                     │
│  • Revisar diferencias globales                                 │
│  • Ajustes propuestos (híbrido: supervisor confirma)            │
│  • Cerrar sesión + reporte final                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Estados

### Sesión de inventario

| Estado | Descripción |
|--------|-------------|
| `ABIERTA` | Creada, configurando sectores/contadores |
| `EN_PROGRESO` | Contadores trabajando |
| `CERRADA` | Finalizada |
| `CANCELADA` | Cancelada sin efecto en stock |

### Sector dentro de la sesión

| Estado | Descripción |
|--------|-------------|
| `PENDIENTE` | Asignado, conteo no iniciado |
| `EN_CONTEO` | Al menos un contador registró líneas |
| `ESPERANDO_COMPANERO` | Un contador finalizó, falta el otro |
| `CON_DIFERENCIAS` | Totales no coinciden en uno o más productos |
| `CERRADO_OK` | Ambos contadores coinciden en todos los productos |

---

## 5. Experiencia del contador (celular)

### Pantalla: Mis sectores
- Lista de sectores asignados
- Estado: pendiente / en conteo / esperando compañero / diferencias / ok
- Botón "Iniciar" / "Continuar"

### Pantalla: Conteo en sector

**Dos formas de seleccionar producto:**

| Método | Cuándo usarlo |
|--------|---------------|
| **Buscador dinámico** | Escribir código interno, código de barras o nombre → sugerencias en vivo |
| **Escaneo** | Cámara lee código de barras (cuando la etiqueta es accesible) |

> En depósitos reales el escaneo a veces es difícil por la posición de la mercadería. El buscador dinámico es tan importante como el escaneo.

### Registrar una línea de conteo

Al seleccionar un producto, el contador agrega una **nueva línea** (no edita ni fusiona las anteriores):

```
Tipo:     [ Pallet ▼ ]  [ Caja ]  [ Suelto/pucherio ]
Bultos:   [ 3 ]
Por bulto:[ 112 ]   ← unidades por pallet/caja
Ubicación:[ Fondo izq ]  (opcional)
         [ + Agregar línea ]
```

Ejemplo de lo que ve el contador (líneas separadas, sin sumar en pantalla):

```
Producto: Aceite 1L  (PRD-004521)
─────────────────────────────────
  Línea 1: 3 pallet × 112        (336 u)
  Línea 2: pucherio 23            ( 23 u)
  Línea 3: 2 pallet × 128        (256 u)
─────────────────────────────────
  Total producto: 615 u   ← visible, pero secundario
```

Si el mismo producto está en **otro lugar del sector**, se agrega **otra línea** (Línea 4, 5…). No se mezclan con las anteriores.

### Vista independiente entre contadores

| Durante el conteo | Al finalizar ambos |
|-------------------|---------------------|
| Cada contador ve **solo sus líneas** | **Ambos** ven la comparación |
| No ve las líneas del otro | Se destacan productos con diferencia |
| No ve totales del otro | Ven totales lado a lado por producto |

### Indicador de ronda
- Ronda 1: conteo inicial
- Ronda 2+: reconteo **solo de productos con diferencia**

### Botón "Finalicé este sector"
- Bloquea edición de ese contador en esa ronda (supervisor puede desbloquear)
- Si el compañero aún no finalizó → estado `ESPERANDO_COMPANERO`
- Cuando **ambos** finalizaron → el sistema ejecuta la comparación automáticamente

---

## 6. Comparación entre contadores

### Cuándo se compara
**Solo cuando ambos contadores marcaron "Finalicé este sector"** en la ronda actual.

No hay comparación en tiempo real durante el conteo (vistas independientes).

### Lógica (por producto, por sector)

```
Para cada producto P contado en el sector S:

  total_1 = suma de total_unidades de todas las líneas
            del Contador 1 (ronda actual)
  total_2 = suma de total_unidades de todas las líneas
            del Contador 2 (ronda actual)

  Si total_1 == total_2:
    → Producto OK en este sector

  Si total_1 != total_2:
    → DIFERENCIA
    → Mostrar a AMBOS contadores:
        "Aceite 1L: Vos contaste 615, tu compañero 600"
    → Producto pasa a lista de reconteo
```

**Nota:** la comparación es por **total del producto**, no línea por línea entre contadores (cada uno puede haber organizado las pilas distinto). Lo importante es que el total coincida.

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

### Reconteo

Nueva ronda incrementada. Solo aparecen los **productos con diferencia**.

#### Desglose anterior visible (verificación)

En reconteo se muestra el **desglose de la ronda anterior** del producto con diferencia. Funciona como una **verificación guiada**:

1. Ambos contadores ven el desglose previo (el suyo y el del compañero, lado a lado)
2. Recorren línea por línea comparando contra lo que ven físicamente
3. Identifican **cuál línea o pila** es la que está distinta
4. **Solo modifican** la línea donde encontraron el error; el resto se mantiene igual

Ejemplo — reconteo de "Aceite 1L" (diferencia +15 u):

```
Ronda 1 — desglose anterior (solo lectura, referencia)
──────────────────────────────────────────────────────
  Juan (615 u)              María (600 u)
  1. 3 pallet × 112         1. 3 pallet × 112
  2. pucherio 23            2. pucherio 10      ← posible error aquí
  3. 2 pallet × 128         3. 2 pallet × 128
──────────────────────────────────────────────────────
Ronda 2 — corregir
  Juan: mantiene líneas 1 y 3, revisa línea 2
  María: corrige línea 2 → pucherio 23
```

**Reglas del reconteo:**
- El desglose anterior queda visible como referencia (no editable directamente; es historial)
- Se cargan **nuevas líneas** para la ronda 2; pueden copiarse las correctas y ajustar solo la diferente
- Al finalizar ambos → nueva comparación de totales
- Repetir hasta **diferencia = 0**

### Producto contado por uno solo
- Si Contador 1 tiene líneas para producto X y Contador 2 no → total_2 = 0 → **diferencia**
- Ambos deben recontar ese producto

---

## 7. Comparación global vs sistema

Cuando **todos los sectores** están `CERRADO_OK`:

```
Para cada producto P (en sectores inventariados):

  cantidad_contada = suma de totales acordados
                     (todos sectores, última ronda OK)

  cantidad_sistema = suma de stock_lineas del sistema
                     en esos sectores

  diferencia = cantidad_contada - cantidad_sistema
```

### Reporte de cierre (con desglose)

| Producto | Sector | Contado (desglose) | Sistema (desglose) | Total contado | Total sistema | Dif. |
|----------|--------|--------------------|--------------------|---------------|---------------|------|
| Aceite 1L | Dep. A | 3×112 + 23 + 2×128 | 3×112 + 20 + 2×128 | 615 | 612 | +3 |

El supervisor ve desglose y totales.

---

## 8. Ajustes post-inventario

**Enfoque híbrido (recomendado):** el sistema propone ajustes por diferencia VS_SISTEMA; el supervisor confirma. Requiere permiso `ajustes.crear`.

Cada ajuste genera movimiento `AJUSTE_INVENTARIO` y actualiza `stock_lineas`.

---

## 9. Tiempo real (WebSockets)

| Evento | Quién recibe | Cuándo |
|--------|--------------|--------|
| `sector.companero_finalizo` | Contador que ya terminó | El otro marca finalizado |
| `sector.comparacion_lista` | Ambos contadores del sector | Ambos finalizaron → hay resultado |
| `sector.cerrado_ok` | Contadores + Supervisor | Sin diferencias |
| `sector.con_diferencias` | Contadores + Supervisor | Hay productos para reconteo |
| `sesion.lista_cierre` | Supervisor | Todos los sectores OK |

Durante el conteo **no** se emiten las líneas del otro contador (independencia).

---

## 10. Pantallas del supervisor (PC)

### Crear sesión
- Nombre/fecha, sectores, contadores por sector

### Panel de sesión activa
- Estado por sector (colores)
- Progreso: X de Y sectores cerrados
- Ver conteos en vivo **por contador por separado** (solo supervisor)
- Ver comparaciones y rondas

### Cierre global
- Diferencias vs sistema con desglose
- Ajustes propuestos → confirmar
- Reporte final exportable

---

## 11. Casos especiales

### Contador se desconecta
- Líneas parciales guardadas; continúa al reconectar

### Mismo producto, varias ubicaciones en el sector
- **Comportamiento normal:** una línea por pila/ubicación
- No fusionar; facilita encontrar dónde está el error en reconteo

### Escaneo vs buscador
- Si escaneo falla por posición del producto → buscar por código interno o nombre

### Sector vacío
- Ambos confirman "sector sin productos" explícitamente
- Si uno cuenta y el otro dice vacío → diferencia

### Inventario parcial
- Solo sectores seleccionados; comparación vs sistema solo en esos sectores

---

## 12. Datos que se persisten

| Entidad | Qué guarda |
|---------|------------|
| `inventario_sesiones` | Cabecera |
| `inventario_sectores` | Sector, contadores, estado |
| `inventario_conteo_lineas` | Cada línea de desglose (producto, contador, ronda, tipo bulto, cantidades, ubicación) |
| `inventario_diferencias` | Diferencias entre contadores y vs sistema |

Ver [MODELO-DE-DATOS.md](MODELO-DE-DATOS.md)

---

## 13. Decisiones resueltas

- [x] **D1:** Vistas independientes durante conteo; **ambos ven resultado** al finalizar sector
- [x] **D2:** Comparación **solo cuando ambos finalizan** el sector
- [x] **D3:** Reconteo **solo productos con diferencia**
- [x] **D6:** Cada registro es una **línea nueva** (no suma automática en pantalla)
- [x] **Desglose:** pallet × unidades + sueltos en todo el flujo de inventario

## 14. Decisiones pendientes

- [ ] **D4:** Ajustes automáticos, manuales o híbridos (recomendado: híbrido)
- [ ] **D5:** ¿Un contador en varios sectores simultáneamente?
- [ ] **D7:** ¿Producto no catalogado — alta on-the-fly o rechazar?
- [ ] **D8:** ¿Inventariar con operaciones del día abiertas?
- [ ] **D9:** ¿Bloquear movimientos en sectores con inventario activo?
- [x] **D11:** En reconteo se muestra desglose anterior; verificación línea a línea hasta encontrar y corregir la diferencia

---

## 15. Wireframe textual (celular — reconteo)

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
│  RONDA 2 — corregir              │
│  Línea 2 (pucherio):             │
│  Cantidad: [ 23 ]  [ Confirmar ] │
│  Líneas 1 y 3: sin cambios       │
├──────────────────────────────────┤
│  [ Finalicé reconteo ]           │
└──────────────────────────────────┘
```

---

## 16. Wireframe textual (celular — conteo)

```
┌──────────────────────────────────┐
│  ← Inventario                    │
│  Sector: Depósito A  ·  Ronda 1  │
├──────────────────────────────────┤
│  [ 🔍 Buscar producto...       ] │  ← buscador dinámico
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

---

## 17. Relación con el resto del sistema

- Desglose compartido con stock, consulta e ingresos → [DESGLOSE-DE-CANTIDADES.md](DESGLOSE-DE-CANTIDADES.md)
- Producto con **código interno** + código de barras para buscador
- Ajustes post-inventario actualizan `stock_lineas` del sistema
