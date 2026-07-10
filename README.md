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
| [DESGLOSE-DE-CANTIDADES.md](docs/DESGLOSE-DE-CANTIDADES.md) | Formato pallet × unidades + sueltos (todo el sistema) |
| [APP-MOVIL.md](docs/APP-MOVIL.md) | APK Android: conexión LAN, módulos móviles, inventario en celular |

## Estado del proyecto

**v0.3.0** — Productos, sectores, consulta, ingresos, planillas, retornos, roturas, reportes, usuarios, camioneros e inventario en PC. Actualizaciones automáticas desde Configuración.

## Desarrollo local

```bash
npm install
npm run dev
```

Usuario inicial: `admin` / `admin123`

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

- **Escritorio:** Electron + interfaz web (React/Vue)
- **Servidor embebido:** Node.js (API REST + WebSockets)
- **Base de datos:** SQLite (inicio) / PostgreSQL (escala)
- **Móvil:** APK Android (Flutter o React Native)
