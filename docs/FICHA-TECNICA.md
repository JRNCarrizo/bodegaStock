# ControlStock — Ficha técnica

**Producto:** ControlStock (BodegaStock)  
**Versión de referencia:** v0.3.71  
**Fecha:** septiembre 2026  
**Repositorio:** https://github.com/JRNCarrizo/bodegaStock  

Documento para terceros (infraestructura / despliegue / integración).  
Pasos Railway: [CONEXION-RAILWAY.md](CONEXION-RAILWAY.md)

---

## 1. Descripción

Sistema de gestión de stock e inventarios para **bodega / distribuidora**.

Incluye:
- App de **escritorio Windows** (administración y, hoy en planta, servidor local)
- **API REST** propia
- Clientes en **PC**, **navegador móvil** y **APK Android**
- Módulo de **inventario físico** (online y offline en depósito)

**Uso actual en planta:** servidor local (una PC + SQLite en LAN).  
**Modo nube:** implementado en código (API Docker + Postgres); pendiente de corte productivo.

---

## 2. Arquitectura

### Hoy (local)

```
PC Windows (Electron)
  ├── UI React
  ├── API Fastify (:3847)
  └── SQLite
         │
         └── WiFi LAN ──► Celulares (APK / navegador) y otras PCs
```

### Objetivo nube

```
PC / APK  ──HTTPS──►  Nube
                       ├── API Fastify (Docker)
                       └── PostgreSQL
```

Los clientes (Electron / APK) se configuran con la **URL pública** del servidor.  
No se despliega Electron ni la APK en la nube: solo API + base de datos.

---

## 3. Stack tecnológico

| Capa | Tecnología |
|------|------------|
| Lenguaje | TypeScript / JavaScript |
| Backend / API | Node.js + Fastify |
| Base local | SQLite (`better-sqlite3`) |
| Base nube | PostgreSQL |
| Frontend | React 18 + TypeScript + Tailwind CSS |
| Escritorio | Electron (+ instalador NSIS Windows) |
| Móvil | Capacitor (Android) |
| Auth | JWT + bcrypt |
| Empaquetado nube | Docker (`Dockerfile`) + entry `server/standalone.ts` |
| Exportaciones | Excel (exceljs) |

**Frase resumen:** empaquetado en Docker; adentro corre la API Fastify (Node). En la nube hace falta eso + Postgres y una URL HTTPS.

---

## 4. Componentes a desplegar en la nube

| Componente | Qué es |
|------------|--------|
| Servicio API | Contenedor Docker del repo |
| PostgreSQL | Base de datos |
| Volumen `/data` | Archivos / imágenes (recomendado) |
| Dominio HTTPS | URL pública para clientes |

### Variables de entorno (servicio API)

| Variable | Obligatorio | Notas |
|----------|-------------|-------|
| `DATABASE_URL` | Sí | Al vincular Postgres suele inyectarse sola |
| `JWT_SECRET` | Sí (producción) | Clave larga al azar |
| `BODEGA_DATA_DIR` | Opcional | Ej. `/data` con volumen |
| `PORT` | No | Lo define el hosting |

### Verificación

`GET https://<dominio>/api/health` → respuesta OK.

### Conexión de clientes

En la app: **Configuración → modo Nube** → pegar URL → Probar → Guardar.  
Migración de datos locales (SQLite → Postgres): asistente en Configuración (usuario admin).

---

## 5. Puertos (modo local)

| Puerto | Uso |
|--------|-----|
| 3847 | API + UI web del PC servidor |
| 3850 | Sync entre celulares (inventario offline / hotspot) |

---

## 6. Módulos funcionales

| Módulo | Descripción breve |
|--------|-------------------|
| Productos / sectores / usuarios | Catálogo, zonas de stock, roles y permisos |
| Consulta de stock | Por producto / sector; export Excel |
| Ingresos | Remitos de entrada |
| Planillas | Salidas (camioneros / vehículos) |
| Retornos | Devoluciones (verificación configurable) |
| Roturas / pérdidas | Descuento de stock |
| Movimientos internos | Entre sectores |
| Inventario | Conteo físico online; offline en depósito con sync e import |
| Agenda de turnos | Insumos / confirmación |
| Reportes | Movimientos del día |
| Multi-logística | Varias logísticas en la misma instalación |
| Configuración | Servidor local o URL nube, updates, migrador |

---

## 7. Clientes

| Cliente | Tecnología | Rol |
|---------|------------|-----|
| Windows | Electron | Admin / servidor local hoy; cliente de la nube después |
| Android | Capacitor (APK) | Operación e inventario |
| Navegador | Misma UI React | Acceso web a la API |

Actualizaciones de Setup/APK se publican como **GitHub Releases**.

---

## 8. Seguridad

- Usuario y contraseña
- Sesiones con JWT
- Permisos por módulo
- En nube: HTTPS obligatorio hacia la API
- `JWT_SECRET` propio en el entorno de producción

---

## 9. Requisitos para el equipo de despliegue

1. Acceso al repositorio (colaborador si es privado, o repo público).
2. Hosting con soporte **Docker** + **PostgreSQL** (Railway u otro).
3. Configurar variables, volumen y dominio HTTPS.
4. Entregar la URL a quien configura las apps en planta.
5. Coordinar migración de datos y ventana de corte (opcional backup previo del PC).

Guía paso a paso (Railway): [CONEXION-RAILWAY.md](CONEXION-RAILWAY.md).

---

## 10. Fuera de alcance de este documento

- Cotización comercial o licencia  
- Desarrollo a medida  
- iOS (hoy solo Android)  
- ERP contable / facturación AFIP  

---

*ControlStock / BodegaStock — ficha técnica para terceros — v0.3.71*
