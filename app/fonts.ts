import { Geist } from 'next/font/google'

// Geist for display and body. Two variables so the CSS keeps its display/body
// split; both resolve to the same files, so the browser fetches them once.
// latin-ext is preloaded too: it holds ₹, which nearly every screen shows.
// No `weight` restriction: Geist is a variable font (100–900).
export const displayFont = Geist({ subsets: ['latin', 'latin-ext'], variable: '--font-display', display: 'swap' })
export const bodyFont = Geist({ subsets: ['latin', 'latin-ext'], variable: '--font-body', display: 'swap' })
export const fontVariables = `${displayFont.variable} ${bodyFont.variable}`
