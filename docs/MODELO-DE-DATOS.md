# BodegaStock — Modelo de datos

> Esquema implementado en SQLite (ControlStock / BodegaStock **v0.3.7**).  
> Describe las entidades persistidas en el servidor; las exportaciones Excel son agregaciones de consulta y **no** agregan tablas.

---

## Diagrama de relaciones (simplificado)

```
usuarios ──────────────┐
                       │
camioneros ────────┐   │
                   │   │
productos          │   │
    │              │   │
    ▼              ▼   ▼
stock_sector ◄── sectores
    │
    └── stock_lineas (desglose: pallet × u + sueltos)
    │
    │ (cambios vía)
    ▼
movimientos ◄── documentos (ingresos, planillas, retornos, etc.)

inventario_sesiones
    ├── inventario_snapshot (+ inventario_snapshot_lineas)
    ├── inventario_sectores
    │       └── inventario_conteo_lineas (por contador, independientes)
    ├── inventario_diferencias
    └── inventario_reportes
```

---

## Entidades

### `usuarios`

| Campo | Tipo | Notas |
|-------|------|-------|
| id | PK | |
| username | string | Único, login |
| password_hash | string | |
| nombre | string | Nombre visible |
| rol_id | FK → roles | Plantilla de permisos |
| activo | boolean | |
| created_at | datetime | |
| updated_at | datetime | |

---

### `roles`

Plantillas de permisos predefinidas.

| Campo | Tipo | Notas |
|-------|------|-------|
| id | PK | |
| nombre | string | ej. "Operador", "Supervisor" |
| descripcion | string | |

---

### `permisos`

Catálogo de permisos granulares por sección.

| Campo | Tipo | Notas |
|-------|------|-------|
| id | PK | |
| seccion | string | ej. "ingresos", "inventario" |
| accion | string | ej. "ver", "crear", "verificar" |
| codigo | string | Único, ej. `ingresos.crear` |

---

### `rol_permisos`

| Campo | Tipo |
|-------|------|
| rol_id | FK → roles |
| permiso_id | FK → permisos |

---

### `usuario_permisos` (opcional)

Permisos extra o revocados respecto al rol base.

| Campo | Tipo | Notas |
|-------|------|-------|
| usuario_id | FK | |
| permiso_id | FK | |
| concedido | boolean | true = extra, false = revocado |

---

### `productos`

| Campo | Tipo | Notas |
|-------|------|-------|
| id | PK | |
| codigo_interno | string | Único, identificador de la empresa (ej. `PRD-004521`) |
| codigo_barras | string | Único, puede ser generado o escaneado |
| nombre | string | |
| descripcion | string | Opcional |
| imagen_path | string | Ruta al archivo de imagen |
| activo | boolean | |
| created_at | datetime | |
| updated_at | datetime | |

**Búsqueda:** por `codigo_interno`, `codigo_barras` o `nombre` (buscador dinámico).

Ver desglose de stock: [DESGLOSE-DE-CANTIDADES.md](DESGLOSE-DE-CANTIDADES.md).

---

### `sectores`

| Campo | Tipo | Notas |
|-------|------|-------|
| id | PK | |
| codigo | string | Único, ej. "DEP-A" |
| nombre | string | |
| descripcion | string | Opcional |
| es_sector_descuento | boolean | Si es origen preferido al descontar (planillas, roturas) |
| prioridad_descuento | int | Nullable. Menor = se descuenta primero entre sectores marcados |
| activo | boolean | |
| created_at | datetime | |

---

### `stock_sector`

Cabecera de stock de un producto en un sector. El detalle está en `stock_lineas`.

| Campo | Tipo | Notas |
|-------|------|-------|
| id | PK | |
| producto_id | FK → productos | |
| sector_id | FK → sectores | |
| cantidad_total | decimal | Suma calculada de `stock_lineas`; ≥ 0 |
| updated_at | datetime | |

**Índice único:** `(producto_id, sector_id)`

---

### `stock_lineas`

Cada línea es una pila/ubicación independiente dentro del sector. **No se fusionan en UI.**

