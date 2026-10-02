// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { EmailSendError, sendEmail, type EmailMessage } from './resend'

const message: EmailMessage = { from: 'Aviary <hello@useaviary.com>', to: ['person@example.com'], subject: 'Welcome', html: '<p>Hello</p>', text: 'Hello' }
const fetchMock = vi.fn()
beforeEach(() => { vi.stubEnv('RESEND_API_KEY', 'test-key'); vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset() })
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

it('sends HTML and text with the same retry identity and returns the provider id', async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 'email_test' })))
  expect(await sendEmail(message, 'welcome/test')).toBe('email_test')
  expect(fetchMock).toHaveBeenCalledWith('https://api.resend.com/emails', expect.objectContaining({ method: 'POST', body: JSON.stringify(message), headers: expect.objectContaining({ 'Idempotency-Key': 'welcome/test' }), signal: expect.any(AbortSignal) }))
})

it.each([[400, false], [429, false], [409, true], [503, true]])('classifies HTTP %s without leaking the provider response', async (status, ambiguous) => {
  fetchMock.mockResolvedValue(new Response('private details', { status }))
  await expect(sendEmail(message, 'welcome/test')).rejects.toMatchObject({ ambiguous, message: `Resend rejected the email (HTTP ${status})` })
})

it.each(['timeout', 'missing id', 'invalid JSON'])('treats %s as an uncertain delivery', async reason => {
  if (reason === 'timeout') fetchMock.mockRejectedValue(new Error('private details'))
  else fetchMock.mockResolvedValue(new Response(reason === 'missing id' ? '{}' : 'not JSON'))
  await expect(sendEmail(message, 'welcome/test')).rejects.toMatchObject({ ambiguous: true })
})

it('does not attempt an unauthenticated request', async () => {
  vi.stubEnv('RESEND_API_KEY', '')
  await expect(sendEmail(message, 'welcome/test')).rejects.toBeInstanceOf(EmailSendError)
  expect(fetchMock).not.toHaveBeenCalled()
})
