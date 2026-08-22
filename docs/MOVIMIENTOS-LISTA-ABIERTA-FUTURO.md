# Movimientos internos — lista abierta

> **Estado: implementado** (v0.3.30+).  
> Complementa [ESPECIFICACION.md](ESPECIFICACION.md) §3.8 y [APP-MOVIL.md](APP-MOVIL.md).

---

## 1. Motivación

La carga ya no pide un formulario previo (tipo Enviar/Recibir). En la operación real suele pasar:

1. Un **asignado** hace los movimientos durante el día y después los carga.
2. O los anota en **planilla de papel** y al final los carga de una.

Flujo: entrar, cargar líneas, salir y volver; al final revisar (tilde) y finalizar.

---

## 2. Producto

### Pantalla principal (`/movimientos`)

- Listado de registros **cerrados** (historial; no incluye la lista `ABIERTA`).
- Botón **Crear lista de movimientos** / **Continuar lista abierta**.

### Pantalla de carga

1. Selectores **Origen** y **Destino** arriba del buscador.
2. Buscador de productos con stock en el **origen** (`modo=origen`).
3. Cada línea guarda su propio O→D (editable); un lote admite varios trayectos.
4. Al salir, la lista **persiste**.

### Lista abierta = compartida

- Como máximo **una** lista `tipo=LISTA` + `estado=ABIERTA`.
- Cualquiera con permiso puede agregar líneas.

### Cierre

- Tilde (`verificada`) obligatoria por línea activa.
- Líneas no hechas: **eliminar**.
- **Finalizar** → aplica stock → `COMPLETADO` en el historial.

La doble verificación clásica (`movimientos_doble_verificacion`) queda obsoleta para este flujo (sigue existiendo el setting por compatibilidad con docs `PENDIENTE` legados).

---

## 3. API

| Método | Ruta | Rol |
|--------|------|-----|
| GET | `/api/movimientos-internos/abierto` | Ver si hay lista abierta |
| POST | `/api/movimientos-internos/abierto` | Get-or-create |
| POST | `/api/movimientos-internos/:id/lineas` | Agregar línea (solo `ABIERTA`) |
| PATCH | `/api/movimientos-internos/:id/lineas` | Editar O/D/ubicaciones/`verificada` |
| DELETE | `/api/movimientos-internos/:id/lineas/:lineaId` | Borrar línea |
| POST | `/api/movimientos-internos/:id/finalizar` | Stock + `COMPLETADO` |
| POST | `/api/movimientos-internos/:id/cancelar` | Cancelar lista abierta |

---

## 4. Modelo

- `movimientos_internos.tipo`: `ENVIAR` \| `RECIBIR` \| `LISTA`
- `movimientos_internos.estado`: `ABIERTA` \| `PENDIENTE` \| `COMPLETADO` \| `CANCELADO`
- `movimiento_interno_lineas.verificada` (INTEGER 0/1)

---

## 5. Criterio de listo

- [x] Lista abierta única; sobrevive salir/entrar y refresh
- [x] Selectores origen/destino + buscador sin formulario previo
- [x] Buscador limitado a stock del origen
- [x] Múltiples O→D; editar O/D por línea
- [x] Tilde obligatoria / eliminar líneas no hechas
- [x] Finalizar aplica stock y deja registro en historial
- [x] Crear nueva solo si no hay abierta (get-or-create)
- [x] Docs de especificación/modelo alineados
- [x] Doble verificación clásica: no usada por el flujo lista abierta (setting retenido por legado)

---

*Implementado sobre ControlStock ≥ v0.3.30. Documentado en [ESTADO-ACTUAL.md](ESTADO-ACTUAL.md).*
