import type { Metadata } from 'next'
import { JoinPage } from '@/src/views/JoinPage'

// Public: someone opening an invite may not have an account yet. Not in middleware's APP_PATHS.
export const metadata: Metadata = { title: 'Join a budget · Aviary', robots: { index: false, follow: false } }

export default async function JoinRoute({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  return <JoinPage code={code.toUpperCase()} />
}
