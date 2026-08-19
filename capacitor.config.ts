import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Live reload solo si corre `npm run dev:android` (setea CAP_SERVER_URL).
 * `npm run cap:sync` / APK: sin esa variable → web embebida, listo para instalar.
 */
const liveUrl = process.env.CAP_SERVER_URL?.trim()

const config: CapacitorConfig = {
  appId: 'com.jrncarrizo.bodegastock',
  appName: 'ControlStock',
  webDir: 'dist',
  server: {
    // LAN usa http://IP:3847 — Android bloquea cleartext si no se habilita
    androidScheme: 'https',
    cleartext: true,
    ...(liveUrl ? { url: liveUrl } : {})
  },
  android: {
    allowMixedContent: true
  },
  // No parchear window.fetch globalmente: rompe POST JSON al PC local (415).
  // Para Railway (HTTPS) usamos CapacitorHttp.request() solo en api() / appFetch().
  plugins: {
    CapacitorHttp: {
      enabled: false
    }
  }
}

export default config
