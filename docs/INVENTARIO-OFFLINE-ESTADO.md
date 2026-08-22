# Inventario offline — estado y norte (no desviarse)

> **Documento de respaldo** (agosto 2026 — **v0.3.37**). Si se pierde el chat, este archivo es la fuente de verdad del flujo offline acordado y de lo ya implementado.  
> Panorama global: [ESTADO-ACTUAL.md](ESTADO-ACTUAL.md) · Complementa [INVENTARIO.md](INVENTARIO.md) §3.1–3.2 y [APP-MOVIL.md](APP-MOVIL.md).

---

## 1. Idea de producto (innegociable)

El inventario offline existe porque **en el depósito puede no haber WiFi hacia el PC**. La oficina sí tiene red al servidor.

**Flujo completo acordado (verificación Doble):**

1. **PC servidor** — Sesión con sectores `OFFLINE` (y `DOBLE` o `SIMPLE` por sector).
2. **Oficina (red al PC)** — Celulares **descargan el paquete** del sector.
3. **Depósito (sin PC)** — Cuentan en base local; **no** se sincronizan mientras cuentan.
4. **Doble — al finalizar ambos** — Sync **entre sí por hotspot** (HTTP **3850**).
5. **Comparación A en el celular** — Diferencias → reconteo + sync; OK → listo para import.
6. **Simple — al finalizar el único contador** — Sin P2P ni Comparación A; pasa a import.
7. **Vuelta a oficina** — Importan al PC (red o archivo Plan B).
8. **PC** — Comparación B vs sistema + cierre de sesión.

### Dos comparaciones (no confundir)

| | Comparación A | Comparación B |
|--|---------------|---------------|
| Entre | Contador 1 vs Contador 2 | Contado vs stock del sistema |
| Dónde | **Celulares** (tras sync P2P) o PC online | **PC** (tras import / sectores OK) |
| Si falla | Reconteo entre contadores | Ajustes / cierre de sesión |
| Simple | **No aplica** | Sí |

### Qué NO es este modo

- No es editar stock del PC sin red.
- En **Doble**, no es “volcar todo al final sin comparar entre contadores”.
- En **Simple**, sí se permite un solo conteo y Comparación B en PC (decisión explícita v0.3.28).
- El sync principal **no** es WhatsApp/archivo: es **HTTP local por hotspot**. JSON entre celulares y archivo final hacia la PC son **solo respaldo**.

---

## 2. Estado de implementación (agosto 2026 / v0.3.37)

### Listo (flujo principal de punta a punta + probado en campo)

| Pieza | Dónde |
|-------|--------|
| Modo `ONLINE` / `OFFLINE` al crear sesión | PC UI + `POST /api/inventario/sesiones` |
| Modo `DOBLE` / `SIMPLE` al crear sesión | mismo endpoint + `modo_verificacion`; `contador_2_id` nullable |
| API paquete + import + cambio de modo | `server/routes/inventario.ts`, `server/utils/inventario-offline.ts` |
| Columnas DB | `modo_conectividad`, `modo_verificacion`, `paquete_descargado_at`, `importado_at` |
| APK Capacitor Android | `android/`, `capacitor.config.ts`, `build:mobile` / `cap:sync` |
| Conteo offline (UI) | `src/pages/InventarioOfflinePage.tsx` |
| Storage local | `src/lib/inventarioOffline/` |
| Sync P2P hotspot (HTTP **3850**) | `p2pSync.ts` + `@cantoo/capacitor-http-server` |
| Carga manual sync: IP editable, puerto fijo 3850 | UI cliente (v0.3.30) |
| Comparación A + reconteo (solo Doble) | `compare.ts` + UI |
| Simple: finalizar → import sin P2P | offline lib + import PC |
| Import al PC + limpieza local | `importarAlPc` → `clearOfflineSectorLocal` |
| Fix import APK → PC local (415) | v0.3.37 — `appFetch` / CapacitorHttp solo HTTPS |
| Estado “Recibiendo” en la PC | aviso previo + polling |
| Plan B archivo final | “Guardar archivo para PC” + “Importar archivo” |
| Login offline / paquetes locales | cache usuario+clave; no expulsar si falla `/me` |
| Badges Simple/Doble/Offline en supervisión | `InventarioPage.tsx` |
| Guías de ayuda inventario offline | `?` + PDF (v0.3.36) |

