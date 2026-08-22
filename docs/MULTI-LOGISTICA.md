# Multi-logística — Esmeralda y NAKBE

> **Estado: planificado, sin implementar** (agosto 2026).  
> Documento de diseño acordado con logística / administración.  
> Panorama: [ESTADO-ACTUAL.md](ESTADO-ACTUAL.md) · Modelo actual: [MODELO-DE-DATOS.md](MODELO-DE-DATOS.md)

---

## 1. Motivación

Hoy el sistema está pensado para **una sola bodega** (“Bodega Esmeralda”): todos los sectores, camioneros, documentos e inventarios conviven en el mismo ámbito operativo.

En planta existe además una **mini-bodega** llamada **NAKBE**, con **otros dueños**, dentro del mismo edificio que Esmeralda pero con operación **casi independiente**:

- Stock y movimientos que **no deben mezclarse** con Esmeralda.
- Sectores y camioneros **propios** de cada logística.
- Reportes **por separado**, sin consolidado entre ambas.
- Usuarios operativos asignados a **una u otra** logística.
- Un **admin principal** (encargado general) que puede **elegir** en cuál operar.

No se trata de duplicar la aplicación ni de dos bases de datos: es **un solo ControlStock** con **dos contextos operativos** (“logísticas”) bien aislados en vistas y datos operativos.

---

## 2. Concepto: logística activa

```text
                    ControlStock (una instalación, una base)
                              │
              ┌───────────────┴───────────────┐
              │                               │
         Esmeralda                         NAKBE
    (logística principal)            (mini-bodega)
              │                               │
    sectores, camioneros,             sectores, camioneros,
    stock, planillas,                 stock, planillas,
    ingresos, inventario,             ingresos, inventario,
    reportes…                         reportes…
    (solo lo de Esmeralda)            (solo lo de NAKBE)
```

El **encargado general** elige **Esmeralda** o **NAKBE** (selector en UI). A partir de ahí, **todas las pantallas operativas** muestran y modifican **solo datos de esa logística**.

Los usuarios operativos **no cambian** de logística: entran fijados a la suya.

---

## 3. Qué es compartido vs independiente

| Ámbito | Compartido | Independiente por logística |
|--------|------------|------------------------------|
| **Productos** (catálogo, códigos, barras, imágenes) | ✓ Un solo ABM; altas igual que hoy (admin principal) | — |
| **Admin principal** | ✓ Mismo usuario; acceso a **ambas** logísticas | — |
| **Sectores** | — | ✓ Cada logística crea y gestiona los suyos |
| **Camioneros y vehículos** | — | ✓ Distintos en Esmeralda y NAKBE |
| **Stock** (`stock_sector`, `stock_lineas`) | — | ✓ Vía sectores de cada logística |
| **Ingresos, planillas, retornos, roturas, movimientos** | — | ✓ Listados, altas e historial filtrados |
| **Inventario** (sesiones, conteos, cierres) | — | ✓ Sesiones e historial por logística |
| **Consulta** | — | ✓ Solo stock de sectores de la logística activa |
| **Reportes del día / por rango** | — | ✓ **Dos reportes distintos**; sin consolidado |
| **Usuarios operativos** | — | ✓ Asignación Esmeralda **o** NAKBE |

### Catálogo de productos

- **Un solo catálogo** para toda la empresa.
- Hay productos que existen en **ambas** logísticas y otros **solo en una** (stock distinto o cero en el otro lado).
- **No** se filtra el ABM de productos por logística: el admin principal da de alta una vez.
- La separación operativa es **dónde hay stock** y **qué documentos se crearon**, no duplicar fichas de producto.

### Regla de oro

**Ninguna operación en Esmeralda puede leer, listar, descontar ni mover stock de NAKBE, y viceversa**, salvo que en el futuro se defina explícitamente un flujo especial (transferencia entre logísticas — **fuera de alcance inicial**).

---

## 4. Usuarios y permisos

| Perfil | Logística | Comportamiento |
|--------|-----------|----------------|
| **Admin principal / encargado general** | **Ambas** | Selector Esmeralda \| NAKBE; opera en la elegida |
| **Operador Esmeralda** | Solo Esmeralda | Sin selector; nunca ve datos de NAKBE |
| **Operador NAKBE** | Solo NAKBE | Sin selector; nunca ve datos de Esmeralda |

Los **permisos por sección** (ingresos, inventario, planillas, etc.) siguen igual que hoy; se suma la dimensión **logística asignada**.

Propuesta de campo en usuario:

- `logistica_id` → FK a `logisticas`, nullable.
- `null` o valor especial **`ambas`** → admin principal (puede cambiar contexto).

---

## 5. Comportamiento por módulo

Misma UI y mismos flujos que hoy; **filtro por logística activa** en API y pantallas.

