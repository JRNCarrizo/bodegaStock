import { Menu, Tray, type BrowserWindow, nativeImage } from 'electron'
import { getAppIcon } from './icon'

let tray: Tray | null = null

export function destroyTray(): void {
  try {
    tray?.destroy()
  } catch {
    /* ignore */
  }
  tray = null
}

export function ensureTray(opts: {
  getWindow: () => BrowserWindow | null
  showWindow: () => void
  quitApp: () => void
}): Tray {
  if (tray && !tray.isDestroyed()) return tray

  let icon = getAppIcon()
  if (icon.isEmpty()) {
    icon = nativeImage.createEmpty()
  } else if (process.platform === 'win32') {
    // En bandeja de Windows conviene un tamaño chico.
    const sized = icon.resize({ width: 16, height: 16 })
    if (!sized.isEmpty()) icon = sized
  }

  tray = new Tray(icon)
  tray.setToolTip('ControlStock')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Abrir ControlStock',
        click: () => opts.showWindow()
      },
      { type: 'separator' },
      {
        label: 'Salir',
        click: () => opts.quitApp()
      }
    ])
  )
  tray.on('double-click', () => opts.showWindow())
  tray.on('click', () => {
    // En Windows un click suele abrir el menú; el doble click abre la ventana.
    if (process.platform !== 'win32') opts.showWindow()
  })

  return tray
}
