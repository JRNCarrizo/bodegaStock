/** Guías de uso por sección — lenguaje simple, para armar el manual de a poco. */

export type HelpStep = {
  title: string
  body: string
}

export type HelpTip = string

export type SectionHelpGuide = {
  id: string
  sectionTitle: string
  /** Una frase corta: para qué sirve */
  summary: string
  steps: HelpStep[]
  tips?: HelpTip[]
}

export const HELP_GUIDES: Record<string, SectionHelpGuide> = {
  ingresos: {
    id: 'ingresos',
    sectionTitle: 'Ingresos',
    summary:
      'Acá registrás la mercadería que entra a la bodega (como anotar un remito en Excel, pero en el sistema).',
    steps: [
      {
        title: 'Abrí un ingreso nuevo',
        body: 'Tocá “Nuevo ingreso” (o apretá Enter si estás en el buscador). Completá la fecha y el número de remito.'
      },
      {
        title: 'Elegí a dónde va la mercadería',
        body: 'En Destino elegí el sector. Si el sector usa ubicaciones, elegí también la ubicación. Con Enter pasás al siguiente campo.'
      },
      {
        title: 'Buscá el producto',
        body: 'Escribí el código o el nombre. Aparece una lista: con las flechas ↑↓ te movés y con Enter lo elegís. También podés escanear el código.'
      },
      {
        title: 'Cargá las cantidades',
        body: 'Indicá si es pallet, caja o suelto, y la cantidad. Tocá Agregar (o Enter) para sumar la línea a la lista de abajo.'
      },
      {
        title: 'Revisá la lista de abajo',
        body: 'Ahí ves todo lo que cargaste. Si te equivocaste, podés editar o borrar una línea: en el celular deslizala hacia un lado; en la computadora, con el mouse, hacé clic, mantené apretado y arrastrala hacia un lado. Van a aparecer las opciones.'
      },
      {
        title: 'Confirmá el ingreso',
        body: 'Cuando estén todos los productos, tocá el botón para confirmar. El stock queda cargado en el sector que elegiste.'
      }
    ],
    tips: [
      'Para corregir o borrar una línea: en el celular deslizá la línea hacia un lado. En la computadora hacé lo mismo con el mouse: hacé clic sobre la línea, mantené apretado y arrastrá hacia un lado. Ahí aparecen las opciones de editar o borrar.',
      'Podés salir y volver: el ingreso a medias se guarda como borrador.',
      'En la lista principal buscás por remito y filtrás por fecha, como en una planilla de Excel.'
    ]
  },
  planillas: {
    id: 'planillas',
    sectionTitle: 'Carga de planillas',
    summary:
      'Acá cargás lo que sale de la bodega para un camionero (la planilla de carga). El sistema descuenta el stock solo.',
    steps: [
      {
        title: 'Abrí una planilla nueva',
        body: 'Tocá “Nueva planilla” (o Enter en el buscador). Completá la fecha, el número de planilla, el camionero y, si corresponde, el vehículo.'
      },
      {
        title: 'Pasá a cargar productos',
        body: 'Cuando los datos estén listos, pasás a la página de carga de productos. Ahí vas a buscar y anotar cantidades.'
      },
      {
        title: 'Buscá el producto',
        body: 'Escribí el código o el nombre. Con las flechas ↑↓ te movés en la lista y con Enter lo elegís.'
      },
      {
        title: 'Elegí unidad y cantidad',
        body: 'Indicá si vas a cargar en cajas o en botellas (o la unidad del producto) y cuántas. Tocá Agregar (o Enter) para sumarlo a la lista de abajo.'
      },
      {
        title: 'Revisá la lista de abajo',
        body: 'Ahí ves todo lo cargado. Si te equivocaste, podés editar o borrar una línea: en el celular deslizala hacia un lado; en la computadora, con el mouse, hacé clic, mantené apretado y arrastrala hacia un lado. Van a aparecer las opciones.'
      },
      {
        title: 'Confirmá la planilla',
        body: 'Cuando esté todo, tocá confirmar. Antes vas a ver una vista previa de cómo se descuenta el stock. Si está bien, confirmá y listo.'
      }
    ],
    tips: [
      'Para corregir o borrar una línea: en el celular deslizá la línea hacia un lado. En la computadora hacé lo mismo con el mouse: hacé clic sobre la línea, mantené apretado y arrastrá hacia un lado. Ahí aparecen las opciones de editar o borrar.',
      'Podés salir y volver: la planilla a medias se guarda como borrador.',
      'En la lista principal buscás por número de planilla o camionero, y filtrás por fecha.'
    ]
  },
  retornos: {
    id: 'retornos',
    sectionTitle: 'Retornos',
    summary:
      'Acá registrás mercadería que se reincorpora al stock: puede venir de un viaje, de una devolución, o de otra situación en la que haya que sumarla de nuevo.',
    steps: [
      {
        title: 'Abrí un retorno nuevo',
        body: 'Tocá “Nuevo retorno” (o Enter en el buscador). Completá la fecha y, si corresponde, el número de planilla, el camionero y un sector por defecto. Planilla y camionero no son obligatorios: usalos solo cuando aplique.'
      },
      {
        title: 'Pasá a cargar productos',
        body: 'Cuando los datos estén listos, pasás a la página de carga de productos. Ahí vas a buscar y anotar cantidades.'
      },
      {
        title: 'Buscá el producto',
        body: 'Escribí el código o el nombre. Con las flechas ↑↓ te movés en la lista y con Enter lo elegís. También podés escanear el código.'
      },
      {
        title: 'Cantidad, estado y sector',
        body: 'Indicá la cantidad, el estado (buen estado, incompleta o mal estado) y el sector. Tocá Agregar (o Enter) para sumarlo a la lista.'
      },
      {
        title: 'Revisá la lista de abajo',
        body: 'Ahí ves todo lo cargado. Si te equivocaste, tocá el ícono de basura en esa línea para borrarla y cargala de nuevo si hace falta.'
      },
      {
        title: 'Confirmá el retorno',
        body: 'Cuando esté todo, tocá confirmar. Solo la mercadería en buen estado suma stock. En algunos casos otro usuario tiene que verificarlo después; el sistema te lo indica.'
      }
    ],
    tips: [
      'No es solo lo del camión: cualquier caso en el que haya que reincorporar mercadería al stock se carga acá.',
      'Si te equivocás en una línea, borrarla con el ícono de basura y volvé a cargarla.',
      'Podés salir y volver: el retorno a medias se guarda como borrador.',
      'En la lista principal buscás por planilla o camionero, y filtrás por fecha o por estado (pendiente / verificado).'
    ]
  },
  roturas: {
    id: 'roturas',
    sectionTitle: 'Roturas y pérdidas',
    summary:
      'Acá registrás mercadería que hay que sacar del stock porque se rompió, se perdió o ya no está disponible para usar.',
    steps: [
      {
        title: 'Abrí un registro nuevo',
        body: 'Tocá “Nuevo registro” (o Enter en el buscador). Completá la fecha y, si querés, una observación (motivo o referencia).'
      },
      {
        title: 'Pasá a cargar productos',
        body: 'Cuando los datos estén listos, pasás a la página de carga. Ahí vas a buscar los productos a descontar.'
      },
      {
        title: 'Buscá el producto',
        body: 'Escribí el código o el nombre. Con las flechas ↑↓ te movés en la lista y con Enter lo elegís. También podés escanear el código.'
      },
      {
        title: 'Sector y cantidad',
        body: 'Elegí el sector de donde se descuenta y cuántas cajas. El sistema te muestra cuánto hay disponible en ese sector. Tocá Agregar (o Enter) para sumarlo a la lista.'
      },
      {
        title: 'Revisá la lista de abajo',
        body: 'Ahí ves todo lo cargado. Si te equivocaste, tocá el ícono de basura en esa línea para borrarla.'
      },
      {
        title: 'Confirmá y descontá',
        body: 'Cuando esté todo, tocá “Confirmar y descontar”. El stock baja de inmediato en los sectores que elegiste.'
      }
    ],
    tips: [
      'Si no alcanza el stock en el sector, el sistema no te deja agregar esa cantidad.',
      'La observación ayuda después a encontrar el registro (por ejemplo, buscando en la lista).',
      'En la lista principal buscás por producto u observación, y filtrás por día.'
    ]
  },
  movimientos: {
    id: 'movimientos',
    sectionTitle: 'Movimientos internos',
    summary:
      'Acá pasás mercadería de un sector (o ubicación) a otro dentro de la bodega. El stock baja en el origen y sube en el destino.',
    steps: [
      {
        title: 'Abrí o seguí la lista',
        body: 'Tocá “Crear lista de movimientos” (o Enter en el buscador). Si ya hay una lista abierta, el botón dice “Continuar lista abierta”: varios pueden cargar en la misma lista y podés salir y volver cuando quieras.'
      },
      {
        title: 'Elegí de dónde sale y a dónde va',
        body: 'Completá el Origen (sector y, si corresponde, la ubicación) y el Destino. Con Enter vas pasando de un campo al otro hasta el buscador de productos.'
      },
      {
        title: 'Buscá el producto',
        body: 'Escribí el código o el nombre. Con las flechas ↑↓ te movés en la lista y con Enter lo elegís.'
      },
      {
        title: 'Cargá la cantidad',
        body: 'Indicá si es pallet, caja o suelto, y la cantidad. Tocá Agregar (o Enter) para sumarlo a la lista de abajo.'
      },
      {
        title: 'Revisá la lista de abajo',
        body: 'Ahí ves todo lo cargado. Si te equivocaste, podés editar o borrar una línea: en el celular deslizala hacia un lado; en la computadora, con el mouse, hacé clic, mantené apretado y arrastrala hacia un lado.'
      },
      {
        title: 'Finalizá el movimiento',
        body: 'Cuando esté todo, finalizá la lista. Ahí se mueve el stock. En algunos casos hay que tildar cada línea antes de finalizar; el sistema te lo pide si corresponde.'
      }
    ],
    tips: [
      'No hace falta terminarlo de una: la lista queda abierta hasta que la finalicen.',
      'Origen y destino no pueden ser el mismo lugar (salvo que uses ubicaciones distintas).',
      'En la lista principal buscás por sector o producto, y filtrás por fecha.'
    ]
  },
  inventario: {
    id: 'inventario',
    sectionTitle: 'Inventario',
    summary:
      'Acá se hace el conteo físico de la bodega: se cuenta lo que hay en la realidad y, al cerrar, el sistema se corrige para quedar igual a lo contado.',
    steps: [
      {
        title: '1) Crear el inventario (en la PC)',
        body: 'Tocá “Nuevo inventario”. Poné un nombre, elegí qué sectores se van a contar y, en cada uno, quién cuenta. Elegí verificación Doble (2 personas) o Simple (1 persona), y si el conteo es “Con red” u “Offline (APK)”. Lo habitual en depósito es Offline.'
      },
      {
        title: '2) Iniciar el inventario',
        body: 'Abrí la sesión y tocá “Iniciar inventario”. Desde ese momento no se pueden hacer ingresos, planillas, retornos, roturas ni movimientos hasta que se cierre. El sistema guarda una “foto” del stock para comparar después.'
      },
      {
        title: '3) Si es Offline: descargar el paquete (obligatorio)',
        body: 'Antes de contar, cada contador entra al sector en el celular (con red al PC, en la oficina o cerca del servidor) y toca “Descargar paquete”. Sin ese paquete no se puede contar sin red. Cuando ya esté descargado, recién ahí pueden ir al depósito a contar.'
      },
      {
        title: '4) Contar en el celular',
        body: 'En Inventario → “Mis sectores”, tocá el sector. Si usa ubicaciones, elegí la ubicación. Después buscá o escaneá el producto. En Offline ya no hace falta tener WiFi al PC mientras contás.'
      },
      {
        title: '5) Cargar cada pila como una línea',
        body: 'Indicá si es pallet, caja o botellas sueltas, y la cantidad. Tocá Agregar. Cada pila o montón se carga aparte (otra línea), aunque sea el mismo producto.'
      },
      {
        title: '6) Corregir si te equivocás',
        body: 'Deslizá la línea hacia un lado (en la PC: clic sostenido y arrastrá) para editar o borrar. Podés salir y volver: lo cargado queda guardado en el celular (Offline) o en el servidor (Con red).'
      },
      {
        title: '7) Finalizar el sector',
        body: 'Cuando terminaste, tocá “Finalicé este sector”. Si es Simple, el sector queda listo. Si es Doble, falta cruzar el conteo con el compañero.'
      },
      {
        title: '8) Si es Offline + Doble: conectarse entre celulares',
        body: 'Para comparar, los dos contadores tienen que vincularse entre sí (sin el PC): uno toca “Crear conexión” y el otro “Unirme a la conexión” (hotspot / QR / IP, como indique la pantalla). Después sincronizan. Recién ahí se ven las diferencias y, si hace falta, el reconteo. Sin ese paso no se puede cerrar la comparación en Offline.'
      },
      {
        title: '9) Si es Offline: importar al PC',
        body: 'Cuando el sector esté OK entre contadores (o Simple finalizado), hay que “Importar al PC” (con red al servidor) o usar “Guardar archivo para PC” / “Importar archivo” si no hay red directa. Hasta importar, el PC no tiene ese conteo.'
      },
      {
        title: '10) Cerrar y aplicar el stock (en la PC)',
        body: 'Cuando todos los sectores estén OK, el supervisor revisa lo contado contra el sistema. Por cada diferencia: “Aplicar contado”, “Mantener sistema” o “Corregir manualmente”. Después confirma y cierra.'
      }
    ],
    tips: [
      'Offline: primero descargar paquete (con red), después contar, después conectar celulares si es Doble, y al final importar al PC.',
      'En Doble Offline, la comparación no es automática: un celular crea la conexión y el otro se une; sin eso no se cruzan los conteos.',
      'Mientras el inventario está en curso, los otros movimientos de stock quedan suspendidos.',
      'Al aplicar lo contado, el stock de ese producto/sector queda igual a lo contado (no se “suma” un ajuste a lo anterior).',
      'Si un producto no se contó y elegís “Aplicar contado”, puede quedar en cero. Si no lo contaste a propósito, usá “Mantener sistema”.',
      'En “Con red”, la comparación Doble se hace por el servidor (no hace falta conectar un celu con el otro).'
    ]
  }
}