| Módulo | Esmeralda activo | NAKBE activo |
|--------|------------------|--------------|
| **Sectores** | ABM solo sectores Esmeralda | ABM solo sectores NAKBE |
| **Camioneros** | Solo camioneros Esmeralda | Solo camioneros NAKBE |
| **Consulta** | Stock en sectores Esmeralda | Stock en sectores NAKBE |
| **Ingresos** | Destinos = sectores Esmeralda | Destinos = sectores NAKBE |
| **Planillas** | Camioneros + descuento stock Esmeralda | Idem NAKBE |
| **Retornos / Roturas** | Sectores y stock Esmeralda | Sectores y stock NAKBE |
| **Movimientos internos** | Origen/destino dentro de Esmeralda | Origen/destino dentro de NAKBE |
| **Inventario** | Sesiones y sectores Esmeralda | Sesiones y sectores NAKBE |
| **Reportes** | Solo movimientos/documentos Esmeralda | Solo NAKBE |
| **Productos** | Catálogo global (admin) | Igual — sin filtro por logística |

### Cambio de logística (admin)

Al pasar de Esmeralda a NAKBE (o al revés):

- Cambian listados, stock visible, sesiones de inventario abiertas mostradas, borradores scoped al contexto si aplica.
- **No** se mezclan totales ni historiales.
- Borradores locales (p. ej. ingreso en curso) deberían quedar asociados al contexto en el que se crearon.

---

## 6. UI propuesta

### Selector de logística

- Ubicación candidata: **cabecera** (junto al nombre de la logística en sidebar) y/o **Configuración**.
- Visible solo para usuarios con acceso a **ambas**.
- Persistencia: sesión de usuario / preferencia en servidor (no solo `localStorage` del navegador) para coherencia PC + celular.

### Etiquetado

- Sidebar: dejar de mostrar texto fijo “Bodega Esmeralda”; mostrar **logística activa** (Esmeralda o NAKBE).
- Listados y exportaciones: opcional prefijo o filtro explícito en título (ej. “Inventario — NAKBE”).

---

## 7. Modelo de datos (borrador)

### Nueva entidad: `logisticas`

| Campo | Tipo | Notas |
|-------|------|-------|
| id | PK | |
| codigo | string | ej. `ESMERALDA`, `NAKBE` |
| nombre | string | ej. “Esmeralda”, “NAKBE” |
| activo | boolean | |
| created_at | datetime | |

Seed inicial: **Esmeralda**, **NAKBE**.

### Columnas `logistica_id` (FK → `logisticas`)

| Tabla / entidad | Notas |
|-----------------|-------|
| `sectores` | Obligatorio; define a qué logística pertenece el sector |
| `camioneros` | Obligatorio |
| `ingresos` | Hereda vía sectores o columna directa en cabecera |
| `planillas`, `retornos`, `roturas`, `movimientos_internos` | Cabecera de documento |
| `inventario_sesiones` | Sesión scoped a una logística |
| `usuarios` | Asignación operativa (nullable / ambas para admin) |

**Stock:** no requiere `logistica_id` directo si todo stock cuelga de `sectores.logistica_id`.

**Productos:** sin `logistica_id` (catálogo global).

### API

- Header o claim de contexto: `X-Logistica-Id` o logística en JWT / sesión server-side.
- Middleware valida: usuario solo puede pedir logísticas permitidas.
- Todas las rutas operativas filtran por logística activa.

Migración de datos existentes: todos los sectores y camioneros actuales → **`logistica_id = Esmeralda`**.

---

## 8. Fases de implementación sugeridas

| Fase | Alcance | Objetivo |
|------|---------|----------|
| **1** | `logisticas`, `sectores.logistica_id`, selector admin, filtro sectores | Base del concepto |
| **2** | `camioneros.logistica_id`, consulta filtrada | Catálogos operativos separados |
| **3** | Inventario + reportes por logística | Primera necesidad operativa NAKBE |
| **4** | Ingresos, planillas, retornos, roturas, movimientos | Paridad operativa completa |
| **5** | `usuarios.logistica_id`, ocultar selector a operadores | Aislamiento por usuario |
| **6** | APK / offline inventario respetando logística | Móvil alineado |

Prioridad negociada con planta: **inventario en NAKBE primero**; resto de módulos en orden de uso real.

---

## 9. Fuera de alcance (inicial)

- Reportes **consolidados** Esmeralda + NAKBE.
- Transferencias automáticas de stock **entre** logísticas (podría ser módulo futuro).
- Segunda instalación / segunda base SQLite.
- Catálogos de productos distintos por logística.
- Multi-tenant SaaS / varias empresas.

---

## 10. Preguntas abiertas

| # | Tema | Estado |
|---|------|--------|
| 1 | Nombre oficial de la mini-bodega | **Confirmado: NAKBE** |
| 2 | ¿NAKBE = un sector o varios sectores propios? | Pendiente |
| 3 | ¿Quién da de alta productos además del admin principal? | Probablemente solo admin (igual que hoy) |
| 4 | ¿Usuarios “ambas” además del admin principal? | Pendiente |
| 5 | ¿Configuración de red / QR compartida o por logística? | Probablemente compartida (una PC servidor) |

---

## 11. Resumen en una frase

**Un ControlStock, dos logísticas paralelas (Esmeralda y NAKBE): catálogo de productos y admin principal compartidos; sectores, camioneros, stock, documentos, inventarios y reportes totalmente separados según la logística activa o asignada al usuario.**

---

*Documento creado a partir de relevamiento con Jorge / logística — agosto 2026. Nombre NAKBE confirmado agosto 2026.*
