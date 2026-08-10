# Planillas — escaneo / OCR (idea futura)

> **Estado: NO implementado.** Documento de planeamiento (agosto 2026).  
> No tocar código hasta tener planillas reales para probar y priorizar la feature.  
> Complementa [ESPECIFICACION.md](ESPECIFICACION.md) §3.4 y [APP-MOVIL.md](APP-MOVIL.md).

---

## 1. Problema

Hoy la carga de planillas es **manual**: el planillero carga fecha/número/camionero y después **cada producto + cantidad** a mano.

Administración ya imprime un **Informe de Planillas de Carga (A Despachar)** con formato fijo. La idea es **fotografiar/escanear esa hoja** y que el sistema arme las líneas de productos automáticamente.

---

## 2. Formato de origen (acordado)

Documento típico de **Bodegas Esmeralda / administración**:

- Título: *Informe de Planillas de Carga (A Despachar)*
- Encabezado: Nro. Planilla, Fecha Emisión, Depósito, Fletero, Motivo, Observaciones
- Tabla de ítems (fuente tipo máquina / columnas fijas):
  - **Producto** — código a la izquierda (ej. `3130-25SC`, `330-25`, `420-25-MI`)
  - **Descripción** — texto del vino/producto
  - Columna intermedia numérica (`4.5`, `003`, etc.) — **ignorar** en v1
  - **Cantidad** — al final de la fila (ej. `1.00`, `10.00`, `30.00`)
- Cierre de lista: línea `TOTAL : …`
- Debajo: Órdenes de retiro / Facturas / Remitos / firmas — **fuera de alcance** del OCR de líneas

El formato se considera **estable** (siempre el mismo diseño). Eso hace viable un OCR acotado (no genérico de cualquier remito).

---

## 3. Alcance deseado (v1 de la feature)

### Sí

1. Usuario completa **a mano** el primer formulario (como hoy): fecha, número de planilla, camionero, vehículo/obs. si aplica.
2. En el paso de **carga de productos**:
   - Saca **foto** de la planilla (o elige imagen).
   - El sistema lee filas hasta `TOTAL`.
   - Por cada fila: `codigo` + `cantidad` (derecha).
   - Busca producto por **`codigo_interno`** (y/o alias si hace falta).
   - Arma un **borrador de líneas** (modo salida esperado: **CAJA**, cantidades enteras desde `10.00` → `10`).
3. Usuario **revisa** (faltantes, códigos no encontrados, cantidades) y confirma → descuento de stock como hoy.

### No (v1)

- Autocompletar camionero/fletero desde el encabezado (opcional más adelante).
- Leer facturas / remitos / firmas.
- Confirmar y descontar **sin revisión humana**.
- Soporte de planillas manuscritas o de otro diseño.

---

## 4. Enfoque técnico sugerido (cuando se implemente)

| Opción | Pros | Contras |
|--------|------|---------|
| **A. OCR local / plantilla fija** (columnas por posición + regex) | Sin internet; barato; bueno si el layout no cambia | Frágil si cambia el PDF/impresora |
| **B. OCR cloud / IA** | Más tolerante a ruido/foto torcida | Costo, red, privacidad |
| **C. Import archivo** (si admin puede exportar Excel/CSV) | Más confiable que foto | Depende de que administración entregue archivo |

**Recomendación de producto:** empezar por **foto → borrador → revisar** con parser de plantilla fija (A), y dejar Excel/CSV como camino paralelo si aparece.

Infra ya existente útil:

- Cámara / `BarcodeScannerModal` en otros módulos (hoy **no** en Planillas).
- Búsqueda de producto por `codigo_interno` / `codigo_barras`.
- Flujo de create planilla en 2 pasos (`PlanillasPage.tsx`).

---

## 5. Riesgos y reglas

1. **Códigos deben coincidir** con el catálogo (`3130-25SC` en papel = mismo `codigo_interno` en ControlStock). Si no, hace falta tabla de mapeo o alta previa.
2. **Cantidad = cajas** salvo que se demuestre lo contrario en pruebas.
3. Siempre **revisión antes de confirmar** (stock negativo / producto inexistente / OCR malo).
4. Probar con **varias planillas reales** (largas, cortas, foto con luz mala) antes de dar por lista la feature.
5. No implementar hasta tener al menos **1–2 planillas físicas** para testear.

---

## 6. Criterio de listo (cuando se priorice)

- [ ] Foto de planilla tipo “A Despachar” genera borrador con ≥95 % de filas correctas en muestras de prueba
- [ ] Filas con código desconocido se marcan en rojo (no se inventan productos)
- [ ] Usuario puede editar/borrar líneas del borrador
- [ ] Confirmación usa el mismo `POST /api/planillas` de hoy
- [ ] Documentado el modo de cantidad (CAJA) y el mapeo de códigos

---

## 7. Relación con otras mejoras cercanas

| Idea | Relación |
|------|----------|
| Escáner de barras en pantalla Planillas | Acelera carga manual **sin** OCR; puede hacerse antes |
| Import Excel/CSV de planillas | Alternativa/complemento si admin exporta archivo |
| Offline genérico de planillas | Independiente; no es este documento |

---

*Idea capturada en charla agosto 2026 — ControlStock v0.3.29. No hay código de OCR todavía.*
