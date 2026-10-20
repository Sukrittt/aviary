import { ogCard } from '@/src/components/OgCard'

// The /intl share card: same brand line as app/og.png, with the international sample's habit.
export const dynamic = 'force-static'

export const GET = () => ogCard({ title: 'The budget app that learns your habits.', subtitle: 'Notices your 4pm coffee, nudges you to log it. Never touches your bank.' })
