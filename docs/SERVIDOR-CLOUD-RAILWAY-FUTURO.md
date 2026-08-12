# Servidor en la nube (Railway) — plan futuro

> **Estado: NO implementado.** Documento de planeamiento (agosto 2026).  
> **No tocar código** hasta priorizar esta feature.  
> Complementa [ESPECIFICACION.md](ESPECIFICACION.md) §2 (arquitectura LAN + SQLite).

---

## 1. Problema / motivación

Hoy ControlStock funciona así:

- **Una PC** con Electron = API (Fastify `:3847`) + **SQLite en el disco de esa PC**.
- Otras PCs y celulares/APK dependen de que esa máquina esté prendida y en la LAN.
- Riesgo: corrupción, robo/rotura del disco, o “no está la notebook del servidor” → se corta la operación o se pierden datos.

**Pedido del negocio:**

1. Base de datos en un **servidor externo** (ej. Railway), con respaldo.
2. Instalar la app en **varias PCs** de la empresa.
3. Todas ven **los mismos datos**, sin depender de una compu puntual ni de una persona.
4. Migrar la información **ya cargada** (no empezar de cero).

---

## 2. Decisión de arquitectura (acordada)

### Camino a seguir: API + Postgres en la nube (Opción B)

```
Railway (u similar)
  ├── API Fastify (el “cerebro” que hoy está embebido en Electron)
  └── Postgres (base de datos) + backups del proveedor
           ↑
      internet (HTTPS)
           ↑
  PC1 / PC2 / PC3 (Electron o navegador) + APK / celulares
  → todos apuntan a la MISMA URL del servidor
```

**Qué significa “subir la API”:** sacar el servidor que hoy corre adentro del instalador Windows y dejarlo corriendo 24/7 en Railway, con una URL tipo `https://….up.railway.app`. Las pantallas solo se conectan ahí (igual que hoy el celu se conecta a la IP del PC, pero la dirección pasa a ser la de la nube).

### Qué NO hacer

- Subir solo el archivo `.sqlite` y que varias apps lo abran a la vez → frágil y riesgoso.
- Dejar la API en cada PC y solo “conectar SQLite a Railway” → no resuelve multi-PC + APK de forma limpia.

### Premisa aceptada

- La operación **online en la nube** requiere **internet**.
- El inventario **offline** (conteo sin WiFi al servidor) sigue siendo un caso especial; el import/sync final apuntará al servidor cloud cuando estén en modo nube. Detalle: [INVENTARIO-OFFLINE-ESTADO.md](INVENTARIO-OFFLINE-ESTADO.md).
- **Modo local no se elimina:** la app debe seguir pudiendo usarse como hoy (PC = API + SQLite en LAN). Cloud es el camino principal para el negocio multi-PC; local queda como **opción** (demo, emergencia, sitio sin internet para online, desarrollo).

### Dos modos de operación (oficial)

| Modo | Dónde está la API + datos | Quién se conecta |
|------|---------------------------|------------------|
| **Local (actual)** | PC Electron + SQLite | LAN / IP `:3847` (PCs y APK como hoy) |
| **Nube (nuevo)** | Railway: API + Postgres | URL HTTPS; cualquier internet |

En Configuración (escritorio y APK): elegir o indicar **servidor local** vs **URL remota**.  
Mientras se desarrolla cloud, el laburo **sigue operando en local** sin interrupción. El corte a nube es opcional y reversible a nivel producto (pueden volver a local si hace falta; los datos no se “sincronizan mágicamente” entre modos salvo migración explícita).

### Trabajo en paralelo

1. **Producción actual:** modo local, sin cambios de uso diario.
2. **Desarrollo en casa:** modo nube + migrador + URL, con proyecto Railway de prueba.
3. **Día de corte:** migrar SQLite → Postgres y pasar clientes a la URL.
4. **Después:** default nube para la empresa; **opción local sigue disponible** en la app.

### Inventario offline + cloud (aclarado)

| Momento | Cómo |
|--------|------|
| Conteo + sync entre contadores | **Red local** entre celulares (hotspot / WiFi depósito), igual que hoy. No va por Railway en cada paso. |
| Import del paquete al sistema | En modo nube: al **servidor cloud** por **cualquier internet**. **No** hace falta estar en la LAN de “la PC servidor”. |
| Ver el inventario en las PCs | Consultan el servidor activo (local o Railway según config). |

