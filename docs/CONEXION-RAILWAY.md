# Conectar ControlStock a Railway — pasos

> Guía corta para la reunión / despliegue.  
> Repo: https://github.com/JRNCarrizo/bodegaStock

---

## Qué se sube

Solo la **API** + **Postgres**.  
El PC (Electron) y el APK son clientes: se conectan con la URL pública.

---

## Pasos en Railway

### 1. Cuenta y proyecto
1. Entrar a [railway.com](https://railway.com) y crear cuenta.
2. **New Project**.

### 2. Base de datos
1. **Add** → **Database** → **PostgreSQL**.
2. Dejar que Railway la cree (no hace falta tocar variables del Postgres).

### 3. API desde el repo
1. **Add** → **GitHub Repo** → elegir `bodegaStock` (hace falta ser colaborador del repo si es privado).
2. Railway usa el `Dockerfile` del repo.

### 4. Variables en el servicio de la **API** (no en Postgres)
1. Vincular Postgres al servicio API → aparece **`DATABASE_URL`** solo.
2. Crear a mano:
   - **`JWT_SECRET`** = una clave larga al azar (ej. pegar un texto largo inventado).
3. (Opcional) **`BODEGA_DATA_DIR`** = `/data` si van a montar volumen para imágenes.

### 5. Volumen (recomendado)
1. En el servicio API → **Volumes**.
2. Montar en **`/data`** (archivos/imágenes).

### 6. Dominio público
1. En el servicio API → **Settings** → **Networking** → **Generate Domain**.
2. Copiar la URL, ej.: `https://algo.up.railway.app`

### 7. Probar que está vivo
Abrir en el navegador:

`https://TU-DOMINIO/api/health`

Tiene que responder algo tipo `{ "ok": true, ... }`.

---

## Conectar la app (PC o celular)

1. Abrir **ControlStock**.
2. Ir a **Configuración**.
3. Elegir modo **Nube (Railway)**.
4. Pegar la URL pública (sin barra final rara; la base alcanza).
5. **Probar** → si ok → **Guardar**.
6. Login (base nueva vacía: `admin` / `admin123` — cambiar después).

---

## Migrar datos del PC local a la nube

1. Tener la app apuntando a la nube y estar logueado como **admin**.
2. **Configuración** → **Migrar**.
3. Confirmar escribiendo `MIGRAR`.
4. Eso pasa el SQLite local → Postgres de Railway.

Hacer backup de la PC antes.

---

## Checklist rápido

- [ ] Postgres creado  
- [ ] Repo conectado  
- [ ] `DATABASE_URL` en la API  
- [ ] `JWT_SECRET` creado  
- [ ] Dominio generado  
- [ ] `/api/health` ok  
- [ ] App en modo Nube con esa URL  
- [ ] Migración (si hay datos locales)

---

## Si preguntan “¿qué lenguaje?”

TypeScript/JavaScript · API con **Node.js + Fastify** · base en nube **Postgres**.
