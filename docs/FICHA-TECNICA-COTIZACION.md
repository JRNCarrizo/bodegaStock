# ControlStock (BodegaStock) — Ficha técnica para cotización

> **Documento pensado para terceros e IAs.**  
> Describí el sistema tal como está construido (julio 2026, **v0.3.12**).
> Podés pegar este archivo completo en ChatGPT / Claude / Gemini y pedir una cotización independiente de desarrollo o de licencia.

**Nombre comercial:** ControlStock  
**Nombre técnico / repo:** BodegaStock  
**Autor:** JRNCarrizo  
**Tipo de producto:** Sistema de gestión de stock e inventarios para **bodega / distribuidora**  
**Alcance típico de venta:** 1 local / 1 empresa (licencia de uso)

---

## 1. Resumen ejecutivo (qué es)

ControlStock es un **sistema completo de gestión de stock** orientado a distribuidoras y bodegas, que opera principalmente en **red local (LAN)** sin depender de internet.

Incluye:

1. **Aplicación de escritorio Windows (Electron)** que actúa como **servidor + administración**.
2. **API REST embebida** en el mismo PC (Fastify / Node.js).
3. **Base de datos local SQLite** (ledger de movimientos, stock por sector, usuarios, inventarios).
4. **Interfaz web responsive (React)** usable desde PC y desde el navegador del celular en la misma WiFi.
5. **APK Android nativa (Capacitor)** con la misma UI React, más cámara, almacenamiento local y sincronización P2P.
6. **Módulo de inventario físico dual** (dos contadores en paralelo) con:
   - modo **online** (conteo contra el PC), y
   - modo **offline** (conteo sin WiFi al PC, sync entre celulares por hotspot, luego importación al servidor).

No es un prototipo de una sola pantalla: es un sistema multi-módulo con reglas de negocio, permisos, trazabilidad y flujo de inventario de punta a punta.

---

## 2. Arquitectura

```
┌──────────────────────────────────────────────────────────────┐
│                 PC SERVIDOR (Windows / Electron)              │
│  ┌────────────────────┐   ┌───────────────────────────────┐  │
│  │ UI escritorio      │   │ API REST Fastify (:3847)      │  │
│  │ React + Tailwind   │   │ Auth JWT + permisos           │  │
│  └────────────────────┘   └──────────────┬────────────────┘  │
│                                          │                    │
│                               ┌──────────▼──────────┐         │
│                               │ SQLite (better-sqlite3)│      │
│                               │ Stock + movimientos    │      │
│                               │ Inventarios + usuarios │      │
│                               └─────────────────────┘         │
└───────────────────────────────┬──────────────────────────────┘
                                │  LAN / WiFi oficina (:3847)
              ┌─────────────────┼─────────────────┐
              │                 │                 │
        ┌─────▼─────┐     ┌─────▼─────┐     ┌─────▼─────┐
        │ Celular   │     │ Celular   │     │ Celular N │
        │ Navegador │     │ APK Android│    │ web / APK │
        │ (misma UI)│     │ Capacitor │     │           │
        └───────────┘     └─────┬─────┘     └───────────┘
                                │
                    (Inventario OFFLINE en depósito)
                                │
                    Hotspot P2P HTTP :3850
                    Contador ↔ Contador
```

### Principios

| Principio | Detalle |
|-----------|---------|
| Un solo servidor | El PC Electron hospeda UI web, API y base de datos |
| Sin cloud obligatorio | Opera en LAN; no requiere SaaS externo para el día a día |
| Misma UI React | PC, navegador móvil y APK comparten el frontend |
| Stock por sector | Un producto puede tener stock en varios sectores |
| Ledger / trazabilidad | Los cambios de stock generan movimientos auditables |
| Doble verificación | Inventario con 2 contadores; retornos y movimientos internos con verificación **configurable** (activar/desactivar desde Configuración) |

---

## 3. Stack tecnológico (real)

### Escritorio / servidor

