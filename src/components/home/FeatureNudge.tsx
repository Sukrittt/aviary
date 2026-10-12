'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { useOptionalMoneyBrain } from '@/components/moneyBrainContext'
import { loadRecurringSuggestions } from '@/src/api/recurringSuggestions'
import { useDismissedRolloverBanner } from '@/src/hooks/useDismissedRolloverBanner'
import { useRecentExpenses } from '@/src/hooks/useExpenses'
import { useHiddenFeatures, useUpdateUser } from '@/src/hooks/useUser'
import { FEATURE_NUDGES, pickNudge } from '@/src/lib/featureNudge'

/**
 * At most one offer to turn on a hidden extra, once the data says it'd help.
 * Each is dismissed for good in this browser. Twin of Mobile's useFeatureNudge.
 */
export function FeatureNudge() {
  const router = useRouter()
  const brain = useOptionalMoneyBrain()
  const hidden = useHiddenFeatures()
  const updateUser = useUpdateUser()
  const expenses = useRecentExpenses().data
  const [failed, setFailed] = useState(false)
  // Same keys as Mobile's, under this browser's own storage.
  const [subscriptions, setSubscriptions] = useDismissedRolloverBanner('nudge-subscriptions')
  const [insights, setInsights] = useDismissedRolloverBanner('nudge-insights')
  const [askAviary, setAskAviary] = useDismissedRolloverBanner('nudge-askAviary')
  const [billScan, setBillScan] = useDismissedRolloverBanner('nudge-billScan')

  const wantSubs = hidden.includes('subscriptions') && subscriptions === false
  const suggestions = useQuery({
    queryKey: ['recurring-suggestions', 6],
    queryFn: () => loadRecurringSuggestions(6),
    enabled: wantSubs,
    staleTime: 30_000,
    retry: false,
  })

  if (!expenses) return null
  const feature = pickNudge({
    hidden,
    expenses,
    subscriptionSpotted: wantSubs && suggestions.isLoading ? null : !!suggestions.data?.suggestions.some((s) => s.kind === 'subscription'),
    dismissed: { subscriptions, insights, askAviary, billScan },
  })
  if (!feature) return null

  const dismiss = { subscriptions: setSubscriptions, insights: setInsights, askAviary: setAskAviary, billScan: setBillScan }[feature]

  function turnOn() {
    setFailed(false)
    updateUser.mutate({ hiddenFeatures: hidden.filter((k) => k !== feature) }, { onError: () => setFailed(true) })
    if (feature === 'insights') router.push('/insights')
    else if (feature === 'subscriptions') router.push('/account/subscriptions')
    else if (feature === 'askAviary') brain?.openMoneyBrain()
    // Scan a bill just reappears in the sidebar.
  }

  return (
    <article className="erd-card home-leftover-notice">
      <p role={failed ? 'alert' : undefined}>{failed ? "Couldn't turn that on. Check your connection and try again." : FEATURE_NUDGES[feature]}</p>
      <button type="button" onClick={turnOn}>Turn on</button>
      <button type="button" onClick={() => dismiss(true)}>Not now</button>
    </article>
  )
}
