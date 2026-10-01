import { getUserCurrency } from '@/lib/userCurrency'
import { ObjectId } from 'mongodb'
import { put, issueSignedToken, presignUrl } from '@vercel/blob'
import ExcelJS from 'exceljs'
import { createReadStream } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setImmediate as yieldToIO } from 'node:timers/promises'
import { getDb } from '@/lib/mongodb'
import { scoped } from '@/lib/scoped'
import { getCollection, nowIST } from '@/lib/http'
import { sendPushNotification } from '@/lib/push'
import type { Auth } from '@/lib/access'
import { getAccess } from '@/lib/billing/service'
import { COLLECTIONS } from '@/lib/models'
import { exportColumns, readableSheetName } from '@/lib/exportFormat'

export const EXPORT_LIMIT = 3

/** 'YYYY-MM' for the current instant, IST — same convention as lib/wrapped.ts. */
export function currentMonthKey(): string {
  return nowIST().date.slice(0, 7)
}

export async function countReadyExportsThisMonth(auth: Auth): Promise<number> {
  const coll = await getCollection('exports', auth)
  return coll.countDocuments({ status: 'ready', month: currentMonthKey() })
}

export interface ExportAllowance {
  usedThisMonth: number
  limit: number
  /** May another export be started right now? */
  allowed: boolean
  /** True while the one post-expiry export is still available. */
  exitExport: boolean
  /** Remains true after the exit export is consumed, so clients don't show the monthly-cap warning. */
  accessExpired: boolean
}

/** When continuous access ended: the later of the trial's end and any purchase's paid-through date. */
function accessEndedAt(access: { trialEndsAt: string | null; paidExpiresAt: string | null }): number {
  return Math.max(...[access.trialEndsAt, access.paidExpiresAt].map((v) => (v ? Date.parse(v) : 0)))
}

/** The most recent ready export's instant, or null — `created_at` is an offset-suffixed IST string, so parse it rather than comparing text. */
async function lastReadyExportAt(auth: Auth): Promise<number | null> {
  const coll = await getCollection('exports', auth)
  const [latest] = await coll.find({ status: 'ready' }).sort({ created_at: -1 }).limit(1).toArray()
  return latest ? Date.parse(String(latest.created_at)) : null
}

/**
 * Whether this account may start an export, and why.
 *
 * The monthly cap exists to bound workbook builds, not to hold anyone's data
 * hostage: an account whose access has ended is on its way out, and refusing
 * it the export traps someone who has already stopped paying us with no way
 * to take their data along until the 1st. So a lapsed account gets exactly
 * one export after access ends, regardless of what it spent that month.
 * `usedThisMonth` is presentation-facing and never exceeds the monthly cap:
 * the exit export is not a fourth monthly allowance.
 */
export async function exportAllowance(auth: Auth): Promise<ExportAllowance> {
  const readyThisMonth = await countReadyExportsThisMonth(auth)
  const usedThisMonth = Math.min(readyThisMonth, EXPORT_LIMIT)
  const base = { usedThisMonth, limit: EXPORT_LIMIT }
  const access = await getAccess(auth.userId)
  if (access.mode !== 'expired') {
    return {
      ...base,
      allowed: readyThisMonth < EXPORT_LIMIT,
      exitExport: false,
      accessExpired: false,
    }
  }

  const lastAt = await lastReadyExportAt(auth)
  const taken = lastAt !== null && lastAt > accessEndedAt(access)
  return {
    ...base,
    allowed: !taken,
    exitExport: !taken,
    accessExpired: true,
  }
}

const EXPORT_DOWNLOAD_TTL_MS = 5 * 60 * 1000

/**
 * The store is private-only, so a ready export's blob isn't fetchable by a
 * plain URL — mints a short-lived signed GET URL (CDN-verified, no bearer
 * token needed to fetch it) scoped to this one export's pathname.
 */
export async function getExportDownloadUrl(userId: string, exportId: string): Promise<string> {
  const pathname = `exports/${userId}/${exportId}.xlsx`
  const signed = await issueSignedToken({
    pathname,
    operations: ['get'],
    validUntil: Date.now() + EXPORT_DOWNLOAD_TTL_MS,
  })
  const { presignedUrl } = await presignUrl(signed, { operation: 'get', pathname, access: 'private' })
  return presignedUrl
}

/**
 * Builds the multi-tab workbook, uploads it to Blob storage, and notifies the
 * user. Runs inside `after()` — the kick-off POST has already responded, so
 * this must never throw: any failure is recorded on the doc and still
 * notifies, matching the never-throw pattern in lib/notifications/instant.ts.
 */
export async function buildAndStoreExport(userId: string, exportId: string): Promise<void> {
  const db = await getDb()
  const exportsColl = scoped(db.collection(COLLECTIONS.exports), userId)

  let directory: string | undefined
  let output: ReturnType<typeof createReadStream> | undefined
  try {
    directory = await mkdtemp(join(tmpdir(), 'aviary-export-'))
    const filename = join(directory, 'export.xlsx')
    const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ filename, useStyles: false, useSharedStrings: false })

    const columnsByCollection = exportColumns(await getUserCurrency(userId))
    for (const [key, name] of Object.entries(COLLECTIONS) as [keyof typeof COLLECTIONS, string][]) {
      const columns = columnsByCollection[key]
      if (!columns) continue

      const coll = scoped(db.collection(name), userId)
      const headerRow = columns.map(c => c.label)
      let tab = 1
      let sheet = wb.addWorksheet(readableSheetName(name).slice(0, 27))
      sheet.addRow(headerRow).commit()
      let count = 0
      const cursor = coll.find({}).batchSize(250)
      try {
        for await (const doc of cursor) {
          if (count > 0 && count % 1_000_000 === 0) {
            sheet.commit()
            sheet = wb.addWorksheet(`${readableSheetName(name).slice(0, 24)} ${++tab}`)
            sheet.addRow(headerRow).commit()
          }
          sheet.addRow(columns.map(c => c.format ? c.format(doc[c.key]) : String(doc[c.key] ?? ''))).commit()
          if (++count % 100 === 0) await yieldToIO()
        }
      } finally { await cursor.close() }
      sheet.commit()
    }
    await wb.commit()
    output = createReadStream(filename)
    const blob = await put(`exports/${userId}/${exportId}.xlsx`, output, {
      access: 'private',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      addRandomSuffix: false,
      allowOverwrite: true,
    })

    await exportsColl.updateOne(
      { _id: new ObjectId(exportId) },
      { $set: { status: 'ready', blob_url: blob.url, ready_at: nowIST().timestamp } },
    )
  } catch (err) {
    console.error('export: build failed for', userId, exportId, err)
    await exportsColl.updateOne(
      { _id: new ObjectId(exportId) },
      { $set: { status: 'failed', error: (err as Error).message } },
    )
    await sendPushNotification({
      userId,
      title: 'Export failed',
      body: 'Something went wrong building your export. Try again.',
      data: { route: '/account/data' },
    }).catch((pushErr) => console.error('export: failure push failed for', userId, exportId, pushErr))
    return
  } finally {
    output?.destroy()
    if (directory) await rm(directory, { recursive: true, force: true })
  }

  await sendPushNotification({
    userId,
    title: 'Your export is ready',
    body: 'Tap to download your data.',
    data: { route: '/account/data' },
  }).catch((pushErr) => console.error('export: ready push failed for', userId, exportId, pushErr))
}
