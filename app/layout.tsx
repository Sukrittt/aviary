import type { Metadata } from 'next'
// globals.css (Tailwind + shadcn) first: its rules sit in cascade layers, so the
// unlayered app sheets below always win.
import './globals.css'
// Then tokens.css: every other app sheet reads its --tk-* custom properties.
import '../src/theme/tokens.css'
import '../src/theme/scale.css'
import '../src/index.css'
import '../src/App.css'
import { ClientProviders } from '../components/ClientProviders'
import { pageMetadata, SITE_URL } from '@/lib/seo'
import { fontVariables } from './fonts'

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
    // Font variables on <html> so :root-level custom properties can read them.
    <html lang="en" className={fontVariables}>
      <body>
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  )
}
