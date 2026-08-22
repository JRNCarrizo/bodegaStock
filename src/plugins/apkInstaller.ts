import { registerPlugin } from '@capacitor/core'

export interface ApkInstallerPlugin {
  install(options: { path: string }): Promise<void>
  canRequestPackageInstalls(): Promise<{ value: boolean }>
  openInstallSettings(): Promise<void>
}

export const ApkInstaller = registerPlugin<ApkInstallerPlugin>('ApkInstaller')
