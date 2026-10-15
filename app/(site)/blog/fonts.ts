import { Newsreader } from 'next/font/google'

// Serif for blog headlines and the drop cap, so posts read like an article
// rather than an app screen. Only blog routes import this, so only they load it.
export const serifFont = Newsreader({ subsets: ['latin', 'latin-ext'], variable: '--font-serif', display: 'swap' })
