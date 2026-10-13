'use client'
import { useEffect, type ReactNode } from 'react'
import { useAuth } from '@workos-inc/authkit-nextjs/components'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getUser, type UserProfile } from '@/src/api/account'
import { CurrencyScope } from '@/src/context/CurrencyContext'

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const qc = useQueryClient()
  // Drop only another account's cached profile. The session loading in for the
  // same account (Home ships its profile in the HTML) must keep it, or everything
  // reading it, like hidden features, blinks for a frame while it refetches.
  useEffect(() => {
    const cached = qc.getQueryData<UserProfile>(['user'])
    if (user && cached && cached._id !== user.id) qc.removeQueries({ queryKey: ['user'] })
  }, [user, qc])
  const profile = useQuery({ queryKey: ['user'], queryFn: getUser, enabled: !!user, staleTime: 30_000, refetchOnWindowFocus: 'always' })
  return <CurrencyScope code={user && profile.data?._id === user.id ? profile.data.currencyCode ?? 'INR' : 'INR'}>{children}</CurrencyScope>
}
