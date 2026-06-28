import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('bodegaStock', {
  apiUrl: 'http://127.0.0.1:3847'
})
