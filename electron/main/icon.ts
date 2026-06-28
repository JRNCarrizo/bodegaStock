import { app, nativeImage } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'

const isDev = !app.isPackaged

function iconCandidates(): string[] {
  const projectRoot = join(__dirname, '..', '..')

  if (isDev) {
    return [
      join(process.cwd(), 'build', 'icon.ico'),
      join(projectRoot, 'build', 'icon.ico'),
      join(process.cwd(), 'build', 'icon.png'),
      join(projectRoot, 'build', 'icon.png'),
      join(app.getAppPath(), 'build', 'icon.ico'),
      join(app.getAppPath(), 'build', 'icon.png')
    ]
  }

  return [
    join(process.resourcesPath, 'icons', 'icon.ico'),
    join(process.resourcesPath, 'icons', 'icon.png')
  ]
}

export function getAppIcon(): Electron.NativeImage {
  for (const path of iconCandidates()) {
    if (!existsSync(path)) continue
    const image = nativeImage.createFromPath(path)
    if (!image.isEmpty()) return image
  }

  return nativeImage.createEmpty()
}

export function setupWindowsAppIdentity(): void {
  if (process.platform !== 'win32') return
  app.setAppUserModelId('com.jrncarrizo.bodegastock')
}

setupWindowsAppIdentity()