### Pendiente / pulir (no cambia la idea)

- Más pruebas de campo con inventarios grandes.
- Paridad opcional: ubicaciones / escáner en offline.
- Hotspot automático (hoy el usuario lo activa en Ajustes).
- iOS más adelante.

**Conclusión:** camino feliz **implementado y probado** (Doble + Simple). Foco = operación y nuevos requerimientos, no rediseñar.

---

## 3. Cómo se usa (operativo)

### En el PC

1. Crear sesión de inventario.
2. Por sector: **Simple o Doble**, **Offline u Online**, contador(es).
3. Servidor corriendo.

### En cada celular (oficina)

1. APK, login, IP del PC (API **3847**; sync P2P es **3850**).
2. Mis sectores → sector offline → **Descargar paquete**.
3. Ir al depósito.

### En el depósito — Doble

1. Contar → **Finalicé**.
2. Uno: **Crear conexión** (hotspot).
3. Otro: Wi‑Fi del compañero → **Unirme** → IP (puerto **3850** fijo) → **Sincronizar**.
4. OK o diferencias → reconteo → sync de nuevo.
5. **Importar al PC** (o Plan B archivo). Antes: WiFi al local, **sin** hotspot del compañero activo.

### En el depósito — Simple

1. Contar → **Finalicé**.
2. **Importar al PC** / archivo Plan B (sin sync ni reconteo).

---

## 4. Archivos clave

```
server/utils/inventario-offline.ts
server/utils/inventario.ts            # esVerificacionSimple, cerrarSectorSinComparacionPares
server/routes/inventario.ts
server/db/migrate.ts / schema.ts

src/lib/inventarioOffline/
  types.ts, compare.ts, storage.ts, index.ts, p2pSync.ts

src/pages/InventarioOfflinePage.tsx
src/pages/InventarioPage.tsx          # CrearSesionForm Simple/Doble + Offline/Online
```

### Protocolo P2P (host = quien espera)

- `GET  /bodega/info`
- `POST /bodega/sync`  
  Puerto fijo: **3850**.

---

## 5. Build APK

```bash
npm run cap:sync
# JDK 21 (Android Studio) si Java 25 falla en Gradle:
# $env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
cd android && .\gradlew.bat assembleRelease
# → release/ControlStock-x.y.z.apk
```

---

## 6. Reglas para no desviarse (futuros chats / agentes)

1. Mantener el flujo de la §1; sync principal = hotspot HTTP, no archivo.
2. En **Doble**, Comparación A **antes** de importar; Comparación B solo en PC.
3. En **Simple**, no inventar un segundo contador ni forzar P2P.
4. Online intacto; offline es paralelo.
5. Capacitor es el stack móvil.
6. Sesión offline: poder reentrar sin red al PC con misma clave.
7. Archivo final Plan B: Doble solo con pares OK; Simple con conteo finalizado.
8. Puerto P2P = **3850** siempre; no pedir puerto en la UI manual.

---

## 7. Historial breve de decisiones

| Decisión | Acuerdo |
|---------|---------|
| Stack APK | Capacitor |
| Sync principal | Hotspot + HTTP local |
| JSON / archivo | Solo Plan B |
| Simple/Doble | Por sector; Simple sin pares (v0.3.28) |
| Puerto UI manual | Fijo 3850 (v0.3.30) |
| Sesión sin red al PC | Cache usuario+clave |
| Import APK local (415) | Fix v0.3.37 — no parchear fetch global CapacitorHttp |
| Prueba emulador+físico | Parcial; hotspot = 2 físicos; import local OK v0.3.37 |

*Última actualización: 22 agosto 2026 — v0.3.37.*
