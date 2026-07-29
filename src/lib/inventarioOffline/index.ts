import { api } from '@/lib/utils'
import { compararContadoresLocal } from './compare'
import {
  clearOfflineSectorLocal,
  emptyEstado,
  ensureEstado,
  listLocalOfflineSectorIds,
  loadEstado,
  loadPaquete,
  purgeOfflineExceptSesion,
  purgeOfflineNotInServerSectores,
  saveEstado,
  saveImportBackup,
  savePaquete,
  saveSyncInbox
} from './storage'
import type {
  OfflineEstadoLocal,
  OfflineLinea,
  OfflinePcImportPackage,
  OfflinePaquete,
  OfflineSyncPayload
} from './types'
import { buildOfflineLinea } from './compare'
import type { TipoBultoOffline } from './types'

export async function descargarPaqueteOffline(sectorInvId: number): Promise<OfflinePaquete> {
  const paquete = await api<OfflinePaquete>(
    `/api/inventario/sectores/${sectorInvId}/paquete-offline`
  )
  await savePaquete(paquete)
  // Sesión nueva (ej. mes siguiente): limpia paquetes viejos de otras sesiones.
  await purgeOfflineExceptSesion(paquete.sesion.id)
  const estado = await ensureEstado(sectorInvId, paquete.inventario_sector.ronda_actual)
  if (estado.ronda_actual !== paquete.inventario_sector.ronda_actual && estado.mis_lineas.length === 0) {
    estado.ronda_actual = paquete.inventario_sector.ronda_actual
    await saveEstado(estado)
  }
  return paquete
}

export async function getOfflineSession(sectorInvId: number): Promise<{
  paquete: OfflinePaquete | null
  estado: OfflineEstadoLocal | null
}> {
  const paquete = await loadPaquete(sectorInvId)
  let estado = await loadEstado(sectorInvId)
  if (estado && repararEstadoCompaneroSiCorresponde(estado)) {
    await saveEstado(estado)
  }
  return { paquete, estado }
}

/**
 * Si ya teníamos líneas del compañero de esta ronda pero el flag quedó en false
 * (p.ej. un sync tardío cuando el otro ya entró a reconteo), restaurar comparación.
 */
export function repararEstadoCompaneroSiCorresponde(estado: OfflineEstadoLocal): boolean {
  if (!estado.mi_finalizo || estado.companero_finalizo) return false
  const compRonda = estado.lineas_companero.some((l) => l.ronda === estado.ronda_actual)
  if (!compRonda) return false
  estado.companero_finalizo = true
  return true
}

/** Hay datos locales del compañero para esta ronda aunque el flag diga que falta sync. */
export function puedeRecuperarComparacionLocal(estado: OfflineEstadoLocal): boolean {
  return (
    estado.mi_finalizo &&
    !estado.companero_finalizo &&
    estado.lineas_companero.some((l) => l.ronda === estado.ronda_actual)
  )
}

/** Restaura la comparación sin volver a sincronizar (el otro puede estar ya en reconteo). */
export async function recuperarComparacionLocal(sectorInvId: number): Promise<OfflineEstadoLocal> {
  const estado = await ensureEstado(sectorInvId)
  if (!puedeRecuperarComparacionLocal(estado)) {
    throw new Error('No hay datos locales del compañero para recuperar la comparación')
  }
  estado.companero_finalizo = true
  await saveEstado(estado)
  return estado
}

