import { describe, it, expect } from 'vitest'
import { deflateRawSync } from 'node:zlib'
import ExcelJS from 'exceljs'
import { decodeText, findHeaderRow, parseCsv, readTable, readZip } from './read'

/** A minimal zip: local headers, one central directory, end record. Enough for readZip. */
function makeZip(entries: { name: string; data: Buffer; deflate: boolean }[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const e of entries) {
    const body = e.deflate ? deflateRawSync(e.data) : e.data
    const name = Buffer.from(e.name)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(e.deflate ? 8 : 0, 8)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(e.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(e.deflate ? 8 : 0, 10)
    central.writeUInt32LE(body.length, 20)
    central.writeUInt32LE(e.data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, name, body)
    centrals.push(central, name)
    offset += 30 + name.length + body.length
  }
  const dir = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(dir.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, dir, end])
}

describe('parseCsv', () => {
  it('keeps quoted delimiters, newlines and doubled quotes inside a field', () => {
    expect(parseCsv('Date,Note,Amount\n2026-10-01,"Lunch, with ""Sam""\nand Ana",-12.5\n')).toEqual([
      ['Date', 'Note', 'Amount'],
      ['2026-10-01', 'Lunch, with "Sam"\nand Ana', '-12.5'],
    ])
  })

  it('sniffs a semicolon delimiter from the header line', () => {
    expect(parseCsv('Datum;Betrag;Text\r\n01.10.2026;-1.250,00;Miete\r\n')).toEqual([
      ['Datum', 'Betrag', 'Text'],
      ['01.10.2026', '-1.250,00', 'Miete'],
    ])
  })

  it('sniffs a tab delimiter', () => {
    expect(parseCsv('Date\tAmount\n2026-10-01\t5')).toEqual([['Date', 'Amount'], ['2026-10-01', '5']])
  })

  it('sniffs the delimiter from the rows, not a title line above them', () => {
    expect(parseCsv('Statement for Jane Doe, October 2026\nDate;Description;Amount\n01/10/2026;Rent;-1.250,00\n02/10/2026;Bread;-3,50\n')).toEqual([
      ['Statement for Jane Doe, October 2026'],
      ['Date', 'Description', 'Amount'],
      ['01/10/2026', 'Rent', '-1.250,00'],
      ['02/10/2026', 'Bread', '-3,50'],
    ])
  })

  it('reads a quote inside an unquoted field as text, not the start of a quoted one', () => {
    expect(parseCsv('Date,Item,Amount\n2026-10-01,TV 55" screen,-500\n2026-10-02,Bread,-3\n')).toEqual([
      ['Date', 'Item', 'Amount'],
      ['2026-10-01', 'TV 55" screen', '-500'],
      ['2026-10-02', 'Bread', '-3'],
    ])
  })

  it('drops blank lines', () => {
    expect(parseCsv('a,b\n\n1,2\n\n')).toEqual([['a', 'b'], ['1', '2']])
  })
})

describe('decodeText', () => {
  it('strips a utf-8 BOM', () => {
    expect(decodeText(Buffer.from('﻿Date,Amount', 'utf8'))).toBe('Date,Amount')
  })

  it('falls back to windows-1252 when utf-8 decoding loses characters', () => {
    expect(decodeText(Buffer.from([0x43, 0x61, 0x66, 0xe9]))).toBe('Café')
  })
})

describe('findHeaderRow', () => {
  it('picks the line with the most recognised names, not line 1', () => {
    const rows = [['Statement for Oct 2026'], [''], ['Date', 'Description', 'Amount'], ['2026-10-01', 'Rent', '-500']]
    const known = new Set(['date', 'description', 'amount'])
    expect(findHeaderRow(rows, (cells) => cells.filter((c) => known.has(c.trim().toLowerCase())).length)).toBe(2)
  })
})

describe('readZip', () => {
  it('reads stored and deflated entries', () => {
    const zip = makeZip([
      { name: 'Budget - Register.csv', data: Buffer.from('a,b\n1,2'), deflate: true },
      { name: 'Budget - Plan.csv', data: Buffer.from('c,d'), deflate: false },
    ])
    const files = readZip(zip)
    expect(files.get('Budget - Register.csv')?.toString()).toBe('a,b\n1,2')
    expect(files.get('Budget - Plan.csv')?.toString()).toBe('c,d')
  })
})

describe('readTable limits', () => {
  it('refuses a zip that would inflate past the cap', async () => {
    const zip = makeZip([{ name: 'big.csv', data: Buffer.alloc(60 * 1024 * 1024, 48), deflate: true }])
    expect(zip.length).toBeLessThan(1024 * 1024)
    await expect(readTable(zip, 'bomb.zip')).rejects.toThrow()
  })
})

describe('readTable', () => {
  it('reads a csv into one table', async () => {
    expect(await readTable(Buffer.from('Date,Amount\n2026-10-01,5'), 'export.csv')).toEqual([
      { name: 'export.csv', rows: [['Date', 'Amount'], ['2026-10-01', '5']] },
    ])
  })

  it('reads an xlsx with date cells as YYYY-MM-DD and numbers as text', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Sheet1')
    ws.addRow(['Date', 'Amount', 'Note'])
    ws.addRow([new Date(Date.UTC(2026, 9, 1)), 1250.5, 'Rent'])
    const buf = Buffer.from(await wb.xlsx.writeBuffer())
    expect(await readTable(buf, 'export.xlsx')).toEqual([
      { name: 'Sheet1', rows: [['Date', 'Amount', 'Note'], ['2026-10-01', '1250.5', 'Rent']] },
    ])
  })

  it('reads every csv inside a zip', async () => {
    const zip = makeZip([{ name: 'My Budget - Register.csv', data: Buffer.from('a\n1'), deflate: true }])
    expect(await readTable(zip, 'ynab.zip')).toEqual([{ name: 'My Budget - Register.csv', rows: [['a'], ['1']] }])
  })

  it('throws on a file it cannot read', async () => {
    await expect(readTable(Buffer.from('not a zip'), 'x.zip')).rejects.toThrow()
  })
})
