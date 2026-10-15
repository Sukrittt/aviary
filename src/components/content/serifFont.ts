import { Newsreader } from 'next/font/google'

// Serif for content page headlines and the blog drop cap, so they read like an article
// rather than an app screen. Only content pages (ContentPage) import it, so the app never loads it.
export const serifFont = Newsreader({ subsets: ['latin', 'latin-ext'], variable: '--font-serif', display: 'swap' })
