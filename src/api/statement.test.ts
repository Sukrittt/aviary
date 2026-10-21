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

  it('names a locked pdf by code so the modal can ask for the password, and never shows raw server text', async () => {
    apiFetch.mockResolvedValue(Response.json({ error: 'pdf_locked' }, { status: 400 }))
    await expect(readStatement(images)).rejects.toMatchObject({ code: 'pdf_locked', title: 'That PDF is locked' })
    apiFetch.mockResolvedValue(Response.json({ error: 'pdf_password_wrong' }, { status: 400 }))
    await expect(readStatement(images)).rejects.toThrow("That didn't open it, try again.")
    apiFetch.mockResolvedValue(Response.json({ error: 'gemini exploded' }, { status: 502 }))
    await expect(readStatement(images)).rejects.toThrow('Check your connection and try again.')
  })

  it('sends a password with the file only when there is one', async () => {
    apiFetch.mockImplementation(async () => Response.json({ id: 'p', items: [], credits: 0, dropped: 0 }))
    await readStatement({ file: new File(['x'], 'hdfc.pdf'), password: '01011990' })
    expect((apiFetch.mock.calls.at(-1)![1].body as FormData).get('password')).toBe('01011990')
    await readStatement({ file: new File(['x'], 'hdfc.pdf') })
    expect((apiFetch.mock.calls.at(-1)![1].body as FormData).has('password')).toBe(false)
  })

  it('says when a statement is in another currency from the budget', async () => {
    apiFetch.mockImplementation(async () => Response.json({ error: 'other_currency' }, { status: 400 }))
    await expect(readStatement({ file: new File(['x'], 'card.csv') })).rejects.toThrow("These payments are in a different currency from your budget, so nothing was added. Try a statement or screenshot from the account you budget in.")
    await expect(readStatement({ file: new File(['x'], 'card.csv') })).rejects.toMatchObject({ title: 'Different currency' })
  })
})
