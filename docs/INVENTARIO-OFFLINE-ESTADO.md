# Inventario offline — estado y norte (no desviarse)

> **Documento de respaldo** (julio 2026). Si se pierde el chat, este archivo es la fuente de verdad del flujo offline acordado y de lo ya implementado.  
> Complementa [INVENTARIO.md](INVENTARIO.md) §3.1 y [APP-MOVIL.md](APP-MOVIL.md).

---

## 1. Idea de producto (innegociable)

El inventario offline existe porque **en el depósito puede no haber WiFi hacia el PC**. La oficina sí tiene red al servidor.

**Flujo completo acordado:**

1. **PC servidor** — Se inicia una sesión de inventario; los sectores elegidos van en modo `OFFLINE`.
2. **Oficina (red al PC)** — Los dos celulares se conectan y **descargan el paquete** del sector (catálogo + rol + datos de sesión).
3. **Depósito (sin PC)** — Cada uno cuenta en su base local; **no** se sincronizan mientras cuentan.
4. **Al finalizar ambos** — Se sincronizan **entre sí por hotspot** (uno comparte hotspot; el otro se conecta a esa red).
5. **Comparación A en el celular** — Diferencias → reconteo local + nueva sync; **OK** → sector listo.
6. **Vuelta a oficina** — Se conectan otra vez al PC e **importan** el conteo; si falla la red, generan el archivo final y lo importan manualmente en la PC.
7. **PC** — Cuando los sectores están OK entre contadores, el supervisor hace **Comparación B vs sistema** y cierra la sesión.

### Dos comparaciones (no confundir)

| | Comparación A | Comparación B |
|--|---------------|---------------|
| Entre | Contador 1 vs Contador 2 | Contado vs stock del sistema |
| Dónde | **Celulares** (tras sync P2P) | **PC** (tras import) |
| Si falla | Reconteo entre contadores | Ajustes / cierre de sesión |

### Qué NO es este modo

- No es editar stock del PC sin red.
- No es “volcar todo al final sin comparar entre contadores” (eso se **descartó**).
- El sync principal **no** es WhatsApp/archivo: es **HTTP local por hotspot**. Los JSON entre celulares y el archivo final hacia la PC son **solo respaldo**.

---

## 2. Estado de implementación (julio 2026)

### Listo (flujo principal de punta a punta)

| Pieza | Dónde |
|-------|--------|
| Modo `ONLINE` / `OFFLINE` al crear sesión | PC UI + `POST /api/inventario/sesiones` |
| API paquete + import + cambio de modo | `server/routes/inventario.ts`, `server/utils/inventario-offline.ts` |
| Columnas DB | `modo_conectividad`, `paquete_descargado_at`, `importado_at` |
| APK Capacitor Android | `android/`, `capacitor.config.ts`, scripts `build:mobile` / `cap:sync` |
| Conteo offline (UI alineada al online) | `src/pages/InventarioOfflinePage.tsx` |
| Storage local (Filesystem + Preferences) | `src/lib/inventarioOffline/` |
| Sync P2P hotspot (HTTP puerto **3850**) | `src/lib/inventarioOffline/p2pSync.ts` + `@cantoo/capacitor-http-server` |
| Comparación A + reconteo en celular | `compare.ts` + UI offline |
| Import al PC + limpieza local del sector | `importarAlPc` → `clearOfflineSectorLocal` |
| Estado “Recibiendo” en la PC | aviso previo + polling de sesión activo |
| Limpieza de sesiones viejas al descargar paquete nuevo | `purgeOfflineExceptSesion` |
| Respaldo JSON entre celulares | UI secundaria “Respaldo: enviar archivo JSON” |
| Plan B archivo final hacia PC | “Guardar archivo para PC” + “Importar archivo”; checksum y validación del sector |
| Sesión sin red al PC | Login offline con misma clave; no expulsar al fallar `/me`; listar paquetes locales |

### Pendiente / pulir (no cambia la idea)

- Probar en **dos celulares reales** (hotspot + permisos de notificación del servidor local).
- Emulador + celular: **no** valida hotspot real; solo sync parcial en misma Wi‑Fi del router.
- Paridad opcional con online: ubicaciones, escáner de barras.
- Hotspot automático (hoy el usuario lo activa en Ajustes del teléfono).
- Pruebas de campo de actualización automática de IP/QR en distintos modelos Android.
- iOS (`npx cap add ios`) más adelante.

**Conclusión:** el camino feliz está **implementado**. Siguiente foco = **probar en campo y pulir**, no rediseñar el flujo.

---

## 3. Cómo se usa (operativo)

### En el PC

1. Crear sesión de inventario.
2. Asignar contadores y marcar sector(es) como **Offline**.
3. Dejar el servidor corriendo (`npm run dev` o app Electron).

### En cada celular (oficina)

