import type { Metadata } from 'next'
import { Fredoka, Nunito } from 'next/font/google'
// tokens.css first: every other sheet reads its --tk-* custom properties.
import '../src/theme/tokens.css'
import '../src/theme/scale.css'
import '../src/index.css'
import '../src/App.css'
import { ClientProviders } from '../components/ClientProviders'
import { pageMetadata, SITE_URL } from '@/lib/seo'

// Loaded once, app-wide, on <body> — every route reads --font-fredoka /
// --font-nunito, including ones that used to load neither (/investments,
// /expense/transactions) and silently fell back to the OS system font.
// No `weight` restriction: both are variable fonts, so this covers every
// weight any route used piecemeal (some previously loaded Fredoka at 600
// only and quietly faux-bolded any other weight they set in CSS).
const fredoka = Fredoka({ subsets: ['latin'], variable: '--font-fredoka', display: 'swap' })
const nunito = Nunito({ subsets: ['latin'], variable: '--font-nunito', display: 'swap' })

export const metadata: Metadata = {
  ...pageMetadata('/'),
  metadataBase: SITE_URL,
  applicationName: 'Aviary',
  // New routes remain private until explicitly given public metadata.
  robots: { index: false, follow: false },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '16x16 32x32 48x48', type: 'image/x-icon' },
      { url: '/favicon.svg?v=2', sizes: 'any', type: 'image/svg+xml' },
    ],
    apple: { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${fredoka.variable} ${nunito.variable}`}>
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  )
}
