import { join } from 'node:path'
import rcedit from 'rcedit'

/** @param {import('app-builder-lib').AfterPackContext} context */
export default async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return

  const exe = join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`)
  const icon = join(context.packager.projectDir, 'build', 'icon.ico')

  await rcedit(exe, { icon })
  console.log(`[ControlStock] Icono embebido: ${exe}`)
}
