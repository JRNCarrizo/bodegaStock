import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { networkInterfaces } from 'os'
import { join } from 'path'

export type NetworkMode = 'server' | 'client'

export interface NetworkConfig {
  mode: NetworkMode
  /** IP o hostname del servidor remoto (modo cliente) */
  remoteHost: string
  port: number
}

export interface NetworkRuntimeInfo {
  config: NetworkConfig
  apiUrl: string
  serverRunning: boolean
  lanAddresses: string[]
  connectionUrls: string[]
}

export const DEFAULT_NETWORK_CONFIG: NetworkConfig = {
  mode: 'server',
  remoteHost: '127.0.0.1',
  port: 3847
}

function getConfigPath(): string {
  const dir = join(app.getPath('userData'), 'data')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'network-config.json')
}

export function getLanAddresses(): string[] {
  const nets = networkInterfaces()
  const addresses: string[] = []

  for (const entries of Object.values(nets)) {
    for (const net of entries ?? []) {
      const family = net.family as string | number
      const isIpv4 = family === 'IPv4' || family === 4
      if (isIpv4 && !net.internal) {
        addresses.push(net.address)
      }
    }
  }

  return [...new Set(addresses)]
}

export function buildApiUrl(config: NetworkConfig): string {
  const host = (config.mode === 'server' ? '127.0.0.1' : config.remoteHost).trim()
  const port = config.port || DEFAULT_NETWORK_CONFIG.port
  return `http://${host}:${port}`
}

export function buildConnectionUrls(port: number, addresses = getLanAddresses()): string[] {
  return addresses.map((address) => `http://${address}:${port}`)
}

export function loadNetworkConfig(): NetworkConfig {
  const path = getConfigPath()
  if (!existsSync(path)) return { ...DEFAULT_NETWORK_CONFIG }

  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as Partial<NetworkConfig>
    return {
      mode: raw.mode === 'client' ? 'client' : 'server',
      remoteHost: String(raw.remoteHost ?? DEFAULT_NETWORK_CONFIG.remoteHost).trim() || '127.0.0.1',
      port: Number(raw.port) || DEFAULT_NETWORK_CONFIG.port
    }
  } catch {
    return { ...DEFAULT_NETWORK_CONFIG }
  }
}

export function saveNetworkConfig(config: NetworkConfig): NetworkConfig {
  const normalized: NetworkConfig = {
    mode: config.mode === 'client' ? 'client' : 'server',
    remoteHost: config.remoteHost.trim() || DEFAULT_NETWORK_CONFIG.remoteHost,
    port: Number(config.port) || DEFAULT_NETWORK_CONFIG.port
  }
  writeFileSync(getConfigPath(), JSON.stringify(normalized, null, 2), 'utf-8')
  return normalized
}

export function getNetworkRuntimeInfo(serverRunning: boolean): NetworkRuntimeInfo {
  const config = loadNetworkConfig()
  const lanAddresses = getLanAddresses()
  return {
    config,
    apiUrl: buildApiUrl(config),
    serverRunning,
    lanAddresses,
    connectionUrls: buildConnectionUrls(config.port, lanAddresses)
  }
}
