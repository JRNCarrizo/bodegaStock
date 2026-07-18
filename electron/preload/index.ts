import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('bodegaStock', {
  getNetworkInfo: () => ipcRenderer.invoke('network:get-info'),
  testNetworkConnection: (host: string, port: number) =>
    ipcRenderer.invoke('network:test-connection', { host, port }),
  applyNetworkConfig: (config: unknown) => ipcRenderer.invoke('network:apply-config', config),
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateStatus: (callback: (status: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: unknown) => callback(status)
    ipcRenderer.on('update-status', listener)
    return () => {
      ipcRenderer.removeListener('update-status', listener)
    }
  }
})