Variante descartada como default: celu → LAN → PC → cloud (puente de más). Solo tendría sentido si el cliente insiste en el hábito “siempre importamos a la PC”.

Riesgo de pérdida en el import: no es mayor “por ser nube” si el celu **no borra** el paquete local hasta OK del servidor y se puede reintentar. El proveedor además aporta backups de la base.

---

## 3. Experiencia deseada el día del corte (para el cliente)

Objetivo: que en la empresa **no** haya que tocar SQL a mano.

1. Crear cuenta / proyecto en Railway (empresa) → obtener URL de la API (y credenciales internas de Postgres).
2. En ControlStock (PC que hoy tiene los datos), Configuración:
   - Pegar **URL del servidor** en la nube.
   - Acción tipo **“Migrar a servidor en la nube”** (asistente / botón).
3. El asistente lee el SQLite local, copia datos a Postgres, valida.
4. Pausar cargas un rato durante la migración.
5. Misma URL en el resto de PCs y en la APK.
6. Probar login, stock, un movimiento.
7. Conservar el `.sqlite` viejo como archivo de respaldo (no borrar).

El desarrollo del asistente y del backend cloud se hace **antes**; el día en planta es operativo.

---

## 4. Cómo trabajar (casa vs trabajo)

| Dónde | Qué |
|--------|-----|
| **En casa (desarrollo)** | Portar API a Postgres; desplegar en Railway de prueba; URL configurable en PC/APK; asistente de migración; releases/updates; pruebas con base de prueba o copia |
| **En el trabajo (puesta en marcha)** | Cuenta Railway de la empresa; URL real; migrar la base productiva; pegar URL en cada puesto; validar; corte |

No hace falta programar sentado en la oficina. Sí hace falta **acceso a la base real** (o una copia del `.sqlite`) para el corte / ensayo final.

---

## 5. Alcance técnico (cuando se implemente)

### Sí (v1 cloud)

1. Postgres en Railway (o equivalente).
2. API Fastify desplegada (mismo contrato REST en lo posible).
3. Migraciones / esquema alineado a [MODELO-DE-DATOS.md](MODELO-DE-DATOS.md).
4. Herramienta o pantalla **Migrar SQLite → Postgres** (datos reales).
5. Configuración de **URL del servidor** / modo **local vs nube** en escritorio y APK (el modo local actual se **conserva**).
6. HTTPS; auth JWT como hoy.
7. Documentar backups del proveedor y retención del SQLite histórico.

### No (v1)

- Multi-tenant SaaS (varias empresas en una sola instalación).
- Usar SQLite como base primaria **compartida en la nube**.
- **Eliminar** el servidor embebido / modo LAN local.
- Reescribir la UI.
- Resolver OCR u otros futuros en el mismo paquete.

### Impacto por módulo (alto nivel)

| Área | Efecto |
|------|--------|
| Auth / usuarios | Misma lógica; sesión contra API cloud |
| Stock / ingresos / planillas / etc. | Misma API; DB Postgres |
| APK / web | URL cloud en lugar de IP LAN `:3847` |
| Varias PCs | Todas la misma URL |
| Inventario offline | Conservar flujo; destino de import = cloud |
| Sin internet | Operación online no disponible |

---

## 6. Fases sugeridas

1. **Descubrimiento** — confirmar internet estable; cuenta Railway de la empresa; rol de Electron (cliente vs solo navegador).
2. **Diseño** — Postgres + API en Railway; variables de entorno; backups.
3. **Port SQLite → Postgres** + pruebas con dump de prueba.
4. **Asistente / procedimiento de migración** de la base real.
5. **Clientes** — URL configurable + release.
6. **Piloto** — 1 PC + 1 celu contra cloud de prueba.
7. **Corte** en planta + retención del SQLite.
8. (Opcional) monitoreo, alertas, endurecer backups.

---

## 7. Checklist de listo (cuando se priorice)