| Campo | Tipo | Notas |
|-------|------|-------|
| id | PK | |
| stock_sector_id | FK → stock_sector | |
| tipo_bulto | enum | `PALLET`, `CAJA`, `SUELTO` |
| cantidad_bultos | int | Nullable si SUELTO |
| unidades_por_bulto | int | Nullable si SUELTO |
| cantidad_suelta | decimal | Solo para SUELTO (pucherio) |
| ubicacion | string | Etiqueta opcional ("Fondo izq") |
| total_unidades | decimal | Calculado: bultos × unidades + suelta |
| orden | int | Orden de visualización |
| created_at | datetime | |
| updated_at | datetime | |

**Ejemplo:** 3 filas para un producto en un sector: `3×112`, `23 suelto`, `2×128`.

---

### `camioneros`

| Campo | Tipo | Notas |
|-------|------|-------|
| id | PK | |
| codigo | string | Opcional, único |
| nombre | string | |
| telefono | string | Opcional |
| observaciones | string | Opcional |
| activo | boolean | |
| created_at |datetime | |

---

### `movimientos`

Ledger central. **Toda modificación de stock pasa por aquí.**

| Campo | Tipo | Notas |
|-------|------|-------|
| id | PK | |
| tipo | enum | Ver tipos abajo |
| producto_id | FK → productos | |
| cantidad | decimal | Siempre positivo; el tipo define signo |
| sector_origen_id | FK → sectores | Nullable según tipo |
| sector_destino_id | FK → sectores | Nullable según tipo |
| documento_tipo | string | "ingreso", "planilla", "retorno", etc. |
| documento_id | int | ID del documento origen |
| usuario_id | FK → usuarios | Quién realizó la acción |
| camionero_id | FK → camioneros | Nullable |
| observacion | string | Opcional |
| created_at | datetime | |

#### Tipos de movimiento

| Tipo | Efecto | sector_origen | sector_destino |
|------|--------|:-------------:|:--------------:|
| `INGRESO` | +stock | — | ✓ |
| `PLANILLA` | −stock | ✓ | — |
| `RETORNO` | +stock | — | ✓ |
| `ROTURA` | −stock | ✓ | — |
| `PERDIDA` | −stock | ✓ | — |
| `MOVIMIENTO_INTERNO` | −origen, +destino | ✓ | ✓ |
| `AJUSTE_INVENTARIO` | ±stock | —/✓ | —/✓ |

---

## Documentos (cabeceras de operaciones)

Cada módulo operativo tiene una cabecera con ítems.

### `ingresos`

| Campo | Tipo | Notas |
|-------|------|-------|
| id | PK | |
| numero_remito | string | |
| transporte | string | Nombre del transporte |
| observacion | string | |
| camionero_id | FK | Opcional |
| sector_destino_id | FK → sectores | |
| usuario_id | FK → usuarios | |
| created_at | datetime | |

### `ingreso_items`

| Campo | Tipo |
|-------|------|
| id | PK |
| ingreso_id | FK |
| producto_id | FK |
| cantidad | decimal |

---

### `planillas`

| Campo | Tipo | Notas |
|-------|------|-------|
| id | PK | |
| numero | string | Referencia de planilla |
| camionero_id | FK → camioneros | |
| sector_origen_id | FK → sectores | |
| usuario_id | FK → usuarios | |
| created_at | datetime | |

### `planilla_items`

| Campo | Tipo |
|-------|------|
| id | PK |
| planilla_id | FK |
| producto_id | FK |
| cantidad | decimal |

---

### `retornos`

| Campo | Tipo | Notas |
|-------|------|-------|
| id | PK | |
| camionero_id | FK → camioneros | |
| planilla_id | FK → planillas | Opcional |
| sector_destino_id | FK → sectores | |
| estado | enum | `PENDIENTE`, `VERIFICADO` |
| cargado_por_id | FK → usuarios | |
| verificado_por_id | FK → usuarios | Nullable hasta verificar |
| observacion_carga | string | |
| observacion_verificacion | string | |
| ingreso_directo | INTEGER | DEFAULT 0. `1` si entró sin doble verificación (según `app_settings`) |
| created_at | datetime | |
| verificado_at | datetime | |

### `retorno_items`

| Campo | Tipo |
|-------|------|
| id | PK |
| retorno_id | FK |
| producto_id | FK |
| cantidad | decimal |

