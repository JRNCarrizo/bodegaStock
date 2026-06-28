import JsBarcode from 'jsbarcode'

export interface BarcodeLabelOptions {
  codigoBarras: string
  nombre?: string
  codigoInterno?: string
}

function detectFormat(code: string): string {
  if (/^\d{13}$/.test(code)) return 'EAN13'
  if (/^\d{8}$/.test(code)) return 'EAN8'
  return 'CODE128'
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function generateBarcodeDataUrl(
  code: string,
  options?: { width?: number; height?: number; displayValue?: boolean }
): string {
  const canvas = document.createElement('canvas')
  JsBarcode(canvas, code, {
    format: detectFormat(code),
    width: options?.width ?? 2,
    height: options?.height ?? 80,
    displayValue: options?.displayValue ?? true,
    margin: 10,
    fontSize: 14,
    background: '#ffffff',
    lineColor: '#000000'
  })
  return canvas.toDataURL('image/png')
}

async function buildLabelDataUrl(label: BarcodeLabelOptions): Promise<string> {
  const barcodeUrl = generateBarcodeDataUrl(label.codigoBarras)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return barcodeUrl

  const barcodeImg = new Image()
  barcodeImg.src = barcodeUrl

  await new Promise<void>((resolve, reject) => {
    barcodeImg.onload = () => resolve()
    barcodeImg.onerror = () => reject(new Error('No se pudo generar la imagen'))
  })

  const padding = 16
  const nameHeight = label.nombre ? 22 : 0
  const internoHeight = label.codigoInterno ? 18 : 0
  const gap = 8

  canvas.width = Math.max(barcodeImg.width, 280)
  canvas.height = padding + nameHeight + gap + barcodeImg.height + gap + internoHeight + padding

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  let y = padding

  if (label.nombre) {
    ctx.fillStyle = '#0f172a'
    ctx.font = '600 14px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(label.nombre, canvas.width / 2, y + 14, canvas.width - padding * 2)
    y += nameHeight + gap
  }

  const barcodeX = (canvas.width - barcodeImg.width) / 2
  ctx.drawImage(barcodeImg, barcodeX, y)
  y += barcodeImg.height + gap

  if (label.codigoInterno) {
    ctx.fillStyle = '#64748b'
    ctx.font = '12px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.fillText(label.codigoInterno, canvas.width / 2, y + 12)
  }

  return canvas.toDataURL('image/png')
}

export async function downloadBarcodeLabel(label: BarcodeLabelOptions): Promise<void> {
  const dataUrl = await buildLabelDataUrl(label)
  const slug = (label.codigoInterno || label.codigoBarras).replace(/[^\w-]+/g, '_')
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = `etiqueta-${slug}.png`
  link.click()
}

export async function printBarcodeLabel(label: BarcodeLabelOptions): Promise<boolean> {
  const dataUrl = await buildLabelDataUrl(label)
  const win = window.open('', '_blank', 'width=420,height=320')
  if (!win) return false

  const title = label.nombre ?? label.codigoInterno ?? label.codigoBarras

  win.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Etiqueta ${escapeHtml(title)}</title>
  <style>
    @page { margin: 8mm; size: auto; }
    body { margin: 0; font-family: system-ui, sans-serif; text-align: center; }
    .label { display: inline-block; padding: 8px; }
    img { max-width: 100%; height: auto; }
  </style>
</head>
<body>
  <div class="label">
    <img src="${dataUrl}" alt="${escapeHtml(label.codigoBarras)}" />
  </div>
  <script>
    window.onload = function () {
      window.print();
      window.onafterprint = function () { window.close(); };
    };
  <\/script>
</body>
</html>`)
  win.document.close()
  return true
}
