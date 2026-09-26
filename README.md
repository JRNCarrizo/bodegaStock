# ControlStock (BodegaStock)

Sistema de gestión de stock para bodega / distribuidora.

- **Escritorio:** Electron (Windows en planta; también se puede desarrollar en Linux/macOS)
- **API:** Node.js + Fastify
- **Clientes:** misma UI React en PC, navegador y APK Android (Capacitor)
- **Datos hoy en planta:** SQLite en LAN
- **Nube:** API en Docker + PostgreSQL (listo en código)

**Versión:** v0.3.71 — [Releases](https://github.com/JRNCarrizo/bodegaStock/releases)

---

## Requisitos

- **Node.js 20+** (recomendado 22 LTS)
- **npm** (incluido con Node)
- Para app de escritorio: dependencias nativas de Electron / `better-sqlite3` (en Linux: herramientas de build, ej. `build-essential` / `python3`)
- Para Android: Android Studio (SDK + platform-tools)
- Para nube local con Postgres: Docker (opcional) o un Postgres accesible

---

## Desarrollo — API (Linux / macOS / Windows)

Lo más útil si no usás Windows o si solo vas a tocar el backend / despliegue:

```bash
git clone https://github.com/JRNCarrizo/bodegaStock.git
cd bodegaStock
npm install

# Si better-sqlite3 falló o se compiló para otro ABI:
npm rebuild better-sqlite3

cp .env.example .env   # opcional; ajustar JWT_SECRET / rutas
npm run start:api      # o: npm run dev:api  (reload)
```

Health check:

```text
http://127.0.0.1:3847/api/health
```

Login inicial (base vacía): `admin` / `admin123`

Sin `DATABASE_URL` usa **SQLite** en `BODEGA_DATA_DIR` (default `./data` o el de `.env`).  
Con `DATABASE_URL` apunta a **PostgreSQL**.

```bash
# Ejemplo con Postgres local
export DATABASE_URL=postgresql://user:pass@localhost:5432/bodegastock
export JWT_SECRET=una-clave-larga-al-azar
npm run start:api
```

---

## Desarrollo — app completa (Electron + UI)

```bash
npm install
npm run dev
```

Abre Electron con hot reload. En Linux/macOS sirve para desarrollar UI y API embebida; el instalador de producción actual es Windows (`npm run dist`).

---

## Docker (igual que producción / Railway)

```bash
docker build -t controlstock-api .
docker run --rm -p 3847:3847 \
  -e JWT_SECRET=una-clave-larga-al-azar \
  -e BODEGA_DATA_DIR=/data \
  -v controlstock-data:/data \
  controlstock-api
```

Con Postgres:

```bash
docker run --rm -p 3847:3847 \
  -e JWT_SECRET=una-clave-larga-al-azar \
  -e DATABASE_URL=postgresql://user:pass@host:5432/db \
  -e BODEGA_DATA_DIR=/data \
  -v controlstock-data:/data \
  controlstock-api
```

Probar: `http://127.0.0.1:3847/api/health`

Guía de despliegue en Railway: [docs/CONEXION-RAILWAY.md](docs/CONEXION-RAILWAY.md)  
Ficha técnica para terceros: [docs/FICHA-TECNICA.md](docs/FICHA-TECNICA.md)

---

## App móvil (Android)

```bash
npm run cap:sync
cd android && ./gradlew assembleRelease
```

Live reload en dispositivo: [docs/ANDROID-DEV.md](docs/ANDROID-DEV.md)

```bash
npm run dev:android              # dispositivo físico (misma red)
npm run dev:android:emulator     # emulador
```

---

## Documentación

| Documento | Contenido |
|-----------|-----------|
| [docs/FICHA-TECNICA.md](docs/FICHA-TECNICA.md) | Ficha técnica (arquitectura, stack, despliegue) |
| [docs/CONEXION-RAILWAY.md](docs/CONEXION-RAILWAY.md) | Pasos para conectar a Railway |
| [docs/SERVIDOR-CLOUD-RAILWAY-FUTURO.md](docs/SERVIDOR-CLOUD-RAILWAY-FUTURO.md) | Detalle modo nube + Postgres |
| [docs/ESTADO-ACTUAL.md](docs/ESTADO-ACTUAL.md) | Panorama del proyecto |
| [docs/ESPECIFICACION.md](docs/ESPECIFICACION.md) | Visión, módulos, reglas de negocio |
| [docs/MODELO-DE-DATOS.md](docs/MODELO-DE-DATOS.md) | Entidades y relaciones |
| [docs/USUARIOS-Y-PERMISOS.md](docs/USUARIOS-Y-PERMISOS.md) | Roles y permisos |
| [docs/INVENTARIO.md](docs/INVENTARIO.md) | Inventario online / offline |
| [docs/INVENTARIO-OFFLINE-ESTADO.md](docs/INVENTARIO-OFFLINE-ESTADO.md) | Flujo offline y archivos clave |
| [docs/DESGLOSE-DE-CANTIDADES.md](docs/DESGLOSE-DE-CANTIDADES.md) | Pallet / caja / suelto |
| [docs/APP-MOVIL.md](docs/APP-MOVIL.md) | APK y conexión |
| [docs/ANDROID-DEV.md](docs/ANDROID-DEV.md) | Live reload y build APK |
| [docs/MULTI-LOGISTICA.md](docs/MULTI-LOGISTICA.md) | Multi-logística |

---

## Stack

- **API:** Node.js / Fastify (puerto `3847`)
- **UI:** React + TypeScript + Tailwind
- **Escritorio:** Electron
- **Móvil:** Capacitor (Android)
- **DB local:** SQLite · **DB nube:** PostgreSQL (`DATABASE_URL`)
- **Export:** Excel (`exceljs`)

---

## Scripts útiles

| Script | Uso |
|--------|-----|
| `npm run start:api` | API standalone (producción local) |
| `npm run dev:api` | API con watch |
| `npm run dev` | Electron + UI (desarrollo) |
| `npm run build` | Build Electron |
| `npm run dist` | Instalador Windows (NSIS) |
| `npm run cap:sync` | Sync Capacitor / assets móvil |
