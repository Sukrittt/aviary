'use client'

import { useRouter } from 'next/navigation'
import { motion } from 'motion/react'
import { Sparkles } from 'lucide-react'
import { popIn } from '@/src/components/landing/mobile/kit'
import { useBillingStatus } from '@/src/hooks/useBillingStatus'
import { formatDate } from '@/src/components/billing/copy'

/**
 * Shown once, right after budget setup finishes onboarding, and again from the account page's Plan & billing row before billing is live. Twin of
 * Mobile's app/account/trial-notice.tsx: sets expectations about the trial
 * instead of leaving the new user to find out on day 45.
 */
export default function TrialNoticePage() {
  const router = useRouter()
  const { data } = useBillingStatus()
  const dated = data?.mode === 'trial' && !!data.trialEndsAt

  return (
    <div className="trial-notice">
      <motion.div className="trial-notice-badge" {...popIn(0)}>
        <Sparkles size={24} strokeWidth={2.2} aria-hidden="true" />
      </motion.div>
      <motion.h1 className="trial-notice-title" {...popIn(80)}>You&apos;re on the trial plan</motion.h1>
      <motion.p className="trial-notice-body" {...popIn(80)}>
        {dated
          ? `Everything's free until ${formatDate(data.trialEndsAt)}. No card needed, nothing to cancel.`
          : "Everything's free while you try it out. No card needed, nothing to cancel."}
      </motion.p>
      <motion.div className="trial-notice-card" {...popIn(160)}>
        <strong>What happens when it ends</strong>
        <p>
          We&apos;ll remind you a week before. Then you can subscribe in the Android app. Nothing is charged
          automatically, and you can always export your data for free.
        </p>
      </motion.div>
      <button type="button" className="setup-cta" onClick={() =>
          // Opened from the account page's Plan & billing row, "Got it" goes
          // back there; right after onboarding it hands off to the app.
          new URLSearchParams(window.location.search).get('from') === 'more' ? router.back() : router.replace('/expense')
        }>
        Got it
      </button>
    </div>
  )
}
