# BodegaStock (ControlStock)

Sistema de gestión de stock para bodega con aplicación de escritorio (Electron), clientes móviles (APK Android / navegador) y modo **servidor local (LAN)** como despliegue actual. Modo **nube (Railway + Postgres)** implementado en código, pendiente de uso productivo.

## Estado del proyecto

**v0.3.43** — [Release en GitHub](https://github.com/JRNCarrizo/bodegaStock/releases/tag/v0.3.43)

| En planta hoy | Preparado para más adelante |
|---------------|----------------------------|
| PC servidor + SQLite en LAN | API + Postgres en Railway |
| APK + web en WiFi local | Migrador SQLite → nube |
| Inventario offline probado | Mismo APK con modo Nube |

**Panorama global:** [docs/ESTADO-ACTUAL.md](docs/ESTADO-ACTUAL.md)

### Reciente (resumen)

- **v0.3.43:** cooldown ante rate limit de GitHub (429) al buscar updates / APK.
- **v0.3.42:** agenda de turnos (insumos); update APK in-app; Descargar APK desde PC; Configuración plegable.
- **v0.3.41:** instalador Windows visible al actualizar (Setup NSIS con progreso).
- **v0.3.38:** permiso Configuración operativo; sector por defecto en ingresos; alias vehículo en planillas.
- **v0.3.37:** fix importación inventario offline → PC local en APK; reconteo a cero online.
- **v0.3.36:** guías de ayuda (`?`) en Ingresos, Planillas, Retornos, Roturas, Movimientos e Inventario; PDF descargable.
- **v0.3.35:** búsqueda más rápida; iconos en formularios; teclado en ingresos/movimientos.
- **v0.3.32–0.3.34:** modo nube Railway, migrador, APK firmada, conexión HTTPS.
- **v0.3.30–0.3.31:** movimientos lista abierta; ingresos multi-destino y borradores; ajustes de stock.

## Documentación

| Documento | Contenido |
|-----------|-----------|
| **[ESTADO-ACTUAL.md](docs/ESTADO-ACTUAL.md)** | **Panorama global** — leer primero |
| [ESPECIFICACION.md](docs/ESPECIFICACION.md) | Visión general, arquitectura, módulos y reglas de negocio |
| [MODELO-DE-DATOS.md](docs/MODELO-DE-DATOS.md) | Entidades, relaciones y tipos de movimiento |
| [USUARIOS-Y-PERMISOS.md](docs/USUARIOS-Y-PERMISOS.md) | Roles, permisos por sección y reglas de acceso |
| [INVENTARIO.md](docs/INVENTARIO.md) | Inventario: Simple/Doble, online/offline, reconteo |
| [INVENTARIO-OFFLINE-ESTADO.md](docs/INVENTARIO-OFFLINE-ESTADO.md) | Flujo offline: idea, estado, archivos clave |
| [DESGLOSE-DE-CANTIDADES.md](docs/DESGLOSE-DE-CANTIDADES.md) | Formato pallet × unidades + sueltos |
| [APP-MOVIL.md](docs/APP-MOVIL.md) | APK Android, web móvil, roles, conexión local/nube |
| [ANDROID-DEV.md](docs/ANDROID-DEV.md) | Live reload en celular y build de APK |
| [SERVIDOR-CLOUD-RAILWAY-FUTURO.md](docs/SERVIDOR-CLOUD-RAILWAY-FUTURO.md) | Nube Railway + Postgres (implementado, no en planta) |
| [PASOS-TRABAJO-CLOUD.txt](docs/PASOS-TRABAJO-CLOUD.txt) | Checklist operativo para activar la nube |
| [PLANILLAS-OCR-FUTURO.md](docs/PLANILLAS-OCR-FUTURO.md) | Futuro: OCR de planilla impresa |
| [MOVIMIENTOS-LISTA-ABIERTA-FUTURO.md](docs/MOVIMIENTOS-LISTA-ABIERTA-FUTURO.md) | Movimientos lista abierta (implementado) |
| [FICHA-TECNICA-COTIZACION.md](docs/FICHA-TECNICA-COTIZACION.md) | Ficha para cotizar / pasar a terceros |

## Desarrollo local

```bash
npm install
npm run dev
```

Usuario inicial: `admin` / `admin123`

## App móvil (Capacitor / Android)

La web en `:3847` y la APK comparten la misma UI React.

**Desarrollo (live reload):** [docs/ANDROID-DEV.md](docs/ANDROID-DEV.md)

```bash
npm run dev:android              # celular físico (misma WiFi)
npm run dev:android:emulator     # emulador Android Studio
```

**APK de producción:**

```bash
npm run cap:sync
# En Windows, si Gradle falla con Java 25, usar JDK de Android Studio:
# $env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
cd android && .\gradlew.bat assembleRelease
```

En el login de la APK: **Red local** → IP del PC (`3847`) o QR. Modo **Nube** disponible cuando migren a Railway.

## Instalador (Windows)

```bash
npm run dist
```

Genera `release/ControlStock-Setup-x.y.z.exe` y `release/latest.yml`.

## Publicar release en GitHub

```powershell
gh auth login
.\scripts\publish-release.ps1 -Version "0.3.38"
```

O tag + GitHub Actions: **Actions → Release → Run workflow**

## Repositorio

[Código fuente en GitHub](https://github.com/JRNCarrizo/bodegaStock)

## Stack

- **Escritorio:** Electron + React + TypeScript
- **Servidor:** Node.js / Fastify (API REST, puerto `3847`)
- **Base local:** SQLite (`better-sqlite3`)
- **Base nube (opcional):** PostgreSQL (`DATABASE_URL` + shim)
- **Móvil:** Capacitor Android (misma UI; iOS más adelante)
- **Exportaciones:** Excel (`exceljs`) por módulo
