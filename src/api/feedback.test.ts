import { beforeEach, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { apiFetch } from './client'
import { submitFeedback } from './feedback'

vi.mock('./client', () => ({ apiFetch: vi.fn() }))

const mockedApiFetch = apiFetch as Mock

beforeEach(() => {
  mockedApiFetch.mockReset()
  mockedApiFetch.mockResolvedValue({ ok: true, status: 200 })
})

it('posts a bug report without a screenshot field when there is none', async () => {
  await submitFeedback('bug', '  Chart overlaps  ', '  On Insights  ')
  const body = JSON.parse(mockedApiFetch.mock.calls[0][1].body)
  expect(body).toMatchObject({ type: 'bug', title: 'Chart overlaps', description: 'On Insights', diagnostics: { appVersion: 'web' } })
  expect(body).not.toHaveProperty('screenshot')
})

it('sends an optional screenshot', async () => {
  await submitFeedback('bug', 't', 'd', { image: 'c2hvdA==', mimeType: 'image/jpeg' })
  expect(JSON.parse(mockedApiFetch.mock.calls[0][1].body).screenshot).toEqual({ image: 'c2hvdA==', mimeType: 'image/jpeg' })
})

it('rejects with bare messages, never a status number', async () => {
  mockedApiFetch.mockResolvedValue({ ok: false, status: 429 })
  await expect(submitFeedback('bug', 't', 'd')).rejects.toThrow('rate_limited')
  mockedApiFetch.mockResolvedValue({ ok: false, status: 500 })
  await expect(submitFeedback('bug', 't', 'd')).rejects.toThrow(/^failed$/)
})
