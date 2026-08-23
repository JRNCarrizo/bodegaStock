# ControlStock — Estado actual del proyecto

> **Snapshot global** — agosto 2026 · release **v0.3.45**  
> Leer este archivo primero antes de pedir cambios nuevos o retomar el proyecto en otro chat.

**Repositorio:** [github.com/JRNCarrizo/bodegaStock](https://github.com/JRNCarrizo/bodegaStock)  
**Release publicada:** [v0.3.45](https://github.com/JRNCarrizo/bodegaStock/releases/tag/v0.3.45)

---

## 1. Resumen en una página

| Tema | Estado |
|------|--------|
| **Uso en planta hoy** | **Servidor local** — PC con Electron + SQLite; celulares/APK en la misma WiFi |
| **Modo nube (Railway + Postgres)** | **Implementado en código**, probado en laboratorio; **no en uso productivo** todavía |
| **Escritorio Windows** | Electron + Fastify `:3847` + SQLite; update in-app (Setup NSIS visible) |
| **APK Android** | Capacitor, misma UI React; update in-app + “Descargar APK” desde el PC |
| **Web móvil** | Misma URL `:3847` en navegador del celular (convive con APK) |
| **Multi-logística** | Esmeralda + NAKBE en uso (v0.3.39+) — [MULTI-LOGISTICA.md](MULTI-LOGISTICA.md) |
| **Agenda de turnos** | Insumos / confirmación de turnos (v0.3.42+) |
| **Inventario offline** | Flujo completo Simple/Doble; import al PC probado en campo (v0.3.37) |
| **Guías de ayuda** | Botón `?` por sección + PDF (v0.3.36) |
| **Próximo foco** | Corte a nube cuando planta lo decida; OCR planillas; pulido UX restante |

---

## 2. Arquitectura en producción (hoy)

```
┌─────────────────────────────────────────────────────────────┐
│           PC SERVIDOR (Windows / Electron)                   │
│   UI admin · API Fastify :3847 · SQLite (única fuente)      │
└──────────────────────────────┬──────────────────────────────┘
                               │  WiFi LAN oficina / bodega
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
   ┌─────▼─────┐         ┌─────▼─────┐       ┌─────▼─────┐
   │ Celular   │         │ Celular   │       │ Otra PC   │
   │ APK       │         │ navegador │       │ Electron  │
   └───────────┘         └───────────┘       └───────────┘
```

**Inventario offline en depósito (sin WiFi al PC):** paquete descargado en oficina → conteo local → sync entre celulares por hotspot (`:3850`) → import al PC en oficina. Ver [INVENTARIO-OFFLINE-ESTADO.md](INVENTARIO-OFFLINE-ESTADO.md).

### Arquitectura futura (lista, no activa en planta)

```
PC / APK  ──HTTPS──►  Railway (Fastify standalone + Postgres)
                      Migrador SQLite → nube en Configuración
```

Detalle: [SERVIDOR-CLOUD-RAILWAY-FUTURO.md](SERVIDOR-CLOUD-RAILWAY-FUTURO.md) · pasos: [PASOS-TRABAJO-CLOUD.txt](PASOS-TRABAJO-CLOUD.txt)

---

## 3. Módulos — qué está hecho

| Módulo | PC | Web móvil | APK | Notas |
|--------|:--:|:---------:|:---:|-------|
| Consulta + ajuste stock | ✓ | ✓ | ✓ | Permiso `ajustes_stock`; pulido columnas / botellerío (v0.3.44) |
| Productos / sectores / usuarios | ✓ | — | — | Administración en escritorio |
| Logísticas | ✓ | ✓* | ✓* | Selector Esmeralda / NAKBE; operadores fijados |
| Ingresos | ✓ | ✓* | ✓* | Borrador local; multi-destino; sector default |
| Planillas | ✓ | ✓ | ✓ | Borrador; camionero; alias vehículo |
| Retornos | ✓ | ✓ | ✓ | Doble verificación configurable; cantidades sin “cajas” en carga |
| Roturas | ✓ | ✓ | ✓ | Sector default = menos stock; cantidades sin “cajas” |
| Movimientos internos | ✓ | ✓ | ✓ | Lista abierta compartida + tilde + finalizar |
| Inventario | ✓ | ✓ | ✓ | Online + offline; Simple/Doble por sector |
| Agenda de turnos | ✓ | ✓ | ✓ | Insumos; pendientes en sidebar |
| Reportes | ✓ | ✓ | ✓ | Movimientos del día (por logística) |
| Camioneros | ✓ | — | — | ABM en PC; por logística |
| Configuración | ✓ | — | parcial | PC: red, updates, migrador, toggles. APK: sin Red/Verificación (v0.3.44) |
| Ayuda por sección (`?`) | ✓ | ✓ | ✓ | PDF en escritorio; modal en móvil |
| Actualizaciones | ✓ | — | ✓ | Windows: Config → Buscar updates. APK: in-app + Descargar APK desde PC |

\*Disponible si el rol tiene permiso; operativamente los ingresos suelen cargarse en PC con el remito físico.

---

## 4. Historial de releases recientes

| Versión | Fecha | Lo principal |
|---------|-------|--------------|
| **0.3.45** | ago 2026 | Roturas: cantidad y total sin palabra “cajas” (paridad con retornos) |
| **0.3.44** | ago 2026 | APK Config limpia; sidebar opaca; roturas sector mínimo stock; pulido retornos/consulta |
| **0.3.43** | ago 2026 | Cooldown ante rate limit GitHub (429) en updates / APK |
| **0.3.42** | ago 2026 | Agenda de turnos; update APK in-app; Descargar APK desde PC; Config plegable |
| **0.3.41** | ago 2026 | Instalador Windows visible al actualizar (Setup NSIS con progreso) |
| **0.3.40** | ago 2026 | Banner de progreso en update; fix HTTP/2 |
| **0.3.39** | ago 2026 | Multi-logística Esmeralda/NAKBE; consulta con ceros; sesión al cambiar logística |
| **0.3.38** | ago 2026 | Permiso Configuración operativo; sector default ingresos; alias vehículo planillas |
| **0.3.37** | ago 2026 | Fix import offline → PC local en APK; reconteo a cero online |
| **0.3.36** | ago 2026 | Guías de ayuda (`?`) + PDF |
| **0.3.32–0.3.35** | ago 2026 | Nube Railway, APK firmada, búsqueda/UX, empaque |
| **0.3.30–0.3.31** | ago 2026 | Movimientos lista abierta; ingresos multi-destino; ajuste stock |
| **0.3.21–0.3.29** | jul–ago 2026 | Inventario offline robusto, Simple/Doble, Excel por sectores |

---

## 5. Decisiones técnicas importantes (agosto 2026)

### Multi-logística (v0.3.39+)

- Una instalación, dos contextos: **Esmeralda** y **NAKBE**.
- Catálogo de productos y admin principal compartidos; sectores, camioneros, stock, documentos e inventarios **aislados**.
- Operadores fijados a una logística; admin puede cambiar de contexto (reinicia sesión de UI).
- Diseño de referencia: [MULTI-LOGISTICA.md](MULTI-LOGISTICA.md).

### Conexión APK — local vs nube

- **Local (en uso):** login/config → IP del PC + puerto `3847`.
- **Nube (preparado):** login/config → URL `https://….railway.app`.
- **HTTP en APK (v0.3.37):** el parche global `CapacitorHttp` **está desactivado** porque rompía POST JSON al servidor local (error 415). Para Railway se usa `CapacitorHttp.request()` solo en URLs `https://`. Archivos: `capacitor.config.ts`, `src/lib/nativeServer.ts` (`appFetch`).
- **Config en APK (v0.3.44):** no se muestran secciones de Red ni Verificación de documentos (solo en escritorio). Sidebar opaca.

### Actualizaciones (v0.3.40–0.3.43)

- **Windows:** Configuración → Buscar actualizaciones; Setup NSIS con progreso visible; cooldown si GitHub responde 429.
- **APK:** chequeo/descarga in-app; desde el PC se puede **Descargar APK** del release.

### Inventario offline — probado en campo

- Import al PC con WiFi al servidor local: OK en v0.3.37 (antes fallaba desde v0.3.33).
- Plan B siempre disponible: **Guardar archivo para PC** → **Importar archivo** en supervisión.
- Antes de importar: apagar hotspot del compañero; conectar solo al WiFi del local.

### Reconteo online (v0.3.37)

- Si un producto queda en **0 líneas** en reconteo, ya no se reprecarga al recargar la pantalla (antes copiaba la ronda anterior en cada GET).

### Cantidades en UI (v0.3.44–0.3.45)

- En **Retornos** y **Roturas** (carga): cantidad a la derecha y total inferior usan número sin “caja/cajas” (`formatCantidad`).
- Stock disponible / mensajes de error pueden seguir mostrando “cajas” donde aporta claridad.

### Base de datos

- **Producción actual:** SQLite en el PC servidor.
- **Nube:** Postgres vía `DATABASE_URL` en `server/standalone.ts` + shim compatible con SQLite.
- **Migración:** asistente en Configuración (admin) — no usado en planta aún.

---

## 6. Pendiente / futuro documentado

| Tema | Documento | Estado |
|------|-----------|--------|
| Corte productivo a nube | [SERVIDOR-CLOUD-RAILWAY-FUTURO.md](SERVIDOR-CLOUD-RAILWAY-FUTURO.md) | Código listo; planta sigue en local |
| OCR planilla impresa | [PLANILLAS-OCR-FUTURO.md](PLANILLAS-OCR-FUTURO.md) | Idea, sin código |
| Export PDF global | ESPECIFICACION §6 | Pendiente |
| Fotos productos en nube | SERVIDOR-CLOUD § | Pendiente |
| iOS | APP-MOVIL | Más adelante |
| Firma código Windows (Defender) | ESPECIFICACION §6 | Pendiente |
| Escáner de barras en Planillas (pantalla) | APP-MOVIL | Pendiente / opcional |
| Multi-logística | [MULTI-LOGISTICA.md](MULTI-LOGISTICA.md) | **Hecho** (v0.3.39+) — doc = referencia de diseño |

---

## 7. Índice de documentación

| Documento | Para qué |
|-----------|----------|
| **[ESTADO-ACTUAL.md](ESTADO-ACTUAL.md)** | **Este archivo** — panorama global |
| [ESPECIFICACION.md](ESPECIFICACION.md) | Reglas de negocio y módulos |
| [MODELO-DE-DATOS.md](MODELO-DE-DATOS.md) | Tablas SQLite / entidades |
| [INVENTARIO.md](INVENTARIO.md) | Flujo inventario online/offline |
| [INVENTARIO-OFFLINE-ESTADO.md](INVENTARIO-OFFLINE-ESTADO.md) | Norte del offline (no desviarse) |
| [APP-MOVIL.md](APP-MOVIL.md) | Web + APK, roles, prioridades |
| [ANDROID-DEV.md](ANDROID-DEV.md) | Live reload y build APK |
| [USUARIOS-Y-PERMISOS.md](USUARIOS-Y-PERMISOS.md) | Roles y permisos |
| [DESGLOSE-DE-CANTIDADES.md](DESGLOSE-DE-CANTIDADES.md) | Pallet × cajas + sueltos |
| [SERVIDOR-CLOUD-RAILWAY-FUTURO.md](SERVIDOR-CLOUD-RAILWAY-FUTURO.md) | Nube Railway + Postgres |
| [PASOS-TRABAJO-CLOUD.txt](PASOS-TRABAJO-CLOUD.txt) | Checklist operativo nube |
| [FICHA-TECNICA-COTIZACION.md](FICHA-TECNICA-COTIZACION.md) | Cotización / terceros |
| [MULTI-LOGISTICA.md](MULTI-LOGISTICA.md) | Dos logísticas (Esmeralda / NAKBE) — implementado |
| [MOVIMIENTOS-LISTA-ABIERTA-FUTURO.md](MOVIMIENTOS-LISTA-ABIERTA-FUTURO.md) | Lista abierta — implementado |
| [PLANILLAS-OCR-FUTURO.md](PLANILLAS-OCR-FUTURO.md) | OCR planilla — futuro |

---

## 8. Comandos útiles

```bash
# Desarrollo escritorio
npm install && npm run dev

# APK (producción)
npm run cap:sync
# Gradle (usar JDK 21 de Android Studio si Java 25 falla):
# $env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
cd android && .\gradlew.bat assembleRelease
# → copiar a release/ControlStock-x.y.z.apk

# Instalador Windows
npm run dist
# → release/ControlStock-Setup-x.y.z.exe

# Publicar GitHub
.\scripts\publish-release.ps1 -Version "0.3.45"
```

Login inicial (base vacía): **admin** / **admin123**

---

*Última actualización: 22 agosto 2026 — v0.3.45*
