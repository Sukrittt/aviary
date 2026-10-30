import { gunzipSync, inflateRawSync } from 'node:zlib'
import ExcelJS from 'exceljs'

/**
 * Turns an uploaded export into plain string tables. Knows nothing about
 * budgeting apps: that's `presets.ts`. No new dependencies, so csv is a small
 * RFC 4180 state machine (exceljs's csv reader can't sniff a delimiter) and a
 * zip is read straight off its central directory with zlib.
 */

export type Table = { name: string; rows: string[][] }

export function decodeText(buf: Buffer): string {
  // Excel's "Unicode text" and some bank exports are utf-16, always with a BOM.
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf.subarray(2))
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder('utf-16be').decode(buf.subarray(2))
  const utf8 = new TextDecoder('utf-8').decode(buf)
  // Old Windows exports (Money Manager on a desktop, a bank's csv) are often
  // windows-1252; read as utf-8 their accents come out as U+FFFD.
  const text = utf8.includes('�') ? new TextDecoder('windows-1252').decode(buf) : utf8
  return text.replace(/^﻿/, '')
}

/**
 * The delimiter that splits the first lines most consistently: the most
 * lines with the same non-zero count, then the most columns. Line 1 alone
 * misleads when a title line sits above the header.
 */
function sniffDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 10)
  let best = ','
  let bestScore = [0, 0]
  for (const d of [',', ';', '\t']) {
    const counts = lines.map((line) => line.replace(/"[^"]*"/g, '').split(d).length - 1).filter((n) => n > 0)
    const freq = new Map<number, number>()
    for (const n of counts) freq.set(n, (freq.get(n) ?? 0) + 1)
    const [mode, lineCount] = [...freq].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0] ?? [0, 0]
    if (lineCount > bestScore[0] || (lineCount === bestScore[0] && mode > bestScore[1])) {
      best = d
      bestScore = [lineCount, mode]
    }
  }
  return best
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
    } else if (ch === '"' && field === '') quoted = true
    else if (ch === delimiter) { row.push(field); field = '' }
    else if (ch === '\n') endRow()
    else if (ch !== '\r') field += ch
  }
  if (field !== '' || row.length) endRow()
  return rows
}

/** Index of the line, among the first 50, that looks most like a header. Bank statements open with a page of account details. */
export function findHeaderRow(rows: string[][], score: (cells: string[]) => number): number {
  let best = 0
  let bestScore = -1
  rows.slice(0, 50).forEach((cells, i) => {
    const s = score(cells)
    if (s > bestScore) { best = i; bestScore = s }
  })
  return best
}

/**
 * Most a zip or gzip may inflate to, in total. A 50,000-row workbook's sheet
 * xml is about 17 MB, and 32 MB is past what the stored rows can hold anyway;
 * more only costs the preview its memory and its 30 seconds.
 */
const MAX_INFLATED = 32 * 1024 * 1024

/** A zip past MAX_INFLATED: too big, not unreadable, so the user hears to export less. */
export class ZipTooLarge extends Error {}

export function readZip(buf: Buffer): Map<string, Buffer> {
  let end = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { end = i; break }
  }
  if (end < 0) throw new Error('not a zip')
  const count = buf.readUInt16LE(end + 10)
  let p = buf.readUInt32LE(end + 16)
  const files = new Map<string, Buffer>()
  let inflated = 0
  let actual = 0
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad zip directory')
    const method = buf.readUInt16LE(p + 10)
    const size = buf.readUInt32LE(p + 20)
    inflated += buf.readUInt32LE(p + 24)
    if (inflated > MAX_INFLATED) throw new ZipTooLarge()
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const local = buf.readUInt32LE(p + 42)
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8')
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
    const body = buf.subarray(start, start + size)
    if (!name.endsWith('/')) {
      if (method === 0) {
        actual += body.length
        files.set(name, Buffer.from(body))
      }
      // The declared sizes above can lie; the bytes actually inflated can't.
      else if (method === 8) {
        let out: Buffer
        try { out = inflateRawSync(body, { maxOutputLength: MAX_INFLATED - actual }) }
        catch (e) { throw (e as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE' ? new ZipTooLarge() : e }
        actual += out.length
        files.set(name, out)
      }
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
const isGzip = (buf: Buffer) => buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b

/**
 * Every table in the file. An xlsx is a zip too, so the name decides between
 * them. A gzip is the browser squeezing a big export under the upload cap
 * (`ImportFlow`): its name is the file's own.
 */
export async function readTable(buf: Buffer, filename: string): Promise<Table[]> {
  if (isGzip(buf)) {
    try { buf = gunzipSync(buf, { maxOutputLength: MAX_INFLATED }) }
    catch (e) { throw (e as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE' ? new ZipTooLarge() : e }
  }
  const lower = filename.toLowerCase()
  // A binary (pre-2007) .xls isn't a zip and exceljs can't read it; one renamed from .xlsx is.
  if (lower.endsWith('.xls') && !isZip(buf)) throw new Error('binary xls')
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    // Inflated here first so the cap holds on the bytes, not the declared sizes, before exceljs inflates it again.
    // ponytail: exceljs loads the whole workbook; under MAX_INFLATED that's ~2s. A streaming WorkbookReader if the cap goes up.
    readZip(buf)
    return readXlsx(buf)
  }
  if (lower.endsWith('.zip') || isZip(buf)) {
    return [...readZip(buf)]
      .filter(([name]) => name.toLowerCase().endsWith('.csv') && !name.split('/').pop()!.startsWith('.'))
      .map(([name, data]) => ({ name, rows: parseCsv(decodeText(data)) }))
  }
  return [{ name: filename, rows: parseCsv(decodeText(buf)) }]
}