- [ ] API responde en URL HTTPS pública (Railway u otro)
- [ ] Postgres con esquema migrado y smoke tests
- [ ] Migración desde SQLite de producción probada en copia
- [ ] Escritorio y APK permiten modo **local** y modo **URL nube**
- [ ] Varias sesiones concurrentes (2 PCs) en nube sin corrupción
- [ ] Operación local sigue funcionando como antes (regresión)
- [ ] Backup/restore documentado
- [ ] Inventario offline: import al cloud verificado
- [ ] Día de corte acordado con el cliente (ventana sin carga)

---

## 8. Preguntas abiertas (responder antes de codear)

1. ¿Internet confiable en oficina y depósito todo el día?
2. ¿Cuenta Railway (u otro) a nombre de la empresa?
3. ¿Siguen con instalador Electron en cada PC, o priorizan navegador + APK?
4. ¿Quién administra facturación/backups del hosting?
5. ¿Fecha tentativa de corte y si pueden pausar operaciones un rato?
6. ¿Hay una sola base productiva (PC servidor) o copias viejas en otras máquinas?

---

## 10. Pasos en Railway (guía operativa)

> Orden pensado para cuando se implemente. Hoy es checklist; no implica que ya exista el deploy.

### A. Cuenta y proyecto (empresa)

1. Crear cuenta en [railway.com](https://railway.com) a nombre de la empresa (tarjeta / facturación).
2. Elegir plan **Pro** (~u$s 20/mes) para producción (Hobby solo para pruebas).
3. Crear un **Project** (ej. `controlstock-prod`).
4. (Opcional) Poner un **usage limit** / tope de gasto en el panel.

### B. Base de datos

5. En el proyecto: **New** → **Database** → **PostgreSQL**.
6. Anotar / copiar la variable `DATABASE_URL` (connection string) que genera Railway.
7. Confirmar que el volumen/disco alcanza (arranque chico; se puede subir después).

### C. API (el “cerebro”)

8. Conectar el repo de GitHub (`bodegaStock`) **o** desplegar la API empaquetada (cuando exista el modo “solo servidor”, sin UI Electron).
9. Crear un **Service** para la API (Node / Dockerfile, según cómo se empaquete).
10. Variables de entorno típicas (nombres orientativos):
    - `DATABASE_URL` = la del Postgres (referencia al servicio DB)
    - `JWT_SECRET` / secretos de auth
    - `PORT` = el que Railway inyecte / espere
    - Lo demás que hoy asuma el server embebido
11. **Deploy** → esperar build OK.
12. En el servicio API: **Generate Domain** (o dominio custom) → queda la URL pública HTTPS, ej. `https://controlstock-api.up.railway.app`.

### D. Migraciones y datos

13. Correr migraciones de esquema sobre Postgres (vacío).
14. Desde la PC que tiene el SQLite productivo (o una copia):
    - Abrir ControlStock → Configuración → pegar URL de la API.
    - Ejecutar **Migrar a servidor en la nube** (asistente a desarrollar).
15. Verificar conteos: usuarios, productos, stock, últimos movimientos.
16. Guardar el `.sqlite` viejo como archivo de respaldo (no borrar).

### E. Clientes (PCs y celulares)

17. En **cada PC**: Configuración → misma URL de la API → guardar.
18. En **cada APK**: misma URL (como hoy se pone la IP del PC).
19. Probar: login, consulta de stock, un ingreso/planilla, abrir un inventario.

### F. Día a día

20. Actualizaciones de app: release normal del instalador/APK; la URL del servidor no cambia.
21. Backups: usar los de Railway (Postgres) + política interna de retención.
22. Revisar el primer mes de factura/uso y ajustar tamaño de API/DB si hace falta.

### Orden resumido (una página)

```text
Cuenta Pro empresa
  → Proyecto
    → Postgres (DATABASE_URL)
    → Servicio API (env + deploy + dominio HTTPS)
      → Migraciones
      → Migrar datos desde SQLite (asistente)
        → Pegar URL en todas las PCs / APK
          → Probar y operar
```

### Notas

- El horario laboral 7–16 implica **poco tráfico**; igual la API+DB suelen quedar **24/7** (no apagar de noche en producción).
- Inventario offline: sync entre celus en local; **import** del paquete a esta URL con cualquier internet.
- Hasta que el código soporte “API standalone + Postgres + migrador”, estos pasos no se pueden completar end-to-end; sirven como hoja de ruta con el cliente.