'use client'

import { useState, type MouseEvent } from 'react'
import { usePathname } from 'next/navigation'
import { AnimatePresence } from 'motion/react'
import { useAuth } from '@workos-inc/authkit-nextjs/components'
import { BugIcon, ChatCircleTextIcon, LightbulbIcon } from '@/src/components/icons'
import { FeedbackDialog, type FeedbackKind } from '@/src/components/FeedbackDialog'
import { FEEDBACK_BOARD_PATH } from '@/lib/links'
import './FeedbackFab.css'

const APP_PREFIXES = ['/expense', '/insights', '/investments', '/account']
const HIDDEN_ON = [FEEDBACK_BOARD_PATH, '/account/feedback']

const onApp = (path: string) =>
  APP_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`)) && !HIDDEN_ON.includes(path)

/**
 * A bottom-right circle on the signed-in app that opens a two-item menu.
 * Each item opens its form in a dialog, so nobody has to leave the page.
 * The menu is a native popover, so outside clicks and Escape close it for free.
 */
export function FeedbackFab() {
  const { user } = useAuth()
  const pathname = usePathname() ?? ''
  // Tied to the page it opened on, so leaving the page drops it instead of reopening it on return.
  const [open, setOpen] = useState<{ kind: FeedbackKind; path: string } | null>(null)
  if (!user || !onApp(pathname)) return null

  const pick = (kind: FeedbackKind) => (e: MouseEvent<HTMLElement>) => {
    e.currentTarget.closest<HTMLElement>('[popover]')?.hidePopover?.()
    setOpen({ kind, path: pathname })
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
      <AnimatePresence>{open?.path === pathname && <FeedbackDialog kind={open.kind} onClose={() => setOpen(null)} />}</AnimatePresence>
    </>
  )
}