export async function addLineaOffline(
  sectorInvId: number,
  input: {
    producto_id: number
    tipo_bulto: TipoBultoOffline
    cantidad_bultos?: number | null
    unidades_por_bulto?: number | null
    cantidad_suelta?: number | null
    ubicacion?: string | null
    ubicacion_id?: number | null
  }
): Promise<OfflineLinea> {
  const paquete = await loadPaquete(sectorInvId)
  if (!paquete) throw new Error('No hay paquete offline. Descargalo con red al PC.')
  const estado = await ensureEstado(sectorInvId, paquete.inventario_sector.ronda_actual)
  if (estado.mi_finalizo) throw new Error('Ya finalizaste esta ronda')

  const producto = paquete.productos.find((p) => p.id === input.producto_id)
  if (!producto) throw new Error('Producto no está en el catálogo del paquete')

  const contadorId =
    paquete.inventario_sector.mi_rol === 1
      ? paquete.inventario_sector.contador_1_id
      : paquete.inventario_sector.contador_2_id

  const orden =
    estado.mis_lineas.filter(
      (l) => l.ronda === estado.ronda_actual && l.producto_id === input.producto_id
    ).length + 1

  const linea = buildOfflineLinea(
    {
      ...input,
      contador_id: contadorId,
      ronda: estado.ronda_actual,
      orden
    },
    producto
  )
  estado.mis_lineas.push(linea)
  await saveEstado(estado)
  return linea
}

export async function updateLineaOffline(
  sectorInvId: number,
  localId: string,
  input: {
    producto_id: number
    tipo_bulto: TipoBultoOffline
    cantidad_bultos?: number | null
    unidades_por_bulto?: number | null
    cantidad_suelta?: number | null
    ubicacion?: string | null
    ubicacion_id?: number | null
  }
): Promise<OfflineLinea> {
  const paquete = await loadPaquete(sectorInvId)
  if (!paquete) throw new Error('No hay paquete offline. Descargalo con red al PC.')
  const estado = await loadEstado(sectorInvId)
  if (!estado) throw new Error('No hay datos locales')
  if (estado.mi_finalizo) throw new Error('Ya finalizaste esta ronda')

  const idx = estado.mis_lineas.findIndex((l) => l.local_id === localId)
  if (idx < 0) throw new Error('Línea no encontrada')

  const existente = estado.mis_lineas[idx]
  const producto = paquete.productos.find((p) => p.id === input.producto_id)
  if (!producto) throw new Error('Producto no está en el catálogo del paquete')

  const contadorId =
    paquete.inventario_sector.mi_rol === 1
      ? paquete.inventario_sector.contador_1_id
      : paquete.inventario_sector.contador_2_id

  const linea = buildOfflineLinea(
    {
      ...input,
      contador_id: contadorId,
      ronda: existente.ronda,
      orden: existente.orden
    },
    producto
  )
  linea.local_id = localId
  estado.mis_lineas[idx] = linea
  await saveEstado(estado)
  return linea
}

export async function deleteLineaOffline(sectorInvId: number, localId: string): Promise<void> {
  const estado = await loadEstado(sectorInvId)
  if (!estado) return
  if (estado.mi_finalizo) throw new Error('Ya finalizaste esta ronda')
  estado.mis_lineas = estado.mis_lineas.filter((l) => l.local_id !== localId)
  await saveEstado(estado)
}

export async function finalizarMiRonda(sectorInvId: number): Promise<OfflineEstadoLocal> {
  const estado = await ensureEstado(sectorInvId)
  estado.mi_finalizo = true
  await saveEstado(estado)
  return estado
}

/**
 * Antes de sincronizar con el compañero: desmarcar mi finalización y volver a editar.
 * No aplica si el compañero ya entregó su conteo.
 */
export async function reabrirMiConteoAntesDeSync(
  sectorInvId: number
): Promise<OfflineEstadoLocal> {
  const estado = await ensureEstado(sectorInvId)
  if (!estado.mi_finalizo) return estado
  if (estado.companero_finalizo) {
    throw new Error(
      'El compañero ya sincronizó su conteo. No se puede reabrir; usá reconteo si hay diferencias.'
    )
  }
  estado.mi_finalizo = false
  await saveEstado(estado)
  return estado
}

