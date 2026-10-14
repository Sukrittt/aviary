'use client'

import Link from 'next/link'
import { useState, type MouseEvent } from 'react'
import { usePathname } from 'next/navigation'
import { AnimatePresence } from 'motion/react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@workos-inc/authkit-nextjs/components'
import { BugIcon, ChatCircleTextIcon, LightbulbIcon } from '@/src/components/icons'
import { Scrim, Sheet } from '@/src/components/MotionSheet'
import { BugReportForm } from '@/src/views/FeedbackPage'
import { IdeaForm } from '@/src/views/IdeasBoardPage'
import { FEEDBACK_BOARD_PATH } from '@/lib/links'
import './FeedbackFab.css'

const APP_PREFIXES = ['/expense', '/insights', '/investments', '/account']
const HIDDEN_ON = [FEEDBACK_BOARD_PATH, '/account/feedback']

const onApp = (path: string) =>
  APP_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`)) && !HIDDEN_ON.includes(path)

type Kind = 'idea' | 'bug'

/**
 * A bottom-right circle on the signed-in app that opens a two-item menu.
 * Each item opens its form in a dialog, so nobody has to leave the page.
 * The menu is a native popover, so outside clicks and Escape close it for free.
 */
export function FeedbackFab() {
  const { user } = useAuth()
  const pathname = usePathname() ?? ''
  const [open, setOpen] = useState<Kind | null>(null)
  if (!user || !onApp(pathname)) return null

  const pick = (kind: Kind) => (e: MouseEvent<HTMLElement>) => {
    e.currentTarget.closest<HTMLElement>('[popover]')?.hidePopover?.()
    setOpen(kind)
  }

  return (
    <>
      <button type="button" className="feedback-fab" popoverTarget="feedback-fab-menu" aria-label="Send feedback">
        <ChatCircleTextIcon weight="fill" aria-hidden />
      </button>
      <div id="feedback-fab-menu" popover="auto" className="feedback-fab-menu">
        <button type="button" onClick={pick('idea')}>
          <LightbulbIcon weight="duotone" aria-hidden />
          Share an idea
        </button>
        <button type="button" onClick={pick('bug')}>
          <BugIcon weight="duotone" aria-hidden />
          Report a bug
        </button>
      </div>
      <AnimatePresence>{open && <FeedbackDialog kind={open} onClose={() => setOpen(null)} />}</AnimatePresence>
    </>
  )
}

function FeedbackDialog({ kind, onClose }: { kind: Kind; onClose: () => void }) {
  const queryClient = useQueryClient()
  const title = kind === 'idea' ? 'Share an idea' : 'Report a bug'
  return (
    <Scrim className="erd-modal-overlay" onClick={onClose}>
      <Sheet className="erd-modal-card feedback-dialog" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}>
        <h3 className="archive-confirm-title">{title}</h3>
        {kind === 'idea' ? (
          <>
            <p className="account-row-meta">Others can vote on it. <Link href={FEEDBACK_BOARD_PATH} onClick={onClose}>See the board</Link></p>
            <IdeaForm dialog onPosted={() => queryClient.invalidateQueries({ queryKey: ['ideas'] })} onDone={onClose} />
          </>
        ) : (
          <BugReportForm dialog onDone={onClose} />
        )}
      </Sheet>
    </Scrim>
  )
}
