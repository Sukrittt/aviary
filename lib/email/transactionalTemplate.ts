import { lightTokens as colors } from '@/src/theme/tokens'

export const SUPPORT_EMAIL = 'aviary.playreview@gmail.com'
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
}

/** Lightweight, inline-styled branding with equivalent HTML and plain text. */
export function transactionalTemplate(input: {
  subject: string; name?: string | null; paragraphs: string[]; cta: string; url: string; reason: string
}) {
  const firstName = input.name?.trim().split(/\s+/)[0]?.slice(0, 80)
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,'
  const e = escapeHtml
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${e(input.subject)}</title></head>
<body style="margin:0;padding:0;background:${colors.bg};font-family:'Trebuchet MS',Arial,sans-serif;color:${colors.text};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;"><tr><td style="padding:0 8px 20px;font-size:26px;font-weight:bold;">Aviary</td></tr>
<tr><td style="padding:28px 24px;background:${colors.cardSolid};border:1px solid #ebe5dd;border-top:4px solid ${colors.accent};border-radius:20px;">
<h1 style="margin:0 0 24px;font-size:28px;line-height:36px;">${e(input.subject)}</h1>
<p style="font-size:16px;line-height:26px;">${e(greeting)}</p>
${input.paragraphs.map(p => `<p style="font-size:16px;line-height:26px;color:${colors.text2};">${e(p)}</p>`).join('')}
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="${colors.accentInk}" style="border-radius:12px;mso-padding-alt:14px 24px;"><a href="${e(input.url)}" style="display:inline-block;padding:14px 24px;color:${colors.onAccent};text-decoration:none;font-size:16px;font-weight:bold;">${e(input.cta)}</a></td></tr></table>
<p style="margin:24px 0 0;font-size:14px;line-height:24px;">The Aviary team</p></td></tr>
<tr><td style="padding:20px 8px;font-size:12px;line-height:21px;color:${colors.text3};">${e(input.reason)}<br>Questions? <a href="mailto:${SUPPORT_EMAIL}" style="color:${colors.accentInk};">${SUPPORT_EMAIL}</a></td></tr>
</table></td></tr></table></body></html>`
  return { subject: input.subject, html, text: `${greeting}\n\n${input.paragraphs.join('\n\n')}\n\n${input.cta}: ${input.url}\n\nThe Aviary team\n\n${input.reason}\nQuestions? ${SUPPORT_EMAIL}` }
}