export async function buildMiSyncPayload(sectorInvId: number): Promise<OfflineSyncPayload> {
  const paquete = await loadPaquete(sectorInvId)
  const estado = await loadEstado(sectorInvId)
  if (!paquete || !estado) throw new Error('No hay datos offline locales')

  const contadorId =
    paquete.inventario_sector.mi_rol === 1
      ? paquete.inventario_sector.contador_1_id
      : paquete.inventario_sector.contador_2_id

  return {
    version: 1,
    inventario_sector_id: sectorInvId,
    sesion_id: paquete.sesion.id,
    contador_id: contadorId,
    rol: paquete.inventario_sector.mi_rol,
    ronda_actual: estado.ronda_actual,
    finalizo: estado.mi_finalizo,
    lineas: estado.mis_lineas,
    enviado_at: new Date().toISOString()
  }
}

export async function recibirSyncCompanero(
  sectorInvId: number,
  payload: OfflineSyncPayload
): Promise<OfflineEstadoLocal> {
  const paquete = await loadPaquete(sectorInvId)
  if (!paquete) throw new Error('No hay paquete offline')
  if (payload.inventario_sector_id !== sectorInvId) {
    throw new Error('El archivo no corresponde a este sector')
  }

  const miId =
    paquete.inventario_sector.mi_rol === 1
      ? paquete.inventario_sector.contador_1_id
      : paquete.inventario_sector.contador_2_id
  const companeroId =
    paquete.inventario_sector.mi_rol === 1
      ? paquete.inventario_sector.contador_2_id
      : paquete.inventario_sector.contador_1_id

  if (payload.contador_id === miId) {
    throw new Error('Ese archivo es tuyo; necesitás el del compañero')
  }
  if (payload.contador_id !== companeroId) {
    throw new Error('El contador del archivo no coincide con el compañero asignado')
  }

  await saveSyncInbox(sectorInvId, payload)
  const estado = await ensureEstado(sectorInvId)

  const teniaCompaneroFinalizado = estado.companero_finalizo
  const teniaLineasEstaRonda = estado.lineas_companero.some(
    (l) => l.ronda === estado.ronda_actual
  )
  const companeroAvanzoDeRonda = payload.ronda_actual > estado.ronda_actual

  estado.lineas_companero = payload.lineas
  estado.companero_ronda_actual = payload.ronda_actual

  if (payload.finalizo) {
    estado.companero_finalizo = true
  } else if (companeroAvanzoDeRonda && teniaCompaneroFinalizado && teniaLineasEstaRonda) {
    // El compañero ya inició reconteo (ronda nueva, aún contando).
    // No tumbar nuestra comparación de la ronda actual: necesitamos
    // "Iniciar reconteo" también, no volver a la pantalla de hotspot.
    estado.companero_finalizo = true
  } else {
    estado.companero_finalizo = false
  }

  repararEstadoCompaneroSiCorresponde(estado)
  await saveEstado(estado)
  return estado
}

export function getComparacionActual(
  paquete: OfflinePaquete,
  estado: OfflineEstadoLocal
) {
  if (!estado.mi_finalizo || !estado.companero_finalizo) return null
  if (isSyncCompaneroIncompleto(estado)) return null

  const misSonC1 = paquete.inventario_sector.mi_rol === 1
  const lineas1 = misSonC1 ? estado.mis_lineas : estado.lineas_companero
  const lineas2 = misSonC1 ? estado.lineas_companero : estado.mis_lineas

  return compararContadoresLocal(
    lineas1,
    lineas2,
    estado.ronda_actual,
    paquete.productos
  )
}

/** Resumen de líneas de la ronda actual (vos vs compañero). */
export function getResumenSyncRonda(estado: OfflineEstadoLocal) {
  const ronda = estado.ronda_actual
  const mis = estado.mis_lineas.filter((l) => l.ronda === ronda)
  const comp = estado.lineas_companero.filter((l) => l.ronda === ronda)
  const misProductos = new Set(mis.map((l) => l.producto_id)).size
  const compProductos = new Set(comp.map((l) => l.producto_id)).size
  return {
    ronda,
    mis_lineas: mis.length,
    mis_productos: misProductos,
    companero_lineas: comp.length,
    companero_productos: compProductos
  }
}

