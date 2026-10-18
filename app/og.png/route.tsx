import { ogCard } from '@/src/components/OgCard'

// Rendered once at build: the share card for / and /intl, and for pages without their own (lib/seo.ts ogImage).
export const dynamic = 'force-static'

export const GET = () => ogCard({ title: 'It notices your 4pm chai and nudges you to log it.', subtitle: 'Learns your spending. Never touches your bank.' })
