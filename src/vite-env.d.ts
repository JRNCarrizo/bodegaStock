/// <reference types="vite/client" />

export type AppInfo = {
  version: string
  name: string
  isPackaged: boolean
  platform: string
}

export type NetworkMode = 'server' | 'client'

export type NetworkConfig = {
  mode: NetworkMode
  remoteHost: string
  port: number
}

export type NetworkRuntimeInfo = {
  config: NetworkConfig
  apiUrl: string
  serverRunning: boolean
  lanAddresses: string[]
  connectionUrls: string[]
}

export type NetworkTestResult =
  | { ok: true; app?: string; version?: string }
  | { ok: false; message?: string }

export type UpdateStatusPayload =
  | { type: 'checking' }
  | { type: 'available'; version: string; releaseNotes?: string }
  | { type: 'not-available'; version: string }
  | { type: 'download-progress'; percent: number; transferred: number; total: number }
  | { type: 'downloaded'; version: string }
  | { type: 'error'; message: string }

export type UpdateCheckResult =
  | { ok: true; updateInfo?: string }
  | { ok: false; reason: 'dev' }
  | { ok: false; reason: 'error'; message?: string }

export type UpdateActionResult =
  | { ok: true }
  | { ok: false; reason?: 'dev'; message?: string }

export type MigrationExportResult =
  | {
      ok: true
      dump: {
        version: 1
        exportedAt: string
        tables: Record<string, Record<string, unknown>[]>
      }
      counts: Record<string, number>
      dbPath: string
    }
  | { ok: false; message?: string }

interface Window {
  bodegaStock?: {
    getNetworkInfo?: () => Promise<NetworkRuntimeInfo>
    testNetworkConnection?: (host: string, port: number) => Promise<NetworkTestResult>
    applyNetworkConfig?: (config: NetworkConfig) => Promise<{ ok: boolean; apiUrl?: string }>
    exportLocalDatabase?: () => Promise<MigrationExportResult>
    htmlToPdf?: (
      html: string
    ) => Promise<{ ok: true; pdfBase64: string } | { ok: false; message?: string }>
    getAppInfo?: () => Promise<AppInfo>
    resetDatabase?: (
      confirmacion: string
    ) => Promise<{ ok: true } | { ok: false; message?: string }>
    checkForUpdates?: () => Promise<UpdateCheckResult>
    downloadUpdate?: () => Promise<UpdateActionResult>
    installUpdate?: () => Promise<UpdateActionResult>
    onUpdateStatus?: (callback: (status: UpdateStatusPayload) => void) => () => void
  }
}