| Capa | Tecnología |
|------|------------|
| Shell escritorio | **Electron 33** + **electron-vite** + **electron-builder** (instalador NSIS Windows x64) |
| Actualizaciones | **electron-updater** (releases GitHub) |
| Backend API | **Node.js** + **Fastify 5** |
| Base de datos | **SQLite** vía **better-sqlite3** (transacciones, migraciones propias) |
| Auth | **JWT** (`jsonwebtoken`) + **bcryptjs** |
| Excel | **exceljs** (exportaciones `.xlsx` e importación de plantilla de productos) |
| Estáticos / CORS | `@fastify/static`, `@fastify/cors` |
| Iconos de app | Generados desde `build/icon.svg` con `npm run icons` (ICO/PNG para instalador y APK) |

### Frontend (compartido PC + móvil)

| Capa | Tecnología |
|------|------------|
| UI | **React 18** + **TypeScript** |
| Routing | **react-router-dom 7** |
| Estilos | **Tailwind CSS 3** |
| Iconos | **lucide-react** |
| Utilidades UI | `clsx`, `tailwind-merge` |
| Escaneo / QR | **html5-qrcode**, **qrcode**, **jsbarcode** |
| Build web | **Vite 5** |
| Build móvil web | Vite config dedicada (`vite.config.mobile.ts`) |

### Móvil Android

| Capa | Tecnología |
|------|------------|
| Contenedor nativo | **Capacitor 8** (`@capacitor/android`) |
| App id | `com.jrncarrizo.bodegastock` |
| Plugins | App, Filesystem, Preferences, Share |
| Servidor HTTP local P2P | `@cantoo/capacitor-http-server` (puerto **3850**) |
| Cámara | permiso `CAMERA` + escáner de barras/QR en UI |
| Entrega | APK debug/release generada con Android Gradle |

### Puertos

| Puerto | Uso |
|--------|-----|
| **3847** | API + UI web del PC servidor |
| **3850** | Sync P2P entre celulares (hotspot) en inventario offline |

---

## 4. Entregables del producto

1. **Instalador Windows** de ControlStock (Electron / NSIS).
2. **APK Android** para operadores / contadores.
3. **Base SQLite** local en el PC (datos de la empresa).
4. Configuración de servidor por **IP + puerto** y/o **QR** desde el PC.
5. Documentación técnica interna en carpeta `docs/` (especificación, inventario, móvil, modelo de datos, permisos).

---

## 5. Módulos funcionales implementados

### Administración y catálogo

- **Productos:** alta/edición, código interno destacado, código de barras (manual / escaneo / generación), activo/inactivo, impresión de códigos; listado paginado; **plantilla Excel** + **importación masiva flexible** (también reconoce listados logísticos con títulos previos y columnas `Código de producto` / `Descripción`).
- **Sectores:** estructura de bodega / zonas de stock.
- **Usuarios y permisos:** roles y permisos granulares por módulo.
- **Camioneros:** padrón para planillas / salidas.
- **Configuración:** URL/IP del servidor, QR de conexión, actualizaciones; toggles de **doble verificación** (`retornos_doble_verificacion`, `movimientos_doble_verificacion`).
- **Pie de página:** copyright de producto en la UI (ControlStock / JRNCarrizo).

### Consulta de stock

- Vistas: **Por producto**, **Por sector**, **Ver todos** (solo productos con stock > 0, listado paginado).
- Búsqueda por código/nombre; stock por sector; desglose pallet/caja/suelto.
- **Export Excel** del stock agregado por producto (código, nombre y cantidad; opción de incluir o no productos en cero).

### Operación de stock

- **Ingresos:** remitos de entrada con líneas de desglose (pallet × unidades + sueltos).
- **Planillas:** salidas asociadas a camionero.
- **Retornos:** carga + verificación opcional (doble control configurable; ingreso directo si está desactivado).
- **Roturas / pérdidas.**
- **Movimientos internos** entre sectores (enviar/recibir; verificación opcional).
- **Reportes** por día / rangos.

#### Exportaciones Excel

Listados `.xlsx` generados por la API (agregaciones de consulta; no son tablas nuevas):

