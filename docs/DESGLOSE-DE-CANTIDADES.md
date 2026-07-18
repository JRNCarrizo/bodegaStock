# BodegaStock — Desglose de cantidades

> Concepto transversal del sistema. Aplica a stock, consulta, ingresos, inventario y reportes.

---

## 1. Por qué existe

La distribuidora maneja **cantidades muy grandes**. En un depósito un mismo producto no está en un solo bloque uniforme, sino repartido en varias pilas físicas. Ejemplo real en un sector:

```
Producto "Aceite 1L"
  • Pila 1:  3 pallet × 112 cajas  = 336 u
  • Pila 2:  pucherio suelto         =  23 u
  • Pila 3:  2 pallet × 128 cajas  = 256 u
  ─────────────────────────────────────
  Total en sector:                    615 u
```

Ver solo **615** no alcanza para operar ni para encontrar errores. Hay que ver **cómo está armado** el stock.

---

## 2. Regla de visualización (todo el sistema)

En **consulta, stock, ingresos, inventario, reportes y movimientos**, siempre mostrar:

1. **Líneas de desglose** (cada pila/ubicación por separado, sin fusionar en pantalla)
2. **Total calculado** (suma de todas las líneas, visible pero secundario)

Las líneas **no se suman ni fusionan en la interfaz**. Cada registro es independiente para facilitar ubicar errores.

---

## 3. Estructura de una línea de desglose

| Campo | Descripción | Ejemplo |
|-------|-------------|---------|
| `tipo_bulto` | `PALLET`, `CAJA`, `SUELTO` | PALLET |
| `cantidad_bultos` | Cuántos pallet/cajas hay | 3 |
| `unidades_por_bulto` | Unidades dentro de cada bulto | 112 |
| `cantidad_suelta` | Unidades sueltas (pucherio) | 23 |
| `ubicacion` | Etiqueta opcional del lugar en el sector | "Fondo izquierdo" |
| `total_unidades` | Calculado | 336 / 23 / 256 |

### Fórmulas

```
Si tipo = PALLET o CAJA:
  total_unidades = cantidad_bultos × unidades_por_bulto

Si tipo = SUELTO (pucherio):
  total_unidades = cantidad_suelta
```

### Ejemplos de visualización

| Línea | Cómo se muestra |
|-------|-----------------|
| 3 pallet de 112 | `3 pallet × 112` → 336 u |
| Pucherio | `pucherio: 23` → 23 u |
| 2 pallet de 128 | `2 pallet × 128` → 256 u |

---

## 4. Dónde aplica

| Módulo | Uso del desglose |
|--------|------------------|
| **Stock por sector** | Cada sector tiene N líneas por producto |
| **Consulta** | Ver desglose por sector + total global |
| **Ingresos** | Al ingresar, cargar líneas (ej. "llegaron 3 pallet × 112") |
| **Inventario** | Cada contador registra líneas independientes por ubicación |
| **Reportes** | Mostrar desglose y totales |
| **Movimientos** | Al descontar, aplica regla de sectores de descuento (ver §8) |

---

## 5. Producto — códigos de identificación

Cada producto tiene **dos códigos**:

| Código | Uso |
|--------|-----|
| **Código interno** | Identificador propio de la empresa (ej. `PRD-004521`) |
| **Código de barras** | Escaneo físico (EAN, generado, o manual) |

Ambos sirven para buscar en el **buscador dinámico** (autocompletado por cualquiera de los dos + nombre).

---

## 6. Buscador dinámico (transversal)

En inventario, consulta y resto de módulos móviles, el operador puede localizar un producto de dos formas:

1. **Buscador dinámico:** escribe código interno, código de barras o nombre → sugerencias en vivo
2. **Escaneo por cámara:** lee código de barras (útil cuando el producto es accesible; a veces no lo es por la posición en el depósito)

El buscador es **fundamental** cuando el escaneo es difícil por ubicación de la mercadería.

---

## 7. Stock en sistema vs conteo en inventario

### Stock en sistema (`stock_lineas`)
- Refleja la realidad operativa entre inventarios
- Se actualiza con ingresos, planillas, retornos, roturas, movimientos internos
- Mantiene líneas separadas por ubicación dentro del sector
- Puede quedar **desfasado** respecto a la realidad física (movimientos no registrados)

