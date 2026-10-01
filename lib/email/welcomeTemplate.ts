import { lightTokens as colors } from '@/src/theme/tokens'

const SITE = 'https://useaviary.com'
export const SUPPORT_EMAIL = 'aviary.playreview@gmail.com'

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
}

/** Inline styles and presentation tables survive Gmail/Outlook; web fonts are optional enhancements. */
export function welcomeTemplate(name: string | null = null): { subject: string; html: string; text: string } {
  const firstName = name?.trim().split(/\s+/)[0]?.slice(0, 80)
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,'
  const headingFont = "'Fredoka', 'Trebuchet MS', sans-serif"
  const bodyFont = "'Nunito', 'Trebuchet MS', Arial, sans-serif"
  const steps = [
    ['01', 'Give your money a home', 'Set up envelopes for the things you spend on and the things you’re saving for.'],
    ['02', 'Log one little expense', 'Start with your next coffee, grocery run, or ride home. Small entries add up to a clearer picture.'],
    ['03', 'Find your own rhythm', 'See what’s left in each envelope and adjust as life happens. Your plan can change with you.'],
  ]
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>Welcome to Aviary</title>
<style>@import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600&family=Nunito:wght@400;600;700;800&display=swap');@media only screen and (max-width:600px){.email-wrap{padding:20px 12px!important}.email-content{padding:28px 24px!important}.email-title{font-size:38px!important;line-height:44px!important}.email-footer{padding:24px 12px!important}}</style></head>
<body style="margin:0;padding:0;background-color:${colors.bg};color:${colors.text};font-family:${bodyFont};-webkit-text-size-adjust:100%;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">A calmer home for your money. Let’s take the first small step.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${colors.bg};"><tr><td class="email-wrap" align="center" style="padding:40px 20px;">
<!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="padding:0 4px 24px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="44"><a href="${SITE}" style="text-decoration:none;"><img src="${SITE}/icon.png" width="40" height="40" alt="Aviary bird" style="display:block;border:0;border-radius:12px;"></a></td><td style="padding-left:10px;font-family:${headingFont};font-size:26px;font-weight:600;color:${colors.text};">Aviary</td></tr></table></td></tr>
<tr><td class="email-content" style="background-color:${colors.cardSolid};border:1px solid #ebe5dd;border-top:4px solid ${colors.accent};border-radius:24px;padding:36px 36px 32px;">
<p style="margin:0 0 20px;font-size:11px;line-height:18px;font-weight:800;letter-spacing:2px;color:${colors.accentInk};">YOUR FRESH START</p>
<h1 class="email-title" style="margin:0 0 24px;font-family:${headingFont};font-size:46px;line-height:52px;font-weight:500;letter-spacing:-1.2px;color:${colors.text};">Your money.<br>A little more <span style="color:${colors.accentInk};">calm.</span></h1>
<p style="margin:0 0 10px;font-size:16px;line-height:26px;font-weight:800;color:${colors.text};">${escapeHtml(greeting)}</p>
<p style="margin:0 0 28px;font-size:16px;line-height:26px;color:${colors.text2};">Welcome to Aviary. You don’t need a perfect budget to begin. Just a place for your money, and one small step at a time.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${colors.inputBg};border-radius:18px;"><tr><td style="padding:24px;">
<p style="margin:0 0 20px;font-family:${headingFont};font-size:21px;line-height:28px;font-weight:500;color:${colors.text};">Make yourself at home.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${steps.map(([number, title, body], index) => `<tr><td width="36" valign="top" style="padding:0 10px ${index < 2 ? '22' : '0'}px 0;font-size:12px;line-height:24px;font-weight:800;color:${colors.accentInk};">${number}</td><td valign="top" style="padding-bottom:${index < 2 ? '22' : '0'}px;"><p style="margin:0 0 4px;font-size:15px;line-height:24px;font-weight:800;color:${colors.text};">${title}</p><p style="margin:0;font-size:14px;line-height:22px;color:${colors.text2};">${body}</p></td></tr>`).join('')}</table>
</td></tr></table>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:28px;"><tr><td align="center" bgcolor="${colors.accentInk}" style="border-radius:14px;mso-padding-alt:16px 28px;"><a href="${SITE}/" style="display:inline-block;padding:16px 28px;border:1px solid ${colors.accentInk};border-radius:14px;font-family:${bodyFont};font-size:16px;line-height:20px;font-weight:800;color:${colors.onAccent};text-decoration:none;">Open Aviary &nbsp;→</a></td></tr></table>
<p style="margin:16px 0 0;font-size:12px;line-height:20px;color:${colors.text3};">Already on mobile? You can get started in the app, too.</p>
<p style="margin:28px 0 0;font-size:14px;line-height:23px;color:${colors.text2};">Here’s to a little less guesswork.<br><strong style="color:${colors.text};">The Aviary team</strong></p>
</td></tr>
<tr><td class="email-footer" style="padding:24px 12px 0;font-size:12px;line-height:21px;color:${colors.text3};"><p style="margin:0 0 8px;">Need a hand? <a href="mailto:${SUPPORT_EMAIL}" style="color:${colors.accentInk};text-decoration:underline;">We’re here to help.</a></p><p style="margin:0;">You’re receiving this welcome email because you created an Aviary account.</p><p style="margin:10px 0 0;"><a href="${SITE}/legal/privacy" style="color:${colors.text3};text-decoration:underline;">Privacy</a> &nbsp;·&nbsp; <a href="${SITE}/legal/contact" style="color:${colors.text3};text-decoration:underline;">Contact</a></p></td></tr>
</table><!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`
  return {
    subject: 'Welcome to Aviary — a calmer home for your money',
    html,
    text: `${greeting}\n\nWelcome to Aviary. You don’t need a perfect budget to begin. Just a place for your money, and one small step at a time.\n\nMake yourself at home.\n\n${steps.map(([, title, body], index) => `${index + 1}. ${title}\n${body}`).join('\n\n')}\n\nOpen Aviary: ${SITE}/\nAlready on mobile? You can get started in the app, too.\n\nHere’s to a little less guesswork.\nThe Aviary team\n\nNeed a hand? ${SUPPORT_EMAIL}\nYou’re receiving this welcome email because you created an Aviary account.\nPrivacy: ${SITE}/legal/privacy\nContact: ${SITE}/legal/contact`,
  }
}
