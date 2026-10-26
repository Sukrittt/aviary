import { transactionalTemplate } from './transactionalTemplate'
export { SUPPORT_EMAIL } from './transactionalTemplate'

export function welcomeTemplate(name: string | null = null) {
  return transactionalTemplate({
    subject: 'Welcome to Aviary', name, note: true, signature: 'Sukrit',
    paragraphs: [
      'Thanks for signing up. Your Aviary account is ready.',
      'I’m Sukrit. I built Aviary after quitting every budgeting app I tried, usually by week two.',
      'Start small. Make one category for something you pay every month, like rent or groceries, and put some money in it.',
      'When you spend, log it there. You’ll see what’s left.',
      'Aviary works on the web and in the app, so use whichever’s handy.',
      'P.S. Hit reply and tell me why you signed up. I read every one, and it shapes what I build next.',
    ],
    cta: 'Open Aviary', url: 'https://useaviary.com/', secondary: { label: 'Get the Android app', url: 'https://play.google.com/store/apps/details?id=com.sukrit04.envelope' },
    reason: 'You’re getting this because you signed up for Aviary.',
  })
}