/**
 * Sync incompleto: el compañero figura como finalizado pero no hay líneas
 * suyas en esta ronda (mientras vos sí contaste). Típico de respuesta HTTP cortada.
 */
export function isSyncCompaneroIncompleto(estado: OfflineEstadoLocal): boolean {
  if (!estado.mi_finalizo || !estado.companero_finalizo) return false
  const resumen = getResumenSyncRonda(estado)
  return resumen.mis_lineas > 0 && resumen.companero_lineas === 0
}

export function getReferenciaReconteo(
  paquete: OfflinePaquete,
  estado: OfflineEstadoLocal
) {
  if (estado.ronda_actual <= 1) return null
  const misSonC1 = paquete.inventario_sector.mi_rol === 1
  const lineas1 = misSonC1 ? estado.mis_lineas : estado.lineas_companero
  const lineas2 = misSonC1 ? estado.lineas_companero : estado.mis_lineas
  return compararContadoresLocal(
    lineas1,
    lineas2,
    estado.ronda_actual - 1,
    paquete.productos
  )
}

export async function iniciarReconteoLocal(sectorInvId: number): Promise<OfflineEstadoLocal> {
  const paquete = await loadPaquete(sectorInvId)
  const estado = await loadEstado(sectorInvId)
  if (!paquete || !estado) throw new Error('No hay datos offline')

  if (isSyncCompaneroIncompleto(estado)) {
    throw new Error('Sync incompleto con el compañero. Sincronizá de nuevo antes del reconteo.')
  }

  const comp = getComparacionActual(paquete, estado)
  if (!comp || comp.coincide) throw new Error('No hay diferencias para reconteo')

  const nuevaRonda = estado.ronda_actual + 1
  const productoIds = new Set(comp.diferencias.map((d) => d.producto_id))

  // Precargar mis líneas de la ronda anterior solo para productos con diferencia
  const prev = estado.mis_lineas.filter(
    (l) => l.ronda === estado.ronda_actual && productoIds.has(l.producto_id)
  )
  for (const l of prev) {
    const producto = paquete.productos.find((p) => p.id === l.producto_id)
    if (!producto) continue
    const ya = estado.mis_lineas.some(
      (x) => x.ronda === nuevaRonda && x.producto_id === l.producto_id && x.orden === l.orden
    )
    if (ya) continue
    estado.mis_lineas.push({
      ...l,
      local_id: `L-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ronda: nuevaRonda
    })
  }

  // Limpiar líneas compañero de la nueva ronda (se re-sincronizan)
  estado.lineas_companero = estado.lineas_companero.filter((l) => l.ronda < nuevaRonda)
  estado.ronda_actual = nuevaRonda
  estado.mi_finalizo = false
  estado.companero_finalizo = false
  await saveEstado(estado)
  return estado
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/** Paquete final de contingencia para llevar manualmente a la PC. */
export async function crearPaqueteImportacionPc(
  sectorInvId: number
): Promise<OfflinePcImportPackage> {
  const paquete = await loadPaquete(sectorInvId)
  const estado = await loadEstado(sectorInvId)
  if (!paquete || !estado) throw new Error('No hay datos offline')
  if (!estado.mi_finalizo || !estado.companero_finalizo) {
    throw new Error('Ambos deben finalizar y sincronizar antes de generar el archivo para la PC')
  }
  if (isSyncCompaneroIncompleto(estado)) {
    throw new Error('La sincronización con el compañero está incompleta')
  }
  const comparacion = getComparacionActual(paquete, estado)
  if (!comparacion?.coincide) {
    throw new Error('Todavía hay diferencias; completen el reconteo antes de generar el archivo')
  }

  const misSonC1 = paquete.inventario_sector.mi_rol === 1
  const lineas1 = misSonC1 ? estado.mis_lineas : estado.lineas_companero
  const lineas2 = misSonC1 ? estado.lineas_companero : estado.mis_lineas
  const contenido = {
    sesion_id: paquete.sesion.id,
    inventario_sector_id: sectorInvId,
    sector_id: paquete.inventario_sector.sector_id,
    ronda_actual: estado.ronda_actual,
    contador_1_id: paquete.inventario_sector.contador_1_id,
    contador_2_id: paquete.inventario_sector.contador_2_id,
    generado_at: new Date().toISOString(),
    lineas: [...lineas1, ...lineas2].map((linea) => ({
      producto_id: linea.producto_id,
      contador_id: linea.contador_id,
      ronda: linea.ronda,
      tipo_bulto: linea.tipo_bulto,
      cantidad_bultos: linea.cantidad_bultos,
      unidades_por_bulto: linea.unidades_por_bulto,
      cantidad_suelta: linea.cantidad_suelta,
      ubicacion: linea.ubicacion,
      ubicacion_id: linea.ubicacion_id,
      orden: linea.orden
    }))
  }

  return {
    formato: 'controlstock-inventario-offline-pc',
    version: 1,
    contenido,
    checksum_sha256: await sha256Hex(JSON.stringify(contenido))
  }
}

export async function importarAlPc(sectorInvId: number) {
  const paquete = await loadPaquete(sectorInvId)
  const estado = await loadEstado(sectorInvId)
  if (!paquete || !estado) throw new Error('No hay datos offline')
  if (!estado.mi_finalizo || !estado.companero_finalizo) {
    throw new Error('Ambos deben haber finalizado y sincronizado antes de importar')
  }
  if (isSyncCompaneroIncompleto(estado)) {
    throw new Error('Sync incompleto con el compañero. Sincronizá de nuevo antes de importar')
  }
  const comp = getComparacionActual(paquete, estado)
  if (!comp?.coincide) {
    throw new Error('Todavía hay diferencias entre contadores; hagan reconteo primero')
  }

  const misSonC1 = paquete.inventario_sector.mi_rol === 1
  const lineas1 = misSonC1 ? estado.mis_lineas : estado.lineas_companero
  const lineas2 = misSonC1 ? estado.lineas_companero : estado.mis_lineas
  const todas = [...lineas1, ...lineas2]

  // 1) Avisar a la PC para que su vista muestre "Recibiendo conteo…".
  await api(`/api/inventario/sectores/${sectorInvId}/iniciar-importacion-offline`, {
    method: 'POST',
    timeoutMs: 15000
  })
  // Da tiempo a que el polling corto de la pantalla de supervisión vea el estado.
  await new Promise((resolve) => setTimeout(resolve, 1200))

  // 2) Enviar al PC (no borramos nada local hasta confirmar)
  const result = await api<{
    ok?: boolean
    sector?: { importado_at?: string | null }
  }>(`/api/inventario/sectores/${sectorInvId}/importar-offline`, {
    method: 'POST',
    timeoutMs: 60000,
    body: JSON.stringify({
      ronda_actual: estado.ronda_actual,
      contador_1_finalizo: true,
      contador_2_finalizo: true,
      lineas: todas.map((l) => ({
        producto_id: l.producto_id,
        contador_id: l.contador_id,
        ronda: l.ronda,
        tipo_bulto: l.tipo_bulto,
        cantidad_bultos: l.cantidad_bultos,
        unidades_por_bulto: l.unidades_por_bulto,
        cantidad_suelta: l.cantidad_suelta,
        ubicacion: l.ubicacion,
        ubicacion_id: l.ubicacion_id,
        orden: l.orden
      }))
    })
  })

  // 3) Releer el sector en el PC: solo si confirmó importado_at borramos el conteo activo
  const check = await api<{ sector: { importado_at?: string | null; estado?: string } }>(
    `/api/inventario/sectores/${sectorInvId}`,
    { timeoutMs: 15000 }
  )
  const confirmadoAt =
    check.sector?.importado_at ?? result.sector?.importado_at ?? null
  if (!confirmadoAt) {
    throw new Error(
      'El PC no confirmó el import. Los datos siguen en este celular — reintentá cuando haya buena red.'
    )
  }

  // 4) Respaldo fuera de la carpeta del sector (por si hace falta recuperar)
  await saveImportBackup(sectorInvId, {
    paquete,
    estado,
    confirmado_at: confirmadoAt,
    lineas_enviadas: todas.length
  })

  // 5) Recién ahora liberar el paquete de trabajo
  await clearOfflineSectorLocal(sectorInvId)
  return { ...result, confirmado_at: confirmadoAt, lineas_enviadas: todas.length }
}

export async function resetOfflineLocal(sectorInvId: number): Promise<void> {
  await clearOfflineSectorLocal(sectorInvId)
}

/** Sectores con paquete local (para listar sin red al PC). */
export async function listLocalMisSectores(usuarioId?: number): Promise<
  Array<{
    id: number
    sesion_id: number
    sector_id: number
    sector_nombre: string
    sector_codigo: string
    estado: string
    ronda_actual: number
    contador_1_id: number
    contador_2_id: number
    contador_1_nombre: string
    contador_2_nombre: string
    contador_1_finalizo: boolean
    contador_2_finalizo: boolean
    soy_contador_1: boolean
    modo_conectividad: 'OFFLINE'
    paquete_descargado_at: string | null
    importado_at: string | null
  }>
> {
  const ids = await listLocalOfflineSectorIds()
  const out: Array<{
    id: number
    sesion_id: number
    sector_id: number
    sector_nombre: string
    sector_codigo: string
    estado: string
    ronda_actual: number
    contador_1_id: number
    contador_2_id: number
    contador_1_nombre: string
    contador_2_nombre: string
    contador_1_finalizo: boolean
    contador_2_finalizo: boolean
    soy_contador_1: boolean
    modo_conectividad: 'OFFLINE'
    paquete_descargado_at: string | null
    importado_at: string | null
  }> = []

  for (const id of ids) {
    const paquete = await loadPaquete(id)
    if (!paquete) continue
    const inv = paquete.inventario_sector
    if (
      usuarioId != null &&
      inv.contador_1_id !== usuarioId &&
      inv.contador_2_id !== usuarioId
    ) {
      continue
    }
    const estado = await loadEstado(id)
    const soyC1 = inv.mi_rol === 1
    const miFin = Boolean(estado?.mi_finalizo)
    const compFin = Boolean(estado?.companero_finalizo)
    out.push({
      id: inv.id,
      sesion_id: paquete.sesion.id,
      sector_id: inv.sector_id,
      sector_nombre: inv.sector_nombre,
      sector_codigo: inv.sector_codigo,
      estado: inv.estado,
      ronda_actual: estado?.ronda_actual ?? inv.ronda_actual,
      contador_1_id: inv.contador_1_id,
      contador_2_id: inv.contador_2_id,
      contador_1_nombre: inv.contador_1_nombre,
      contador_2_nombre: inv.contador_2_nombre,
      contador_1_finalizo: soyC1 ? miFin : compFin,
      contador_2_finalizo: soyC1 ? compFin : miFin,
      soy_contador_1: soyC1,
      modo_conectividad: 'OFFLINE',
      paquete_descargado_at: paquete.descargado_at,
      importado_at: null
    })
  }

  return out
}

/** Con red al PC: elimina paquetes locales de sesiones/sectores que ya no existen en el servidor. */
export async function reconcileOfflineConServidor(serverSectorIds: number[]): Promise<number> {
  return purgeOfflineNotInServerSectores(serverSectorIds)
}
