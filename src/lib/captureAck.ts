/**
 * What Ask Aviary says under a capture card once its rows are logged. Picked
 * on the device so it shows the instant the rows land, then saved with the
 * proposal so a reopened chat shows the same line. The kicker above it already
 * says how many were logged, so none of these count. Twin of Mobile's
 * src/lib/captureAck.ts.
 */
export const ACK_PHRASES = [
  'All set, your books are up to date.',
  "Done. You're all caught up.",
  'Logged and filed. Nice one.',
  'All in. Your envelopes are current.',
  "Sorted. Your budget's up to date.",
  'In the books. Thanks for keeping up.',
  "Easy. You're all caught up now.",
  'Done and dusted.',
  'Filed away. Your numbers are fresh.',
  "That's in. Nice and tidy.",
  'All added. Your budget thanks you.',
  "Noted and logged. You're on top of it.",
] as const

export function pickAck(random: () => number = Math.random): string {
  return ACK_PHRASES[Math.floor(random() * ACK_PHRASES.length) % ACK_PHRASES.length]
}

/** Only a line from the list is saved, so a client can't write arbitrary chat text. */
export function isAckPhrase(text: unknown): text is string {
  return typeof text === 'string' && (ACK_PHRASES as readonly string[]).includes(text)
}
