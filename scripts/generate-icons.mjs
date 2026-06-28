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

console.log('Iconos generados: build/icon.png, build/icon.ico, public/icon.png')
