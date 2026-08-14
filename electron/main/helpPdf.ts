import { BrowserWindow, ipcMain } from 'electron'

/** Genera un PDF a partir de HTML (guías de ayuda). */
export function setupHelpPdfIpc(): void {
  ipcMain.handle('help:html-to-pdf', async (_event, html: string) => {
    if (typeof html !== 'string' || html.length === 0) {
      return { ok: false as const, message: 'Contenido vacío' }
    }
    if (html.length > 500_000) {
      return { ok: false as const, message: 'Contenido demasiado grande' }
    }

    const win = new BrowserWindow({
      show: false,
      width: 820,
      height: 1100,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    try {
      const dataUrl = `data:text/html;charset=utf-8;base64,${Buffer.from(html, 'utf8').toString('base64')}`
      await win.loadURL(dataUrl)
      await new Promise((resolve) => setTimeout(resolve, 150))
      const pdf = await win.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        margins: { marginType: 'default' }
      })
      return { ok: true as const, pdfBase64: pdf.toString('base64') }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo generar el PDF'
      return { ok: false as const, message }
    } finally {
      win.destroy()
    }
  })
}
