import { ogCard } from '@/src/components/OgCard'

// The /intl share card: same brand line as app/og.png, with the international sample's habit.
export const dynamic = 'force-static'

export const GET = () => ogCard({ title: 'It notices your 4pm coffee and nudges you to log it.', subtitle: 'Learns your spending. Never touches your bank.' })
