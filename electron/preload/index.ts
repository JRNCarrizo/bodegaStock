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
  checkForUpdates: (opts?: { force?: boolean }) => ipcRenderer.invoke('update:check', opts),
  getUpdateCooldown: (opts?: { force?: boolean }) => ipcRenderer.invoke('update:get-cooldown', opts),
  clearUpdateCooldown: () => ipcRenderer.invoke('update:clear-cooldown'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  downloadLatestApk: (opts?: { force?: boolean }) => ipcRenderer.invoke('apk:download-latest', opts),
  onUpdateStatus: (callback: (status: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: unknown) => callback(status)
    ipcRenderer.on('update-status', listener)
    return () => {
      ipcRenderer.removeListener('update-status', listener)
    }
  }
})
