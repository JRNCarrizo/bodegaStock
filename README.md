# BodegaStock

Sistema de gestión de stock para bodega con aplicación de escritorio (Electron) y clientes móviles (APK Android) conectados por red local (LAN).

## Documentación

Toda la especificación del proyecto está en la carpeta [`docs/`](docs/):

| Documento | Contenido |
|-----------|-----------|
| [ESPECIFICACION.md](docs/ESPECIFICACION.md) | Visión general, arquitectura, módulos y reglas de negocio |
| [MODELO-DE-DATOS.md](docs/MODELO-DE-DATOS.md) | Entidades, relaciones y tipos de movimiento |
| [USUARIOS-Y-PERMISOS.md](docs/USUARIOS-Y-PERMISOS.md) | Roles, permisos por sección y reglas de acceso |
| [INVENTARIO.md](docs/INVENTARIO.md) | Inventario dual: líneas independientes, comparación, reconteo |
| [INVENTARIO-OFFLINE-ESTADO.md](docs/INVENTARIO-OFFLINE-ESTADO.md) | **Respaldo del flujo offline:** idea, estado, archivos, no desviarse |
| [DESGLOSE-DE-CANTIDADES.md](docs/DESGLOSE-DE-CANTIDADES.md) | Formato pallet × unidades + sueltos (todo el sistema) |
| [APP-MOVIL.md](docs/APP-MOVIL.md) | APK Android: terminal de bodega, módulos, roles, fases y priorización |
| [FICHA-TECNICA-COTIZACION.md](docs/FICHA-TECNICA-COTIZACION.md) | Ficha técnica para cotizar / pasar a terceros o a una IA |

## Estado del proyecto

**v0.3.8** — Inventario offline más robusto: edición previa al sync, mejor UX móvil, recepción visible en PC y archivo de contingencia. Actualizaciones desde Configuración.

## Desarrollo local

```bash
npm install
npm run dev
```

Usuario inicial: `admin` / `admin123`

## App móvil (Capacitor / Android)

La web en `:3847` sigue siendo el canal online. La APK reutiliza la misma UI React.

```bash
npm run icons          # genera iconos desktop + mipmaps Android desde build/icon.svg
npm run build:mobile   # genera dist/
npm run cap:sync       # icons + build:mobile + copia a android/
npm run cap:android    # abre Android Studio
```

En el login de la APK se configura la IP del PC servidor (Configuración → QR/URL). Requiere [Android Studio](https://developer.android.com/studio). iOS: más adelante con `npx cap add ios`.

## Instalador (Windows)

```bash
npm run dist
```

Genera el instalador en `release/` (NSIS x64).

## Publicar release en GitHub

### Opción A — Script local (sube el `.exe` ya generado)

```powershell
gh auth login
.\scripts\publish-release.ps1
```

### Opción B — GitHub Actions (genera el instalador en la nube)

1. Creá y subí un tag: `git tag v0.1.0` → `git push origin v0.1.0`
2. O en GitHub: **Actions → Release → Run workflow**

Los instaladores quedan en [Releases](https://github.com/JRNCarrizo/bodegaStock/releases).

## Repositorio

[Código fuente en GitHub](https://github.com/JRNCarrizo/bodegaStock)

## Stack

- **Escritorio:** Electron + interfaz web (React + TypeScript)
- **Servidor embebido:** Node.js / Fastify (API REST + WebSockets)
- **Base de datos:** SQLite (producción actual; PostgreSQL opcional a futuro)
- **Móvil:** APK Android con **Capacitor** (misma UI React; iOS más adelante)
- **Exportaciones:** Excel (`exceljs`) por módulo; PDF pendiente