export function getHelpGuide(id: string): SectionHelpGuide | undefined {
  return HELP_GUIDES[id]
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** HTML tipográfico para PDF / impresión. */
export function helpGuideToHtml(guide: SectionHelpGuide): string {
  const steps = guide.steps
    .map(
      (s, i) =>
        `<li style="margin-bottom:14px"><strong>${i + 1}. ${escapeHtml(s.title)}</strong><br/><span style="color:#334155">${escapeHtml(s.body)}</span></li>`
    )
    .join('\n')
  const tips =
    guide.tips && guide.tips.length > 0
      ? `<h2 style="font-size:16px;margin-top:28px">Consejos</h2><ul>${guide.tips
          .map((t) => `<li style="margin-bottom:8px;color:#334155">${escapeHtml(t)}</li>`)
          .join('')}</ul>`
      : ''

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <title>Guía — ${escapeHtml(guide.sectionTitle)} · ControlStock</title>
  <style>
    @page { margin: 16mm; }
    body { font-family: Segoe UI, system-ui, sans-serif; max-width: 640px; margin: 24px auto; padding: 0 16px; color: #0f172a; line-height: 1.5; }
    h1 { font-size: 22px; margin-bottom: 8px; }
    .summary { color: #475569; margin-bottom: 24px; }
    ol { padding-left: 22px; }
    footer { margin-top: 36px; font-size: 12px; color: #94a3b8; }
  </style>
</head>
<body>
  <h1>Guía de uso: ${escapeHtml(guide.sectionTitle)}</h1>
  <p class="summary">${escapeHtml(guide.summary)}</p>
  <h2 style="font-size:16px">Pasos</h2>
  <ol>${steps}</ol>
  ${tips}
  <footer>ControlStock — Guía de ${escapeHtml(guide.sectionTitle)}</footer>
</body>
</html>`
}

function triggerPdfDownload(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function base64ToUint8Array(base64: string): Uint8Array {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/** Fallback: diálogo de impresión → “Guardar como PDF”. */
function printHelpAsPdf(html: string): void {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0'
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument
  const win = iframe.contentWindow
  if (!doc || !win) {
    iframe.remove()
    return
  }
  doc.open()
  doc.write(html)
  doc.close()
  const cleanup = () => {
    setTimeout(() => iframe.remove(), 500)
  }
  win.onafterprint = cleanup
  setTimeout(() => {
    win.focus()
    win.print()
  }, 50)
}

/** Descarga la guía como PDF. */
export async function downloadHelpGuide(guide: SectionHelpGuide): Promise<void> {
  const html = helpGuideToHtml(guide)
  const filename = `ControlStock-Guia-${guide.id}.pdf`
  const api = window.bodegaStock

  if (api?.htmlToPdf) {
    const result = await api.htmlToPdf(html)
    if (result.ok) {
      triggerPdfDownload(base64ToUint8Array(result.pdfBase64), filename)
      return
    }
  }

  printHelpAsPdf(html)
}
