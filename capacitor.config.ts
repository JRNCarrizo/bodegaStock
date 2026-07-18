import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.jrncarrizo.bodegastock',
  appName: 'ControlStock',
  webDir: 'dist',
  server: {
    // LAN usa http://IP:3847 — Android bloquea cleartext si no se habilita
    androidScheme: 'https',
    cleartext: true
  },
  android: {
    allowMixedContent: true
  }
}

export default config
