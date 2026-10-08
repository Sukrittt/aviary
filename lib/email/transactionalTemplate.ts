export const SUPPORT_EMAIL = 'support@useaviary.com'
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
}

// Landing page palette (src/landing.css) on plain white, like the landing hero. Hardcoded because email
// clients only honour inline styles and the script sender can't resolve `@/`.
const C = { bg: '#ffffff', ink: '#1e1d1a', body: '#3d3a35', muted: '#625f58', surface: '#f2f0e9', accentInk: '#b93c0c', tint: '#fff0e6',  }
const DISPLAY = "Fredoka, 'Trebuchet MS', 'Segoe UI', 'Arial Rounded MT Bold', sans-serif"
const BODY = "Nunito, 'Avenir Next', 'Segoe UI', Helvetica, Arial, sans-serif"
const MARK_URL = 'https://useaviary.com/apple-touch-icon.png'

export interface TransactionalEmail {
  subject: string
  name?: string | null
  /** Small pill above the title, like the landing page's "early access" badge. */
  kicker?: string
  /** Defaults to the subject. Wrap one word in *asterisks* to paint it accent. */
  title?: string
  paragraphs: string[]
  /** Label/value rows in a soft panel, for receipts and dates. */
  details?: [string, string][]
  cta: string
  url: string
  secondary?: { label: string; url: string }
  reason: string
}

function title(raw: string) {
  const e = escapeHtml
  return raw.replace(/\*([^*]+)\*/, (_, word) => `\u0000${word}\u0000`).split('\u0000')
    .map((part, i) => i === 1 ? `<span style="color:${C.accentInk};">${e(part)}</span>` : e(part)).join('')
}

/** Inline-styled, table-based branding that mirrors the landing page. Fonts load where the client allows and fall back quietly. */
export function transactionalTemplate(input: TransactionalEmail) {
  const firstName = input.name?.trim().split(/\s+/)[0]?.slice(0, 80)
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,'
  const heading = input.title ?? input.subject
  const e = escapeHtml
  const p = (size: number, color: string) => `margin:0 0 16px;font-family:${BODY};font-size:${size}px;line-height:${Math.round(size * 1.6)}px;color:${color};`
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${e(input.subject)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600&family=Nunito:wght@400;700;800&display=swap"></head>
<body style="margin:0;padding:0;background:${C.bg};font-family:${BODY};color:${C.ink};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="padding:0 0 28px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:10px;"><img src="${MARK_URL}" width="34" height="34" alt="" style="display:block;border-radius:10px;"></td>
<td style="font-family:${DISPLAY};font-size:25px;font-weight:600;letter-spacing:-0.5px;color:${C.ink};">Aviary<span style="color:${C.accentInk};">.</span></td>
</tr></table></td></tr>
<tr><td>
${input.kicker ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:18px;"><tr><td bgcolor="${C.tint}" style="border-radius:100px;padding:5px 12px;font-family:${BODY};font-size:12px;font-weight:800;letter-spacing:0.3px;text-transform:uppercase;color:${C.accentInk};">${e(input.kicker)}</td></tr></table>` : ''}
<h1 style="margin:0 0 20px;font-family:${DISPLAY};font-size:34px;line-height:38px;font-weight:500;letter-spacing:-0.8px;color:${C.ink};">${title(heading)}</h1>
<p style="${p(17, C.ink)}">${e(greeting)}</p>
${input.paragraphs.map(text => `<p style="${p(17, C.body)}">${e(text)}</p>`).join('\n')}
${input.details?.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 24px;background:${C.surface};border-radius:16px;"><tr><td style="padding:6px 18px;">
${input.details.map(([label, value]) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:10px 0;font-family:${BODY};font-size:14px;font-weight:700;color:${C.muted};">${e(label)}</td><td align="right" style="padding:10px 0;font-family:${BODY};font-size:15px;font-weight:800;color:${C.ink};">${e(value)}</td></tr></table>`).join('')}
</td></tr></table>` : ''}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:8px;"><tr><td bgcolor="${C.ink}" style="border-radius:999px;mso-padding-alt:16px 28px;"><a href="${e(input.url)}" style="display:inline-block;padding:16px 28px;font-family:${BODY};color:#ffffff;text-decoration:none;font-size:16px;font-weight:800;">${e(input.cta)}</a></td></tr></table>
${input.secondary ? `<p style="margin:18px 0 0;font-family:${BODY};font-size:15px;font-weight:800;"><a href="${e(input.secondary.url)}" style="color:${C.accentInk};text-decoration:none;">${e(input.secondary.label)} &rarr;</a></p>` : ''}
<p style="margin:32px 0 0;font-family:${BODY};font-size:15px;line-height:24px;color:${C.body};">Happy budgeting,<br><strong style="color:${C.ink};">The Aviary team</strong></p>
</td></tr>
<tr><td style="padding:32px 0 0;font-family:${BODY};font-size:13px;line-height:21px;color:${C.muted};">${e(input.reason)}<br>Questions? Just reply, or write to <a href="mailto:${SUPPORT_EMAIL}" style="color:${C.accentInk};">${SUPPORT_EMAIL}</a>.<br><a href="https://useaviary.com" style="color:${C.muted};">useaviary.com</a></td></tr>
</table></td></tr></table></body></html>`
  const details = input.details?.length ? `\n${input.details.map(([label, value]) => `${label}: ${value}`).join('\n')}\n` : ''
  const secondary = input.secondary ? `\n${input.secondary.label}: ${input.secondary.url}` : ''
  const text = `${greeting}\n\n${input.paragraphs.join('\n\n')}\n${details}\n${input.cta}: ${input.url}${secondary}\n\nHappy budgeting,\nThe Aviary team\n\n${input.reason}\nQuestions? Just reply, or write to ${SUPPORT_EMAIL}.\nuseaviary.com`
  return { subject: input.subject, html, text }
}
