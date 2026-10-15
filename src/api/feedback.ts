// Bug report / feedback form. Twin of Mobile/src/api/feedback.ts.
// The server (app/api/feedback) records the report in Mongo — this module
// just posts the form fields plus diagnostics.
import { apiFetch } from './client'

export type FeedbackType = 'bug' | 'idea'

/**
 * Mobile reports an app version from expo-application, a device label from
 * expo-device, and the last screen from its analytics module. A browser has
 * none of those, so the web equivalents are the user agent and the current
 * path. The server coerces every field to a 200-char string, so the shapes
 * need not match.
 */
function diagnostics(): { appVersion: string; device: string; screen: string } {
  return {
    appVersion: 'web',
    device: typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent,
    screen: typeof window === 'undefined' ? 'unknown' : window.location.pathname,
  }
}

// Bare messages on purpose, matching mobile: a status number in the message
// would misfire mobile's sign-in bounce guard, and both apps render these
// through the same written copy rather than showing the raw text.
export async function submitFeedback(type: FeedbackType, title: string, description: string): Promise<void> {
  const resp = await apiFetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, title: title.trim(), description: description.trim(), diagnostics: diagnostics() }),
  })
  if (resp.status === 429) throw new Error('rate_limited')
  if (!resp.ok) throw new Error('failed')
}
