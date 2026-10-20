import { describe, it, expect, vi } from 'vitest'

const apiFetch = vi.fn()
vi.mock('./client', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))
vi.mock('./ai', () => ({ allowanceHit: async () => false }))

const { readStatement } = await import('./statement')
const images = { images: [{ data: 'x', mimeType: 'image/jpeg' }] }

describe('readStatement', () => {
  it('words the platform turning away a big upload, which carries no JSON code', async () => {
    apiFetch.mockResolvedValue(new Response('Request Entity Too Large', { status: 413 }))
    await expect(readStatement(images)).rejects.toThrow("That's too big to upload. Try fewer screenshots or a shorter date range.")
  })

  it('points a locked pdf at Excel or CSV, and never shows raw server text', async () => {
    apiFetch.mockResolvedValue(Response.json({ error: 'pdf_locked' }, { status: 400 }))
    await expect(readStatement(images)).rejects.toThrow(/download the statement as Excel or CSV/i)
    apiFetch.mockResolvedValue(Response.json({ error: 'gemini exploded' }, { status: 502 }))
    await expect(readStatement(images)).rejects.toThrow('Check your connection and try again.')
  })

  it('says when a statement is in another currency from the budget', async () => {
    apiFetch.mockResolvedValue(Response.json({ error: 'other_currency' }, { status: 400 }))
    await expect(readStatement({ file: new File(['x'], 'card.csv') })).rejects.toThrow("This statement's in a different currency from your budget. Try one from your main account.")
  })
})