| Ruta | Uso |
|------|-----|
| `consulta/export/stock-productos` | Stock total por producto |
| `ingresos/:id/export` | Detalle de un ingreso |
| `planillas/:id/export` | Detalle de una planilla |
| `retornos/:id/export` | Detalle de un retorno |
| `roturas/export-dia` | Roturas del día |
| `inventario/sesiones/:id/export` | Reporte de cierre con sistema / contado / diferencias |
| `inventario/sesiones/:id/export-stock` | Stock final limpio de la sesión cerrada |

**Formato típico de filas de productos:** código, nombre, descripción, cantidad.  
En roturas se agrega observación; en inventario hay export del reporte con diferencias y otro del **stock final limpio**.

### Inventario físico (diferenciador fuerte)

#### Inventario ONLINE
- Sesión de inventario en PC.
- Dos contadores por sector.
- Conteo por líneas independientes.
- Finalización, comparación entre contadores, reconteo, cierre.
- Comparación contado vs stock del sistema (cierre supervisado).
- **Export Excel** de la sesión.
- Pulido de UI y UX de conteo: desglose cerrado por defecto, formulario adaptado al teclado móvil, tipografía/áreas táctiles ampliadas, scroll controlado y footer de acciones.
- Clasificación obligatoria por ubicación cuando el sector utiliza ubicaciones.

#### Inventario OFFLINE (implementado de punta a punta)
Diseñado para depósitos **sin WiFi al PC**:

1. PC crea sesión; los sectores nuevos quedan en modo `OFFLINE` por defecto.
2. En oficina, cada celular **descarga un paquete** (catálogo + asignación + datos de sesión).
3. En depósito, cuentan **sin red al PC** (storage local: Filesystem + Preferences).
4. Al finalizar, sincronizan **entre sí por hotspot** (HTTP local, QR con actualización automática de IP, reintentos).
5. **Comparación A** en el celular (contador 1 vs 2).
6. Si hay diferencias → **reconteo local** (solo productos en diferencia, alta directa de líneas en cero) + nueva sync.
7. Antes de sincronizar se puede **seguir editando**; después de la comparación, toda corrección usa reconteo.
8. Si coinciden → **importación al PC** con confirmación (`importado_at`) y respaldo local previo a borrar el paquete de trabajo.
9. Durante la transferencia, la PC muestra **Recibiendo conteo…** en vivo.
10. Plan B: generar archivo final con checksum en el celular e importarlo manualmente en la fila del sector de la PC.
11. En PC → **Comparación B** vs sistema y cierre de sesión.

Extras de robustez offline:
- Login offline con credenciales cacheadas.
- Limpieza de paquetes de sesiones canceladas al reconectar con el PC.
- Respaldo JSON como contingencia entre celulares y paquete final validado hacia la PC (ambos secundarios al flujo por red).
- Escáner de barras/QR en conteo y en login (IP del PC).

---

## 6. Modelo de datos (visión)

Entidades principales (SQLite):

- Usuarios, permisos/roles
- Productos
- Sectores / ubicaciones
- Stock por sector (con desglose de líneas: pallet, caja, suelto)
- Movimientos (ledger)
- Ingresos, planillas, retornos, roturas, movimientos internos
- Camioneros
- Sesiones de inventario, sectores de inventario, líneas de conteo por contador y ronda
- Flags offline: `modo_conectividad`, `paquete_descargado_at`, `importado_at`
- **`app_settings`:** claves de configuración (doble verificación de retornos y movimientos)
- En retornos y movimientos internos: flag **`ingreso_directo`** cuando la verificación doble está desactivada

Regla de negocio clave: el stock no es “un número mágico”; se trabaja con **desglose operativo** (pallet × unidades + sueltos) de forma consistente en ingresos, consulta e inventario.

Detalle: ver [MODELO-DE-DATOS.md](MODELO-DE-DATOS.md).

---

## 7. Seguridad y acceso

- Autenticación por usuario/contraseña.
- Tokens JWT.
- Permisos por módulo (`consulta.ver`, `inventario.contar`, `inventario.supervisar`, etc.).
- En móvil: configuración de servidor; sesión offline controlada.
- Operación pensada para red local (no expuesto a internet por defecto).

---

## 8. Complejidad / esfuerzo (señales objetivas para cotizar)

