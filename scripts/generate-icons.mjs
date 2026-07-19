import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pngToIco from 'png-to-ico'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svgPath = join(root, 'build', 'icon.svg')
const svg = readFileSync(svgPath)

const png512 = await sharp(svg).resize(512, 512).png().toBuffer()
writeFileSync(join(root, 'build', 'icon.png'), png512)
mkdirSync(join(root, 'public'), { recursive: true })
copyFileSync(join(root, 'build', 'icon.png'), join(root, 'public', 'icon.png'))

const sizes = [256, 128, 64, 48, 32, 16]
const pngs = await Promise.all(
  sizes.map((size) => sharp(svg).resize(size, size).png().toBuffer())
)
const ico = await pngToIco(pngs)
writeFileSync(join(root, 'build', 'icon.ico'), ico)

/** Solo el símbolo blanco (sin fondo azul) para adaptive icon Android. */
const foregroundSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" fill="none">
  <g
    transform="translate(256 256) scale(12) translate(-12 -12)"
    fill="none"
    stroke="#ffffff"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z"/>
    <path d="m7 16.5-4.74-2.85"/>
    <path d="m7 16.5 5-3"/>
    <path d="M7 16.5v5.17"/>
    <path d="M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z"/>
    <path d="m17 16.5-5-3"/>
    <path d="m17 16.5 4.74-2.85"/>
    <path d="M17 16.5v5.17"/>
    <path d="M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z"/>
    <path d="M12 8 7.26 5.15"/>
    <path d="m12 8 4.74-2.85"/>
    <path d="M12 13.5V8"/>
  </g>
</svg>`)

const androidDensities = [
  { folder: 'mipmap-mdpi', launcher: 48, foreground: 108 },
  { folder: 'mipmap-hdpi', launcher: 72, foreground: 162 },
  { folder: 'mipmap-xhdpi', launcher: 96, foreground: 216 },
  { folder: 'mipmap-xxhdpi', launcher: 144, foreground: 324 },
  { folder: 'mipmap-xxxhdpi', launcher: 192, foreground: 432 }
]

const androidRes = join(root, 'android', 'app', 'src', 'main', 'res')
for (const { folder, launcher, foreground } of androidDensities) {
  const dir = join(androidRes, folder)
  mkdirSync(dir, { recursive: true })

  const launcherPng = await sharp(svg).resize(launcher, launcher).png().toBuffer()
  writeFileSync(join(dir, 'ic_launcher.png'), launcherPng)
  writeFileSync(join(dir, 'ic_launcher_round.png'), launcherPng)

  const foregroundPng = await sharp(foregroundSvg)
    .resize(foreground, foreground)
    .png()
    .toBuffer()
  writeFileSync(join(dir, 'ic_launcher_foreground.png'), foregroundPng)
}

const bgColorPath = join(androidRes, 'values', 'ic_launcher_background.xml')
writeFileSync(
  bgColorPath,
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#2563EB</color>
</resources>
`
)

console.log(
  'Iconos generados: build/icon.png, build/icon.ico, public/icon.png, android mipmaps'
)