1. Abrir APK, login, IP del PC (emulador: `10.0.2.2:3850` es el sync P2P; API del PC = `10.0.2.2:3847`).
2. Mis sectores → sector offline → **Descargar paquete**.
3. Ir al depósito (ya no hace falta WiFi al PC).

### En el depósito

1. Contar → **Finalicé**.
2. Uno: **Yo activo hotspot / espero** (y activar hotspot en Ajustes).
3. Otro: conectarse a esa Wi‑Fi → **Me conecto al compañero** → IP típica del gateway Android `192.168.43.1` (puerto 3850) → **Sincronizar**.
4. Ver diferencias u OK; reconteo si hace falta; sync de nuevo.
5. Antes del sync, **Seguir editando** permite corregir el conteo propio; después de sincronizar corresponde reconteo.
6. En reconteo, productos en cero permiten **Agregar línea** desde la propia diferencia.
7. Con OK: **Importar resultado al PC** (cuando vuelvan a la red de oficina).
8. Si la red hacia el PC falla: **Guardar archivo para PC**, trasladarlo y usar **Importar archivo** en la fila del sector.

### Mes siguiente / sesión nueva

- Nueva sesión en PC = **nuevos IDs** de `inventario_sector`.
- Al descargar el paquete nuevo se **borran** del celular los datos offline de **otras sesiones**.
- Tras import exitoso se **borra** el local de ese sector.
- Un sector ya importado queda marcado como enviado y no puede volver a descargar/reabrir el paquete.

---

## 4. Archivos clave (mapa rápido)

```
server/utils/inventario-offline.ts     # paquete, import directo/archivo y validación
server/routes/inventario.ts            # rutas paquete / import / archivo / modo
server/db/migrate.ts                   # columnas offline

src/lib/inventarioOffline/
  types.ts, compare.ts, storage.ts, index.ts, p2pSync.ts

src/pages/InventarioOfflinePage.tsx    # UI conteo + host/cliente + comparación
src/pages/InventarioPage.tsx           # crear sesión ONLINE/OFFLINE; Mis sectores
```

### Protocolo P2P (host = quien espera)

- `GET  /bodega/info` — metadatos del sector/contador
- `POST /bodega/sync` — body = payload del cliente; respuesta = payload del host  
  Ambos aplican el del otro → Comparación A local.

---

## 5. Build APK

```bash
npm run build:mobile
npx cap sync android
# Abrir Android Studio → Run en dispositivo
```

Login típico: `admin` / `admin123`. API PC: puerto **3847**.

---

## 6. Reglas para no desviarse (para futuros chats / agentes)

1. **Mantener** el flujo de la §1; no volver a sync solo por archivo como camino principal.
2. **Mantener** Comparación A entre contadores **antes** de importar; Comparación B solo en PC.
3. **Mantener** modo online (web/APK contra PC) intacto; offline es paralelo, no reemplazo.
4. Storage local actual = Filesystem/Preferences (no hace falta SQLite para el MVP).
5. Capacitor es el stack móvil elegido (no Flutter/RN).
6. **Sesión offline:** si cierran la app o la sesión de usuario sin red al PC, deben poder volver a entrar con el mismo usuario/clave (cache en el celular) y seguir con paquetes locales. No borrar el token solo porque falla `/api/auth/me`.
7. Antes de inventar features nuevas: **probar** host/cliente en dos físicos y anotar fallos de red/IP.
8. El archivo final para PC es **Plan B**: solo se genera con ambos conteos finalizados, sincronizados y coincidentes; el PC debe validar checksum, sesión, sector y contadores.

---

## 7. Historial breve de decisiones

| Decisión | Acuerdo |
|---------|---------|
| Stack APK | Capacitor (reutiliza React) |
| Sync principal | Hotspot + HTTP local (no archivo) |
| JSON entre celulares | Solo Plan B para el sync P2P |
| Archivo final hacia PC | Plan B validado; import manual por supervisor, sector por sector |
| Paquete | Catálogo activo + defaults; no dump ciego de stock para “cerrar sin comparar” |
| Limpieza local | Al importar sector; al descargar paquete de sesión distinta |
| Sesión sin red al PC | Cache de usuario+clave en el celular; login offline + no expulsar si falla `/me` |
| Prueba emulador+físico | Parcial (misma Wi‑Fi); hotspot completo = 2 físicos |

### Nota UX de conteo y transferencia

La UI offline comparte con la online: desglose cerrado, panel de cantidad adaptado al teclado, tipografía/áreas táctiles ampliadas, auto-scroll, footer, buscador legible, “Seguir editando” antes del sync y alta directa de líneas en cero durante reconteo.

El host P2P relee automáticamente la IP cuando el hotspot queda activo y permite **Actualizar IP / QR**. En la vuelta a oficina, el celular avisa el inicio del envío y la PC muestra **Recibiendo conteo…** hasta que la transacción termina. La lista del celular se refresca automáticamente y ofrece botón **Actualizar**.

*Última actualización: julio 2026 — v0.3.12; flujo principal implementado; fase prueba y pulido.*
