import { transactionalTemplate } from './transactionalTemplate'
export { SUPPORT_EMAIL } from './transactionalTemplate'

export function welcomeTemplate(name: string | null = null) {
  return transactionalTemplate({
    subject: 'Welcome to Aviary', name,
    paragraphs: [
      'Thanks for signing up. Your Aviary account is ready.',
      'A good first step is to make an envelope for something you pay for every month, like groceries or rent, and put some money in it. When you spend, log it against that envelope and you’ll see what’s left.',
      'Aviary works on the web and in the mobile app, so use whichever is handy.',
      'If you get stuck, reply to this email and we’ll help.',
    ],
    cta: 'Open Aviary', url: 'https://useaviary.com/',
    reason: 'You’re getting this because you signed up for Aviary.',
  })
}
