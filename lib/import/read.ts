import { inflateRawSync } from 'node:zlib'
import ExcelJS from 'exceljs'

/**
 * Turns an uploaded export into plain string tables. Knows nothing about
 * budgeting apps: that's `presets.ts`. No new dependencies, so csv is a small
 * RFC 4180 state machine (exceljs's csv reader can't sniff a delimiter) and a
 * zip is read straight off its central directory with zlib.
 */

export type Table = { name: string; rows: string[][] }

export function decodeText(buf: Buffer): string {
  const utf8 = new TextDecoder('utf-8').decode(buf)
  // Old Windows exports (Money Manager on a desktop, a bank's csv) are often
  // windows-1252; read as utf-8 their accents come out as U+FFFD.
  const text = utf8.includes('�') ? new TextDecoder('windows-1252').decode(buf) : utf8
  return text.replace(/^﻿/, '')
}

function sniffDelimiter(text: string): string {
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 }
  let quoted = false
  for (const ch of text) {
    if (ch === '"') quoted = !quoted
    else if (!quoted && (ch === '\n' || ch === '\r')) break
    else if (!quoted && ch in counts) counts[ch]++
  }
  const [best, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  return n > 0 ? best : ','
}

export function parseCsv(text: string): string[][] {
  const delimiter = sniffDelimiter(text)
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const endRow = () => {
    row.push(field)
    if (row.some((c) => c.trim() !== '')) rows.push(row)
    row = []
    field = ''
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === delimiter) { row.push(field); field = '' }
    else if (ch === '\n') endRow()
    else if (ch !== '\r') field += ch
  }
  if (field !== '' || row.length) endRow()
  return rows
}

/** Index of the line, among the first 10, that looks most like a header. */
export function findHeaderRow(rows: string[][], score: (cells: string[]) => number): number {
  let best = 0
  let bestScore = -1
  rows.slice(0, 10).forEach((cells, i) => {
    const s = score(cells)
    if (s > bestScore) { best = i; bestScore = s }
  })
  return best
}

export function readZip(buf: Buffer): Map<string, Buffer> {
  let end = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { end = i; break }
  }
  if (end < 0) throw new Error('not a zip')
  const count = buf.readUInt16LE(end + 10)
  let p = buf.readUInt32LE(end + 16)
  const files = new Map<string, Buffer>()
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad zip directory')
    const method = buf.readUInt16LE(p + 10)
    const size = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const local = buf.readUInt32LE(p + 42)
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8')
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
    const body = buf.subarray(start, start + size)
    if (!name.endsWith('/')) {
      if (method === 0) files.set(name, Buffer.from(body))
      else if (method === 8) files.set(name, inflateRawSync(body))
    }
    p += 46 + nameLen + extraLen + commentLen
  }
  return files
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((r) => r.text).join('')
    if ('result' in value) return cellText(value.result as ExcelJS.CellValue)
    if ('text' in value) return String(value.text)
    return ''
  }
  return String(value)
}

async function readXlsx(buf: Buffer): Promise<Table[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf as unknown as ArrayBuffer)
  return wb.worksheets.map((ws) => {
    const rows: string[][] = []
    ws.eachRow((row) => {
      const values = (row.values as ExcelJS.CellValue[]).slice(1).map(cellText)
      if (values.some((v) => v.trim() !== '')) rows.push(values)
    })
    return { name: ws.name, rows }
  })
}

const isZip = (buf: Buffer) => buf.length > 4 && buf.readUInt32LE(0) === 0x04034b50

/** Every table in the file. An xlsx is a zip too, so the name decides between them. */
export async function readTable(buf: Buffer, filename: string): Promise<Table[]> {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return readXlsx(buf)
  if (lower.endsWith('.zip') || isZip(buf)) {
    return [...readZip(buf)]
      .filter(([name]) => name.toLowerCase().endsWith('.csv') && !name.split('/').pop()!.startsWith('.'))
      .map(([name, data]) => ({ name, rows: parseCsv(decodeText(data)) }))
  }
  return [{ name: filename, rows: parseCsv(decodeText(buf)) }]
}
