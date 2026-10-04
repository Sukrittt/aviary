'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@workos-inc/authkit-nextjs/components'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMoneyBrain } from './MoneyBrainProvider'
import { ChangelogPopup } from '@/src/components/ChangelogPopup'
import type { ChangelogRelease } from '@/src/lib/changelog'

function interrupted() {
  return document.visibilityState !== 'visible' || Array.from(document.querySelectorAll('[aria-modal="true"], dialog[open], .erd-mobile-scrim.is-open')).some((element) => {
    const style = getComputedStyle(element)
    return !element.closest('[hidden], [aria-hidden="true"]') && style.display !== 'none' && style.visibility !== 'hidden'
  })
}

function subscribeInterruptions(notify: () => void) {
  const observer = new MutationObserver(notify)
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-modal', 'aria-hidden', 'hidden', 'open', 'class', 'style'] })
  document.addEventListener('visibilitychange', notify)
  return () => { observer.disconnect(); document.removeEventListener('visibilitychange', notify) }
}

export function ChangelogAnnouncement() {
  const { user } = useAuth()
  const pathname = usePathname() ?? ''
  const { isMoneyBrainOpen } = useMoneyBrain()
  const blocked = useSyncExternalStore(subscribeInterruptions, interrupted, () => true)
  const qc = useQueryClient()
  const userId = user?.id
  const appRoute = ['/expense', '/insights', '/investments', '/wrapped', '/account'].some((path) => pathname === path || pathname.startsWith(`${path}/`))
  const eligible = Boolean(userId && appRoute && !['/account/trial-notice', '/account/changelog', '/account/guided-tour'].some((path) => pathname.startsWith(path)))
  const query = useQuery({
    queryKey: ['web-changelog', userId],
    enabled: eligible,
    queryFn: async (): Promise<{ release: ChangelogRelease | null }> => {
      const response = await fetch('/api/changelog/latest', { cache: 'no-store' })
      if (!response.ok) throw new Error('Could not load the latest update')
      return response.json()
    },
    staleTime: 60_000,
    retry: false,
  })
  const [active, setActive] = useState<{ userId: string; release: ChangelogRelease } | null>(null)
  const attempted = useRef(new Set<string>())

  useEffect(() => {
    const release = query.data?.release
    if (!eligible || blocked || isMoneyBrainOpen || !userId || !release || active?.userId === userId) return
    const key = `${userId}:${release.id}`
    if (attempted.current.has(key)) return
    attempted.current.add(key)
    // No cancellation after claiming: a route change/modal can temporarily hide
    // the card, but must not consume the claim without ever showing its result.
    void fetch(`/api/changelog/${release.id}/seen`, { method: 'POST' }).then(async (response) => {
      if (!response.ok) throw new Error('Could not record the update')
      const data: { release: ChangelogRelease | null } = await response.json()
      qc.setQueryData(['web-changelog', userId], { release: null })
      if (data.release) setActive({ userId, release: data.release })
    }).catch(() => {
      attempted.current.delete(key)
      // The next query refresh may retry. A failed write never shows a card
      // that would repeat on every reload.
    })
  }, [query.data, eligible, blocked, isMoneyBrainOpen, userId, active, qc])

  const visible = eligible && !blocked && !isMoneyBrainOpen && active?.userId === userId && active
  return <ChangelogPopup key={userId} release={visible ? active.release : null} onDismiss={() => setActive(null)} />
}
