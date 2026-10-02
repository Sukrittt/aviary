export interface EmailMessage {
  from: string
  to: string[]
  subject: string
  html: string
  text: string
  reply_to?: string
}

/** Ambiguous failures may have been accepted by Resend; only retry inside its 24-hour dedupe window. */
export class EmailSendError extends Error {
  constructor(message: string, readonly ambiguous: boolean) { super(message) }
}

export async function sendEmail(message: EmailMessage, idempotencyKey: string): Promise<string> {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new EmailSendError('RESEND_API_KEY is not configured', false)
  let response: Response
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(5_000),
    })
  } catch {
    throw new EmailSendError('Resend request did not complete', true)
  }
  if (!response.ok) throw new EmailSendError(`Resend rejected the email (HTTP ${response.status})`, response.status >= 500 || response.status === 409)
  let result: { id?: unknown }
  try { result = await response.json() } catch { throw new EmailSendError('Resend returned an invalid response', true) }
  if (typeof result.id !== 'string' || !result.id) throw new EmailSendError('Resend did not return an email id', true)
  return result.id
}
