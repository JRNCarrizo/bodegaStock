import { app } from 'electron'
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs'
import { join, extname } from 'path'

export function getProductImagesDir(): string {
  const dir = join(app.getPath('userData'), 'images', 'productos')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function saveProductImage(productoId: number, base64: string, mimeType?: string): string {
  const ext = mimeType?.includes('png') ? '.png' : mimeType?.includes('webp') ? '.webp' : '.jpg'
  const filename = `producto-${productoId}${ext}`
  const filepath = join(getProductImagesDir(), filename)
  const data = base64.replace(/^data:image\/\w+;base64,/, '')
  writeFileSync(filepath, Buffer.from(data, 'base64'))
  return filename
}

export function deleteProductImage(filename: string | null | undefined): void {
  if (!filename) return
  const filepath = join(getProductImagesDir(), filename)
  if (existsSync(filepath)) unlinkSync(filepath)
}

export function getProductImagePath(filename: string): string | null {
  const filepath = join(getProductImagesDir(), filename)
  return existsSync(filepath) ? filepath : null
}

export function extFromFilename(filename: string): string {
  return extname(filename).toLowerCase() || '.jpg'
}
