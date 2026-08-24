import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import rcedit from 'rcedit'

const GITHUB_OWNER = 'JRNCarrizo'
const GITHUB_REPO = 'bodegaStock'

/** @param {import('app-builder-lib').AfterPackContext} context */
export default async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return

  const exe = join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`)
  const icon = join(context.packager.projectDir, 'build', 'icon.ico')

  await rcedit(exe, { icon })
  console.log(`[ControlStock] Icono embebido: ${exe}`)

  const updateYml = join(context.appOutDir, 'resources', 'app-update.yml')
    writeFileSync(
    updateYml,
    `provider: generic
url: https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest/download
updaterCacheDirName: controlstock-updater
`,
    'utf-8'
  )
  console.log(`[ControlStock] app-update.yml generado: ${updateYml}`)
}
