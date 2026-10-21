'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence } from 'motion/react'
import { useAuth } from '@workos-inc/authkit-nextjs/components'
import { previewInvite } from '../api/spaces'
import { useSpaces } from '../hooks/useSpaces'
import { BirdMark } from '../components/BirdMark'
import { PLAY_STORE_URL } from '../components/billing/copy'
import { JoinConfirm, inviteBlocked, openBudget, signInToJoin, tryAgainCopy, whoIsIn } from '../components/JoinBudget'
import { BudgetIcon } from '../components/CategoryIcon'

/** `/join/<code>`: what an invite link opens. Works signed out; joining on web signs you in first. */
export function JoinPage({ code }: { code: string }) {
  const { user, loading: authLoading } = useAuth()
  const q = useQuery({ queryKey: ['invite', code], queryFn: () => previewInvite(code), retry: false })
  const { budgets, limit } = useSpaces()
  const [confirming, setConfirming] = useState(false)
  const preview = q.data

  let headline: React.ReactNode
  let body: string | null = null
  if (q.isPending) headline = 'Opening your invite…'
  else if (q.isError || !preview) {
    headline = "Couldn't open this invite"
    body = tryAgainCopy(q.error)
  } else if (inviteBlocked(preview) || preview.status === 'not_found') {
    headline = preview.status === 'not_found' ? "That invite doesn't exist" : 'This invite has expired'
    body = inviteBlocked(preview)
  } else {
    const where = <><BudgetIcon budget={preview.budget} className="join-budget-icon" /> {`${preview.budget.name} budget`}</>
    headline = preview.inviter ? <>{`${preview.inviter} invited you to `}{where}</> : <>{"You're invited to "}{where}</>
    const who = whoIsIn(preview.members, preview.inviter)
    body = `${who ? `${who}. ` : ''}Your own budget stays exactly as it is.`
  }
  const usable = preview && preview.status !== 'not_found' && !inviteBlocked(preview)

  function continueOnWeb() {
    if (!usable) return
    if (!user) return signInToJoin(code)
    if (budgets.some((b) => b.id === preview.budget.id)) return openBudget(preview.budget.id)
    setConfirming(true)
  }

  return (
    <div className="auth-card join-card">
      <div className="auth-logo" aria-hidden="true">
        <BirdMark size={40} />
      </div>
      <h1 className="auth-headline">{headline}</h1>
      {body && <p className="auth-subhead">{body}</p>}
      {usable && (
        <div className="auth-actions">
          <a href={`envelope://join/${code}`} className="auth-btn auth-btn--primary">Open in app</a>
          <a href={PLAY_STORE_URL} className="auth-btn auth-btn--outline" target="_blank" rel="noreferrer">Get it on Google Play</a>
          <button type="button" className="auth-btn auth-btn--outline" onClick={continueOnWeb} disabled={authLoading}>
            Continue on web
          </button>
        </div>
      )}
      <AnimatePresence>
        {confirming && usable && <JoinConfirm code={code} preview={preview} limit={limit || undefined} onCancel={() => setConfirming(false)} />}
      </AnimatePresence>
    </div>
  )
}
