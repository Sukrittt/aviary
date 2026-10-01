import { transactionalTemplate } from './transactionalTemplate'
export { SUPPORT_EMAIL } from './transactionalTemplate'

export function welcomeTemplate(name: string | null = null) {
  return transactionalTemplate({
    subject: 'Welcome to Aviary', name,
    paragraphs: [
      'Your Aviary account is ready. Aviary helps you plan your spending with envelopes and keep track of everyday expenses.',
      'To get started, create an envelope for something you spend on, add money to it, and record your first expense. You can do this on the website or in the mobile app.',
      'If you need help getting set up, reply to this email.',
    ],
    cta: 'Open Aviary', url: 'https://useaviary.com/',
    reason: 'You’re receiving this email because you created an Aviary account.',
  })
}
