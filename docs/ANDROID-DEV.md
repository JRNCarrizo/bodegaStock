# Desarrollo Android (live reload) y APK

Guía práctica para ver cambios en el celular **sin regenerar la APK a cada rato**, y para armar la APK de producción sin acordarse de activar/desactivar nada a mano.

Relacionado: [APP-MOVIL.md](APP-MOVIL.md) · scripts en `package.json` · `capacitor.config.ts` · `scripts/dev-android.mjs`.

---

## Idea

| Situación | Qué pasa |
|-----------|----------|
| **Desarrollo** (`npm run dev:android`) | La app carga la UI desde Vite en tu PC. Guardás código → se refleja en el celular. |
| **APK / producción** (`npm run cap:sync`) | La web queda **embebida** en el APK. No depende de Vite ni de tu PC. |

El live reload se activa **solo** si el script de desarrollo setea `CAP_SERVER_URL`.  
`cap:sync` **no** setea esa variable → la APK sale siempre “cerrada”. **No hay que editar `capacitor.config.ts` a mano.**

Renombrar el archivo `.apk` no afecta instalación ni actualización (importan paquete, firma y `versionCode`).

---

## Requisitos

- [Android Studio](https://developer.android.com/studio) instalado (SDK + platform-tools).
- Node / npm del proyecto (`npm install` en la raíz).
- **Celular físico (recomendado):**
  - Opciones de desarrollador + **depuración USB**.
  - USB conectado a la PC (o WiFi debugging ya configurado).
  - Misma WiFi que la PC (no datos móviles).
- **Emulador (alternativa):** AVD creado en Android Studio.

Si vas a probar login / API online: ControlStock en la PC en **modo servidor**.

---

## Desarrollo — celular físico (recomendado)

### Cada sesión

1. Conectá el celular por USB (depuración USB activa).
2. Misma WiFi celular ↔ PC.
3. En la raíz del repo:

```bash
npm run dev:android
```

4. El script:
   - hace un `build:mobile` rápido,
   - levanta Vite en el puerto **5173**,
   - hace `cap sync` **con** live reload (`CAP_SERVER_URL` = `http://IP-LAN:5173`),
   - instala / abre la app en el dispositivo (`cap run android`).
5. **Dejá esa terminal abierta.**
6. Editá en Cursor → guardá → los cambios se ven en el celular (a veces hace falta un refresh suave si no recarga solo).
7. Para cortar: `Ctrl+C` en esa terminal.

> **Nota (Cursor):** el menú “Please choose a target device” a veces se congela. El script ya elige el celular solo vía `adb` (`--target`). Si igual pide elegir, cortá con Ctrl+C y volvé a correr `npm run dev:android`.
>
> El script fuerza `JAVA_HOME` al JBR de Android Studio. Si usás Java 25 del sistema, Gradle falla con `Unsupported class file major version 69`.

### Si no detecta el celular

- Abrí Android Studio → Device Manager / Logcat y confirmá que el dispositivo aparece.
- Probá `adb devices` (debe listar el teléfono como `device`).
- Aceptá el diálogo “¿Permitir depuración USB?” en el celular.

### Si no encuentra IP LAN

- Conectá WiFi/Ethernet en la PC, o usá el emulador:

```bash
npm run dev:android:emulator
```

---

## Desarrollo — emulador

```bash
npm run dev:android:emulator
```

Usa `http://10.0.2.2:5173` (en el emulador, `10.0.2.2` es el localhost de tu PC).  
Arrancá un AVD antes o dejá que `cap run` te ofrezca uno.

---

## APK de producción / para la bodega

No hace falta “sacar” el live reload a mano. Solo usá el flujo normal:

```bash
npm run cap:sync
```

Eso genera icons + `dist/` + sync **sin** `CAP_SERVER_URL` (web embebida).

Después, APK debug:

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
cd android
.\gradlew.bat assembleDebug
```

Salida típica:

`android/app/build/outputs/apk/debug/app-debug.apk`

Opcional: copiar al escritorio con otro nombre; es el mismo archivo.

Abrir Android Studio:

```bash
npm run cap:android
```

---

## Cómo funciona por dentro (resumen)

1. `capacitor.config.ts` lee `process.env.CAP_SERVER_URL`.
   - Si existe → `server.url` = live reload.
   - Si no → solo assets de `webDir` (`dist/`).
2. `scripts/dev-android.mjs` setea esa variable, levanta Vite y corre `cap sync` / `cap run`.
3. `npm run cap:sync` **nunca** setea `CAP_SERVER_URL` → APK lista para instalar en cualquier lado.

**Importante:** si usaste live reload y después querés una APK instalable offline, corré siempre `npm run cap:sync` (o el build de APK que ya lo incluye) **antes** de distribuir. Así se borra el `server.url` del config copiado a `android/`.

---

## Conexión de la APK al PC servidor (uso real)

Esto es independiente del live reload (es la IP de la **API**, puerto **3847**):

1. PC: ControlStock en **modo servidor**.
2. Configuración → ver IP / QR.
3. En el login de la APK → panel **PC servidor** → IP + puerto `3847` → Probar / Guardar (o escanear QR).
4. Misma WiFi; firewall Windows permitiendo el puerto **3847** (en PCs de empresa suele ser el problema si “tiempo agotado”).

Prueba rápida desde el navegador del celular:

`http://IP-DEL-PC:3847/api/health`

---

## Comandos rápidos

| Objetivo | Comando |
|----------|---------|
| Live reload en celular | `npm run dev:android` |
| Live reload en emulador | `npm run dev:android:emulator` |
| Sync / base para APK | `npm run cap:sync` |
| Abrir Android Studio | `npm run cap:android` |
| Solo build web móvil | `npm run build:mobile` |
