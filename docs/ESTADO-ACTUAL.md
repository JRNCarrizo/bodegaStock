# ControlStock — Estado actual del proyecto

> **Snapshot global** — agosto 2026 · release **v0.3.38**  
> Leer este archivo primero antes de pedir cambios nuevos o retomar el proyecto en otro chat.

**Repositorio:** [github.com/JRNCarrizo/bodegaStock](https://github.com/JRNCarrizo/bodegaStock)  
**Release publicada:** [v0.3.38](https://github.com/JRNCarrizo/bodegaStock/releases/tag/v0.3.38)

---

## 1. Resumen en una página

| Tema | Estado |
|------|--------|
| **Uso en planta hoy** | **Servidor local** — PC con Electron + SQLite; celulares/APK en la misma WiFi |
| **Modo nube (Railway + Postgres)** | **Implementado en código**, probado en laboratorio; **no en uso productivo** todavía |
| **Escritorio Windows** | Electron + Fastify `:3847` + SQLite |
| **APK Android** | Capacitor, misma UI React; inventario offline + sync P2P |
| **Web móvil** | Misma URL `:3847` en navegador del celular (convive con APK) |
| **Inventario offline** | Flujo completo Simple/Doble; import al PC probado en campo (v0.3.37) |
| **Guías de ayuda** | Botón `?` por sección + PDF (v0.3.36) |
| **Próximo foco** | Multi-logística Esmeralda + NAKBE ([MULTI-LOGISTICA.md](MULTI-LOGISTICA.md)) — planificado |

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
| Consulta + ajuste stock | ✓ | ✓ | ✓ | Permiso `ajustes_stock` |
| Productos / sectores / usuarios | ✓ | — | — | Administración en escritorio |
| Ingresos | ✓ | ✓* | ✓* | Borrador local; multi-destino por línea |
| Planillas | ✓ | ✓ | ✓ | Borrador; camionero |
| Retornos | ✓ | ✓ | ✓ | Doble verificación configurable |
| Roturas | ✓ | ✓ | ✓ | |
| Movimientos internos | ✓ | ✓ | ✓ | Lista abierta compartida + tilde + finalizar |
| Inventario | ✓ | ✓ | ✓ | Online + offline; Simple/Doble por sector |
| Reportes | ✓ | ✓ | ✓ | Movimientos del día |
| Camioneros | ✓ | — | — | ABM en PC; selector en planillas |
| Configuración | ✓ | — | — | Red local / nube, migrador, toggles |
| Ayuda por sección (`?`) | ✓ | ✓ | ✓ | PDF en escritorio; modal en móvil |

\*Disponible si el rol tiene permiso; operativamente los ingresos suelen cargarse en PC con el remito físico.

---

## 4. Historial de releases recientes

| Versión | Fecha | Lo principal |
|---------|-------|--------------|
| **0.3.38** | ago 2026 | Permiso Configuración operativo; sector default ingresos; alias vehículo planillas; catálogo legible sin menú catálogo |
| **0.3.37** | ago 2026 | Fix import offline → PC local en APK (CapacitorHttp); reconteo a cero online |
| **0.3.36** | ago 2026 | Guías de ayuda (`?`) + PDF; inventario offline documentado en ayuda |
| **0.3.35** | ago 2026 | Búsqueda más rápida; iconos en formularios; teclado ingresos/movimientos |
| **0.3.34** | ago 2026 | URLs Railway tratadas como HTTPS en APK |
| **0.3.33** | ago 2026 | APK firmada instalable; fixes conexión nube |
| **0.3.32** | ago 2026 | Modo nube Railway; migrador SQLite→Postgres; API standalone |
| **0.3.31** | ago 2026 | Ajuste stock; empaque desde nombre; swipe líneas ingresos/planillas |
| **0.3.30** | ago 2026 | Movimientos lista abierta; ingresos multi-destino + borradores |
| **0.3.29** | ago 2026 | Sync offline: puerto fijo 3850 en carga manual |
| **0.3.28** | ago 2026 | Inventario Simple/Doble por sector |
| **0.3.21–0.3.27** | jul–ago 2026 | Inventario offline robusto, Excel por sectores, botellas/caja |

---

## 5. Decisiones técnicas importantes (agosto 2026)

### Conexión APK — local vs nube

- **Local (en uso):** login/config → IP del PC + puerto `3847`.
- **Nube (preparado):** login/config → URL `https://….railway.app`.
- **HTTP en APK (v0.3.37):** el parche global `CapacitorHttp` **está desactivado** porque rompía POST JSON al servidor local (error 415). Para Railway se usa `CapacitorHttp.request()` solo en URLs `https://`. Archivos: `capacitor.config.ts`, `src/lib/nativeServer.ts` (`appFetch`).

### Inventario offline — probado en campo

- Import al PC con WiFi al servidor local: OK en v0.3.37 (antes fallaba desde v0.3.33).
- Plan B siempre disponible: **Guardar archivo para PC** → **Importar archivo** en supervisión.
- Antes de importar: apagar hotspot del compañero; conectar solo al WiFi del local.

### Reconteo online (v0.3.37)

- Si un producto queda en **0 líneas** en reconteo, ya no se reprecarga al recargar la pantalla (antes copiaba la ronda anterior en cada GET).

### Base de datos

- **Producción actual:** SQLite en el PC servidor.
- **Nube:** Postgres vía `DATABASE_URL` en `server/standalone.ts` + shim compatible con SQLite.
- **Migración:** asistente en Configuración (admin) — no usado en planta aún.

---

## 6. Pendiente / futuro documentado

| Tema | Documento | Estado |
|------|-----------|--------|
| Multi-logística Esmeralda + NAKBE | [MULTI-LOGISTICA.md](MULTI-LOGISTICA.md) | Diseño acordado; sin código |
| OCR planilla impresa | [PLANILLAS-OCR-FUTURO.md](PLANILLAS-OCR-FUTURO.md) | Idea, sin código |
| Corte productivo a nube | [SERVIDOR-CLOUD-RAILWAY-FUTURO.md](SERVIDOR-CLOUD-RAILWAY-FUTURO.md) | Código listo; planta sigue en local |
| Export PDF global | ESPECIFICACION §6 | Pendiente |
| Fotos productos en nube | SERVIDOR-CLOUD § | Pendiente |
| iOS | APP-MOVIL | Más adelante |
| Firma código Windows (Defender) | ESPECIFICACION §6 | Pendiente |

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
| [MULTI-LOGISTICA.md](MULTI-LOGISTICA.md) | Dos logísticas (Esmeralda / NAKBE) — planificado |

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
.\scripts\publish-release.ps1 -Version "0.3.38"
```

Login inicial (base vacía): **admin** / **admin123**

---

*Última actualización: 22 agosto 2026 — v0.3.38*
