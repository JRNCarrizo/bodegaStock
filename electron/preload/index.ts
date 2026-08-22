import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('bodegaStock', {
  getNetworkInfo: () => ipcRenderer.invoke('network:get-info'),
  testNetworkConnection: (host: string, port: number) =>
    ipcRenderer.invoke('network:test-connection', { host, port }),
  applyNetworkConfig: (config: unknown) => ipcRenderer.invoke('network:apply-config', config),
  exportLocalDatabase: () => ipcRenderer.invoke('migracion:export-local'),
  htmlToPdf: (html: string) => ipcRenderer.invoke('help:html-to-pdf', html),
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  resetDatabase: (confirmacion: string) =>
    ipcRenderer.invoke('app:reset-database', { confirmacion }),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  getUpdateCooldown: () => ipcRenderer.invoke('update:get-cooldown'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  downloadLatestApk: () => ipcRenderer.invoke('apk:download-latest'),
  onUpdateStatus: (callback: (status: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: unknown) => callback(status)
    ipcRenderer.on('update-status', listener)
    return () => {
      ipcRenderer.removeListener('update-status', listener)
    }
  }
})
