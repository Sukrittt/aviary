'use client'

import { useRouter } from 'next/navigation'
import { BirdEmptyState } from '@/src/components/BirdEmptyState'
import '@/src/expense-redesign.css'

export default function NotFound() {
  const router = useRouter()
  return (
    <main className="expense-redesign">
      <BirdEmptyState
        mood="searching"
        title="This page flew off"
        description="We looked everywhere. Let's get you back home."
        action={{ label: 'Take me home', onClick: () => router.replace('/') }}
      />
    </main>
  )
}
