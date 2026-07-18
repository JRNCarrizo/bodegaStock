import ExcelJS from 'exceljs'
import type { FastifyReply } from 'fastify'

export type ExcelColumn = {
  header: string
  key: string
  width?: number
}

export type ExcelSheetInput = {
  name: string
  columns: ExcelColumn[]
  rows: Record<string, unknown>[]
}

function styleHeader(sheet: ExcelJS.Worksheet) {
  const header = sheet.getRow(1)
  header.font = { bold: true }
  header.alignment = { vertical: 'middle' }
}

/** Genera un .xlsx en memoria (una hoja). */
export async function buildExcelBuffer(
  sheetName: string,
  columns: ExcelColumn[],
  rows: Record<string, unknown>[]
): Promise<Buffer> {
  return buildMultiSheetExcel([{ name: sheetName, columns, rows }])
}

/** Genera un .xlsx con una o más hojas. */
export async function buildMultiSheetExcel(sheets: ExcelSheetInput[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'ControlStock'
  workbook.created = new Date()

  for (const input of sheets) {
    const sheet = workbook.addWorksheet(input.name, {
      views: [{ state: 'frozen', ySplit: 1 }]
    })
    sheet.columns = input.columns.map((c) => ({
      header: c.header,
      key: c.key,
      width: c.width ?? 18
    }))
    styleHeader(sheet)
    for (const row of input.rows) {
      sheet.addRow(row)
    }
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}

/** Hoja simple de resumen clave/valor. */
export function resumenSheet(
  name: string,
  pairs: Array<[string, string | number | null | undefined]>
): ExcelSheetInput {
  return {
    name,
    columns: [
      { header: 'Campo', key: 'campo', width: 28 },
      { header: 'Valor', key: 'valor', width: 48 }
    ],
    rows: pairs.map(([campo, valor]) => ({
      campo,
      valor: valor == null || valor === '' ? '—' : valor
    }))
  }
}

export function sendExcelFile(
  reply: FastifyReply,
  buffer: Buffer,
  filename: string
): FastifyReply {
  const safeName = filename.replace(/[^\w.\-() áéíóúÁÉÍÓÚñÑ]/g, '_').trim() || 'export.xlsx'
  return reply
    .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .header('Content-Disposition', `attachment; filename="${safeName}"`)
    .send(buffer)
}

export function todayFileStamp(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Agrega una fila final de total al listado de productos. */
export function withTotalRow(
  rows: Array<{ codigo_interno: string; nombre: string; descripcion: string; cantidad: number }>,
  totalLabel = 'TOTAL'
): Array<Record<string, unknown>> {
  const total = rows.reduce((s, r) => s + (Number(r.cantidad) || 0), 0)
  return [
    ...rows,
    {
      codigo_interno: '',
      nombre: totalLabel,
      descripcion: '',
      cantidad: total
    }
  ]
}

export const PRODUCTO_LISTADO_COLUMNS = [
  { header: 'Código interno', key: 'codigo_interno', width: 18 },
  { header: 'Nombre', key: 'nombre', width: 36 },
  { header: 'Descripción', key: 'descripcion', width: 40 },
  { header: 'Cantidad', key: 'cantidad', width: 14 }
] as const


export function excelCellText(value: unknown): string {
  if (value == null || value === '') return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim()
  if (typeof value === 'object') {
    const v = value as { text?: string; result?: unknown; richText?: Array<{ text: string }> }
    if (typeof v.text === 'string') return v.text.trim()
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('').trim()
    if (v.result != null) return excelCellText(v.result)
  }
  return String(value).trim()
}

/** Normaliza encabezados para mapear columnas flexibles. */
export function normalizeExcelHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

export async function loadWorkbookFromBase64(fileBase64: string): Promise<ExcelJS.Workbook> {
  const cleaned = fileBase64.replace(/^data:[^;]+;base64,/, '').trim()
  const buffer = Buffer.from(cleaned, 'base64')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  return workbook
}

export function readSheetAsObjects(
  workbook: ExcelJS.Workbook,
  columnAliases: Record<string, string[]>
): { rows: Record<string, string>[]; errors: string[] } {
  const sheet = workbook.worksheets[0]
  if (!sheet) return { rows: [], errors: ['El Excel no tiene hojas'] }

  const headerRow = sheet.getRow(1)
  const colIndexByKey = new Map<string, number>()
  const errors: string[] = []

  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const normalized = normalizeExcelHeader(excelCellText(cell.value))
    if (!normalized) return
    for (const [key, aliases] of Object.entries(columnAliases)) {
      if (aliases.includes(normalized) && !colIndexByKey.has(key)) {
        colIndexByKey.set(key, colNumber)
      }
    }
  })

  if (!colIndexByKey.has('codigo_interno')) {
    errors.push('Falta la columna “Código interno”')
  }
  if (!colIndexByKey.has('nombre')) {
    errors.push('Falta la columna “Nombre”')
  }
  if (errors.length) return { rows: [], errors }

  const rows: Record<string, string>[] = []
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return
    const obj: Record<string, string> = { __fila: String(rowNumber) }
    let anyValue = false
    for (const [key, col] of colIndexByKey.entries()) {
      const text = excelCellText(row.getCell(col).value)
      obj[key] = text
      if (text) anyValue = true
    }
    if (anyValue) rows.push(obj)
  })

  return { rows, errors }
}