Usá estas señales para estimar (no son horas facturadas del autor; son hechos del sistema):

| Señal | Evidencia |
|-------|-----------|
| Multi-plataforma | Electron Windows + Web responsive + APK Android Capacitor |
| Backend propio embebido | Fastify + SQLite + migraciones + auth + ~14 grupos de rutas API |
| Frontend amplio | ~16 pantallas/páginas principales + componentes de dominio |
| Dominio de negocio no trivial | Stock por sector, ledger, desglose pallet/caja/suelto, dobles controles configurables |
| Inventario dual | Dos contadores, rondas, comparación, reconteo |
| Inventario offline real | Paquete local, P2P HTTP hotspot, comparación A, reconteo, import con confirmación/estado en PC y archivo final Plan B |
| Excel | Exportaciones operativas + plantilla/import de productos |
| Empaquetado | Instalador NSIS + pipeline de APK Android |
| Documentación de producto | Varios documentos en `docs/` (especificación, inventario, móvil, datos, permisos) |

### Módulos API (lado servidor)

`auth`, `usuarios`, `productos`, `sectores`, `consulta`, `ingresos`, `planillas`, `retornos`, `roturas`, `movimientos-internos`, `camioneros`, `reportes`, `inventario` (incluye offline), `configuracion`.

### Pantallas frontend principales

Login, Dashboard, Productos, Sectores, Consulta, Ingresos, Planillas, Retornos, Roturas, Movimientos, Reportes, Usuarios, Camioneros, Configuración, Inventario (online), Inventario Offline.

---

## 9. Qué NO es (para no cotizar de más ni de menos)

- No es un ERP contable completo (facturación AFIP, contabilidad, sueldos).
- No es SaaS multi-tenant en la nube (es on-premise / LAN).
- No incluye iOS todavía (Android sí).
- No reemplaza WMS de gran logística internacional; está pensado para **distribuidora / bodega mediana**.

---

## 10. Escenario comercial típico

| Ítem | Valor |
|------|-------|
| Cliente | 1 distribuidora / 1 bodega |
| Entrega | Instalador PC + APK + puesta en marcha |
| Modalidad | Licencia de uso (no necesariamente cesión de código fuente) |
| Operación | PC servidor en oficina + celulares en depósito |

---

## 11. Prompt sugerido para pedirle cotización a una IA

Copiá y pegá esto junto con este documento:

```
Actuá como un analista de software senior y un comercial técnico imparcial.
Leé la ficha técnica adjunta de ControlStock/BodegaStock.

Pedime DOS cotizaciones separadas en USD (y si podés, equivalente orientativo para Argentina):

A) Costo de DESARROLLO a medida si se construyera de cero hoy
   (rango bajo / medio / alto), con supuestos de equipo y meses.

B) Precio de LICENCIA / venta de software YA HECHO
   para UNA sola distribuidora (pago único), con instalación y soporte inicial 30–60 días,
   SIN cesión de código fuente.

Explicá:
1) qué partes aportan más valor (especialmente inventario offline + P2P),
2) riesgos de mantenimiento,
3) qué quedaría fuera del precio (customizaciones grandes, iOS, cloud, etc.).

No inventes módulos que no estén en la ficha. Basate solo en lo documentado.
```

---

## 12. Estado del producto (honestidad comercial)

**Estado:** sistema operativo en uso de desarrollo/pruebas de campo (**v0.3.12**), con flujo principal de inventario offline **implementado de punta a punta** (descarga → conteo → sync P2P → comparación → reconteo → import confirmado al PC).

**Entregado en el estado actual:** exportaciones Excel operativas, importación de productos por plantilla, doble verificación opcional y mejoras de inventario: actualización automática del listado, formulario adaptado al teclado, reconteo más directo, edición previa al sync, QR/IP de hotspot autorrefrescable, estado de recepción en PC y archivo final Plan B.

**Pendientes normales de producto maduro:** pruebas de campo intensivas, eventual iOS, mejoras visuales adicionales, posibles módulos futuros según cliente.

---

*Documento generado para evaluación y cotización independiente — ControlStock / BodegaStock **v0.3.12** — julio 2026.*