---

### `roturas_perdidas`

| Campo | Tipo | Notas |
|-------|------|-------|
| id | PK | |
| tipo | enum | `ROTURA`, `PERDIDA` |
| sector_origen_id | FK | |
| motivo | string | |
| observacion | string | |
| usuario_id | FK | |
| created_at | datetime | |

### `rotura_perdida_items`

| Campo | Tipo |
|-------|------|
| id | PK |
| rotura_perdida_id | FK |
| producto_id | FK |
| cantidad | decimal |

---

### `movimientos_internos`

| Campo | Tipo | Notas |
|-------|------|-------|
| id | PK | |
| tipo | enum | `ENVIAR`, `RECIBIR` |
| sector_origen_id | FK | |
| sector_destino_id | FK | |
| observacion | string | |
| estado | enum | `PENDIENTE`, `COMPLETADO`, `CANCELADO` |
| creado_por_id | FK → usuarios | Quién inició el movimiento |
| recibido_por_id | FK → usuarios | Nullable hasta completar |
| ingreso_directo | INTEGER | DEFAULT 0. `1` si se completó sin doble verificación |
| created_at | datetime | |

### `movimiento_interno_items`

| Campo | Tipo |
|-------|------|
| id | PK |
| movimiento_interno_id | FK |
| producto_id | FK |
| cantidad | decimal |

---

## Inventario (ver [INVENTARIO.md](INVENTARIO.md) para flujo completo)

### `inventario_sesiones`

| Campo | Tipo | Notas |
|-------|------|-------|
| id | PK | |
| nombre | string | ej. "Inventario Junio 2026" |
| estado | enum | `ABIERTA`, `EN_PROGRESO`, `CERRADA`, `CANCELADA` |
| creado_por_id | FK → usuarios | Supervisor |
| cerrado_por_id | FK → usuarios | Nullable hasta cierre |
| fecha_inicio | datetime | Nullable hasta iniciar |
| fecha_cierre | datetime | Nullable |
| observacion | string | |
| created_at | datetime | |

### `inventario_sectores`

Sectores incluidos en una sesión, con contadores asignados.

| Campo | Tipo | Notas |
|-------|------|-------|
| id | PK | |
| sesion_id | FK → inventario_sesiones | |
| sector_id | FK → sectores | |
| contador_1_id | FK → usuarios | |
| contador_2_id | FK → usuarios | Distinto de contador_1 |
| estado | enum | `PENDIENTE`, `EN_CONTEO`, `ESPERANDO_COMPANERO`, `CON_DIFERENCIAS`, `CERRADO_OK` |
| ronda_actual | int | 1 = conteo inicial, 2+ = reconteos |
| contador_1_finalizo | boolean | Si finalizó la ronda actual |
| contador_2_finalizo | boolean | Si finalizó la ronda actual |

### `inventario_conteo_lineas`

Cada línea de conteo es **independiente** (no se fusiona en UI). Misma estructura que `stock_lineas`.

| Campo | Tipo | Notas |
|-------|------|-------|
| id | PK | |
| inventario_sector_id | FK | |
| producto_id | FK | |
| contador_id | FK → usuarios | Contador 1 o 2 |
| ronda | int | 1 = primer conteo, 2+ = reconteos |
| tipo_bulto | enum | `PALLET`, `CAJA`, `SUELTO` |
| cantidad_bultos | int | Nullable si SUELTO |
| unidades_por_bulto | int | Nullable si SUELTO |
| cantidad_suelta | decimal | Pucherio |
| ubicacion | string | Opcional |
| total_unidades | decimal | Calculado |
| orden | int | Orden en pantalla |
| created_at | datetime | |

**Comparación A:** por producto en el sector, suma de `total_unidades` de todas las líneas de cada contador en `ronda_actual`.

### `inventario_diferencias`

Diferencias detectadas entre contadores (Comparación A) o vs sistema (Comparación B).

