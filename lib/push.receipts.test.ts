import { describe, it, expect, vi, beforeEach } from 'vitest'

type Token = { token: string; user_id: string; updatedAt: string }
type Ticket = { ticketId: string; token: string; user_id: string; sentAt: Date }

let tokens: Token[] = []
let tickets: Ticket[] = []
let receipts: Record<string, { status: 'ok' | 'error'; details?: { error?: string } }> = {}
let sendTickets: Array<{ status: 'ok' | 'error'; id?: string; details?: { error?: string } }> = []

const matches = (doc: Record<string, unknown>, filter: Record<string, unknown>) =>
  Object.entries(filter).every(([k, v]) => {
    if (v && typeof v === 'object' && '$in' in v) return (v.$in as unknown[]).includes(doc[k])
    if (v && typeof v === 'object' && '$lte' in v) return (doc[k] instanceof Date ? (doc[k] as Date).getTime() <= (v.$lte as Date).getTime() : String(doc[k]) <= String(v.$lte))
    return doc[k] === v
  })

vi.mock('./mongodb', () => ({
  getDb: vi.fn(async () => ({
    collection: (name: string) => {
      if (name === 'push_tokens') return {
        find: (f: Record<string, unknown>) => ({ toArray: async () => tokens.filter((t) => matches(t, f)) }),
        deleteMany: async (f: Record<string, unknown>) => {
          const before = tokens.length
          tokens = tokens.filter((t) => !matches(t, f))
          return { deletedCount: before - tokens.length }
        },
      }
      if (name === 'push_tickets') return {
        insertMany: async (docs: Ticket[]) => { tickets.push(...docs) },
        find: (f: Record<string, unknown>) => ({ limit: () => ({ toArray: async () => tickets.filter((t) => matches(t, f)) }) }),
        deleteMany: async (f: Record<string, unknown>) => { tickets = tickets.filter((t) => !matches(t, f)) },
      }
      throw new Error(`unexpected collection ${name}`)
    },
  })),
}))

vi.stubGlobal('fetch', vi.fn(async (url: string, init: { body: string }) => {
  if (url.endsWith('/push/send')) return new Response(JSON.stringify({ data: sendTickets }))
  const { ids } = JSON.parse(init.body) as { ids: string[] }
  return new Response(JSON.stringify({ data: Object.fromEntries(ids.filter((id) => receipts[id]).map((id) => [id, receipts[id]])) }))
}))

const { sendPushNotification, checkPushReceipts } = await import('./push')

beforeEach(() => {
  tokens = []
  tickets = []
  receipts = {}
  sendTickets = []
})

describe('push receipts', () => {
  it('records accepted tickets so their receipts can be checked later', async () => {
    tokens = [{ token: 'ExponentPushToken[a]', user_id: 'u1', updatedAt: '2026-10-01T00:00:00.000Z' }]
    sendTickets = [{ status: 'ok', id: 't1' }]
    await sendPushNotification({ userId: 'u1', title: 'x', body: 'y' })
    expect(tickets).toMatchObject([{ ticketId: 't1', token: 'ExponentPushToken[a]', user_id: 'u1' }])
  })

  it('prunes a token whose receipt says DeviceNotRegistered and keeps a delivered one', async () => {
    const sentAt = new Date('2026-10-09T15:25:00.000Z')
    tokens = [
      { token: 'ExponentPushToken[dead]', user_id: 'u1', updatedAt: '2026-09-18T00:00:00.000Z' },
      { token: 'ExponentPushToken[live]', user_id: 'u1', updatedAt: '2026-10-09T07:43:00.000Z' },
    ]
    tickets = [
      { ticketId: 't1', token: 'ExponentPushToken[dead]', user_id: 'u1', sentAt },
      { ticketId: 't2', token: 'ExponentPushToken[live]', user_id: 'u1', sentAt },
    ]
    receipts = { t1: { status: 'error', details: { error: 'DeviceNotRegistered' } }, t2: { status: 'ok' } }

    expect(await checkPushReceipts(new Date('2026-10-09T16:30:00Z'))).toEqual({ checked: 2, pruned: 1 })
    expect(tokens.map((t) => t.token)).toEqual(['ExponentPushToken[live]'])
    expect(tickets).toEqual([])
  })

  it('keeps a dead token the device registered again after the send', async () => {
    tokens = [{ token: 'ExponentPushToken[back]', user_id: 'u1', updatedAt: '2026-10-09T17:36:00.000Z' }]
    tickets = [{ ticketId: 't1', token: 'ExponentPushToken[back]', user_id: 'u1', sentAt: new Date('2026-10-09T15:25:00.000Z') }]
    receipts = { t1: { status: 'error', details: { error: 'DeviceNotRegistered' } } }

    await checkPushReceipts(new Date('2026-10-09T18:00:00Z'))
    expect(tokens).toHaveLength(1)
  })

  it('leaves tickets too fresh for a receipt, and ones Expo has no receipt for yet', async () => {
    tickets = [
      { ticketId: 'fresh', token: 'ExponentPushToken[a]', user_id: 'u1', sentAt: new Date('2026-10-09T16:25:00.000Z') },
      { ticketId: 'pending', token: 'ExponentPushToken[a]', user_id: 'u1', sentAt: new Date('2026-10-09T15:25:00.000Z') },
    ]
    expect(await checkPushReceipts(new Date('2026-10-09T16:30:00Z'))).toEqual({ checked: 0, pruned: 0 })
    expect(tickets.map((t) => t.ticketId)).toEqual(['fresh', 'pending'])
  })
})
