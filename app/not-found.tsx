'use client'

import { AppErrorScreen } from '@/src/components/AppErrorScreen'
import { useRouter } from 'next/navigation'

export default function NotFound() {
  const router = useRouter()
  return (
    <AppErrorScreen
      mood="searching"
      title="This page flew off"
      description="We looked everywhere. Let's get you back home."
      action={{ label: 'Take me home', onClick: () => router.replace('/') }}
    />
  )
}