### Conteo en inventario (`inventario_conteo_lineas`)
- Cada contador registra **sus propias líneas**, independientes
- Misma estructura de desglose (pallet × unidades + sueltos)
- **No se fusionan** las líneas de un contador entre sí en pantalla
- Si el mismo producto se cuenta dos veces en el mismo sector → **dos filas separadas**
- El total por producto (suma de sus líneas) se usa para **Comparación A** (contador vs contador)

### Al cerrar inventario
- **Comparación B:** contado vs sistema (cantidad y distribución por sector)
- Donde difiere: `stock_lineas` se **reemplaza** por el desglose contado acordado
- Incluye **reorganización** parcial entre sectores (muy común en operación diaria)
- Ver flujo completo: [INVENTARIO.md](INVENTARIO.md)

---

## 8. Regla de descuento (planillas, roturas y pérdidas)

> Definido para la versión inicial. Puede refinarse en secciones futuras.

Al descontar stock (carga de planillas, roturas, pérdidas), el sistema elige **de qué sectores** y **de qué líneas** descontar automáticamente.

### Configuración en Gestión de sectores

Cada sector puede marcarse como **sector de descuento**:

| Campo | Descripción |
|-------|-------------|
| `es_sector_descuento` | Si este sector se usa como origen preferido al descontar |
| `prioridad_descuento` | Orden entre sectores marcados (menor número = se descuenta primero) |

Ejemplo de configuración:
```
☑ Depósito despacho    prioridad 1
☑ Camión carga         prioridad 2
☐ Depósito reserva     (no es sector de descuento)
☐ Estantería alta      (no es sector de descuento)
```

### Algoritmo de descuento

Cuando hay que descontar **N unidades** de un producto:

```
PASO 1 — Sectores marcados como descuento
  • Tomar sectores con es_sector_descuento = true
  • Ordenar por prioridad_descuento (ascendente)
  • Descontar de a uno hasta agotar N o quedarse sin stock en esos sectores

PASO 2 — Fallback (si aún falta cubrir)
  • Buscar otros sectores que tengan stock de ese producto
  • Ordenar por cantidad_total ASC (menor stock primero)
  • Seguir descontando hasta completar N

PASO 3 — Validación
  • Si no alcanza el stock total → rechazar operación (stock insuficiente)
```

### Descuento dentro de un sector (líneas)

Dentro del sector elegido, al descontar de `stock_lineas`:

- Descontar primero de las **líneas con menor `total_unidades`** (pucherios y pilas chicas primero)
- Si una línea queda en 0, eliminarla o marcarla vacía
- Actualizar `stock_sector.cantidad_total`

### Ejemplo

Descontar **150 u** de "Aceite 1L":

| Sector | Marcado descuento | Prioridad | Stock |
|--------|:-----------------:|:---------:|------:|
| Despacho | ✓ | 1 | 80 u |
| Camión carga | ✓ | 2 | 200 u |
| Reserva | ✗ | — | 500 u |

```
1. Despacho (prioridad 1): descuenta 80 u  → faltan 70 u
2. Camión carga (prioridad 2): descuenta 70 u  → completo
   (no se tocó Reserva porque alcanzó en sectores marcados)
```

Si faltaran **350 u**:
```
1. Despacho: 80 u   → faltan 270 u
2. Camión: 200 u    → faltan 70 u
3. Fallback → sector con MENOS stock restante:
   Reserva tiene 500 u → descuenta 70 u
```

### Registro en movimientos

Cada descuento parcial genera trazabilidad: de qué sector y qué líneas se descontó (para auditoría y reportes).

### Alcance actual

Aplica a: **carga de planillas**, **roturas** y **pérdidas**.

Otras secciones futuras pueden definir reglas distintas.

---

## 9. ¿Dónde se define tipo y cantidad?

**No en el producto.** El catálogo solo identifica qué es el producto (códigos, nombre, imagen).

Cada **línea** de stock/conteo/ingreso guarda:

| Campo en la línea | Ejemplos |
|-------------------|----------|
| `tipo_bulto` | `PALLET`, `CAJA`, `SUELTO` |
| `cantidad_bultos` | 3 pallet, 2 cajas |
| `unidades_por_bulto` | 112, 128, 24… |
| `cantidad_suelta` | pucherio 23 |

Un mismo producto puede tener **a la vez** en un sector:
- 3 pallet × 112
- 2 caja × 24
- pucherio 23

| Sección | Qué se carga |
|---------|----------------|
| **Ingresos** | Líneas con tipo + bultos + unidades por bulto |
| **Stock** | Queda en `stock_lineas` |
| **Inventario** | Cada contador carga sus líneas |
| **Consulta** | Muestra todas las líneas sin fusionar |
