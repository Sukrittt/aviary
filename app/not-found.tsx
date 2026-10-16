'use client'

import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'

// Dynamic, so the app stylesheets it brings load only when a 404 renders (see AppErrorScreen).
const AppErrorScreen = dynamic(() => import('@/src/components/AppErrorScreen').then((m) => m.AppErrorScreen))

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
