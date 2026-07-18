import { app, ipcMain } from 'electron'
import {
  checkApiHealth,
  isServerRunning,
  startServer,
  stopServer
} from '../../server/index'
import {
  buildApiUrl,
  getNetworkRuntimeInfo,
  loadNetworkConfig,
  saveNetworkConfig,
  type NetworkConfig
} from '../../server/network-config'

export function setupNetworkIpc(): void {
  ipcMain.handle('network:get-info', async () => {
    return getNetworkRuntimeInfo(isServerRunning())
  })

  ipcMain.handle('network:test-connection', async (_event, payload: { host: string; port: number }) => {
    const host = String(payload.host ?? '').trim()
    const port = Number(payload.port)
    if (!host || !port) {
      return { ok: false, message: 'Ingresá IP y puerto del servidor' }
    }

    const result = await checkApiHealth(host, port)
    if (!result.ok) {
      return {
        ok: false,
        message: 'No se pudo conectar. Verificá IP, puerto, firewall y que el servidor esté encendido.'
      }
    }

    return {
      ok: true,
      app: result.app ?? 'ControlStock',
      version: result.version ?? ''
    }
  })

  ipcMain.handle('network:apply-config', async (_event, payload: NetworkConfig) => {
    const saved = saveNetworkConfig(payload)
    app.relaunch()
    app.quit()
    return { ok: true, config: saved, apiUrl: buildApiUrl(saved) }
  })
}

export async function bootstrapNetworkServer(): Promise<void> {
  const config = loadNetworkConfig()
  if (config.mode === 'client') {
    console.log('[ControlStock] Modo cliente — sin servidor local')
    return
  }

  await startServer({ host: '0.0.0.0', port: config.port })
}

export async function shutdownNetworkServer(): Promise<void> {
  const config = loadNetworkConfig()
  if (config.mode === 'client') return
  await stopServer()
}
