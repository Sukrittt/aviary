import { ogCard } from '@/src/components/OgCard'

// Rendered once at build: the share card for / and /intl, and for pages without their own (lib/seo.ts ogImage).
export const dynamic = 'force-static'

export const GET = () => ogCard({ title: 'The budget app that learns your habits.', subtitle: 'Notices your 4pm chai, nudges you to log it. Never touches your bank.' })