| Campo | Tipo | Notas |
|-------|------|-------|
| id | PK | |
| sesion_id | FK | |
| inventario_sector_id | FK | Nullable si es diff global del producto |
| producto_id | FK | |
| tipo | enum | `ENTRE_CONTADORES`, `CANTIDAD`, `REORGANIZACION`, `FALTANTE`, `SOBRANTE` |
| sector_id | FK → sectores | Nullable; sector afectado |
| sector_origen_id | FK → sectores | Nullable; para reubicaciones |
| sector_destino_id | FK → sectores | Nullable; para reubicaciones |
| cantidad_contador_1 | decimal | Nullable |
| cantidad_contador_2 | decimal | Nullable |
| cantidad_contada | decimal | Nullable; total acordado |
| cantidad_sistema | decimal | Nullable |
| diferencia | decimal | Nullable; contada − sistema |
| desglose_sistema | text/json | Snapshot del desglose antes |
| desglose_contado | text/json | Desglose acordado al contar |
| resuelta | boolean | |
| created_at | datetime | |

### `inventario_snapshot`

Stock del sistema al **iniciar** la sesión (`EN_PROGRESO`). Base para el reporte "antes".

| Campo | Tipo | Notas |
|-------|------|-------|
| id | PK | |
| sesion_id | FK → inventario_sesiones | |
| producto_id | FK | |
| sector_id | FK | |
| cantidad_total | decimal | |
| created_at | datetime | |

### `inventario_snapshot_lineas`

Desglose del snapshot inicial (copia de `stock_lineas` al iniciar).

| Campo | Tipo | Notas |
|-------|------|-------|
| id | PK | |
| snapshot_id | FK → inventario_snapshot | |
| tipo_bulto | enum | `PALLET`, `CAJA`, `SUELTO` |
| cantidad_bultos | int | Nullable |
| unidades_por_bulto | int | Nullable |
| cantidad_suelta | decimal | Nullable |
| ubicacion | string | Nullable |
| total_unidades | decimal | |
| orden | int | |

### `inventario_reportes`

Reporte persistente generado al cerrar la sesión.

| Campo | Tipo | Notas |
|-------|------|-------|
| id | PK | |
| sesion_id | FK → inventario_sesiones | Único por sesión |
| cerrado_por_id | FK → usuarios | |
| resumen | text/json | Totales: coincidencias, ajustes, reorganizaciones, etc. |
| detalle | text/json | Por producto/sector: antes, después, acción |
| ajustes_aplicados | text/json | Movimientos generados |
| created_at | datetime | |

---

## Snapshots para reportes (opcional)

### `stock_snapshot_diario`

Para calcular stock inicial/final del día sin recalcular todo el historial.

| Campo | Tipo | Notas |
|-------|------|-------|
| id | PK | |
| fecha | date | |
| producto_id | FK | |
| sector_id | FK | |
| cantidad | decimal | Stock al cierre del día |

Job nocturno o cálculo bajo demanda al generar reportes.

---

## Configuración

### `app_settings`

Configuración clave/valor de la aplicación (doble verificación y futuras opciones).

| Campo | Tipo | Notas |
|-------|------|-------|
| clave | TEXT PK | ej. `retornos_doble_verificacion`, `movimientos_doble_verificacion` |
| valor | TEXT | Para esas claves: `'1'` (activo) o `'0'` (inactivo) |
| updated_at | TEXT | Timestamp de última modificación |

---

## Notas de implementación

1. **Transacciones:** confirmar documento + actualizar `stock_sector` + `stock_lineas` + insertar `movimientos` en una sola transacción DB.
2. **Stock negativo:** validar antes de confirmar; rechazar si resultaría `cantidad_total` < 0.
3. **Desglose:** `stock_sector.cantidad_total` = suma de `stock_lineas.total_unidades`; recalcular al cambiar líneas.
4. **Concurrencia:** usar locks o transacciones serializables en operaciones simultáneas sobre el mismo producto/sector.
5. **Imágenes:** guardar en filesystem; en DB solo la ruta. Servir vía API.
6. **Soft delete:** preferir `activo = false` sobre borrar registros con historial.
7. **Inventario:** al cerrar sesión, reemplazar `stock_lineas` por desglose contado + `AJUSTE_INVENTARIO` en una transacción; guardar snapshot inicial y reporte final.
8. **Excel:** las exportaciones (consulta, ingresos, planillas, retornos, roturas, inventario) son consultas agregadas sobre tablas existentes; no hay entidades dedicadas a reportes Excel.
