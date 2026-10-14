'use client'

import Link from 'next/link'
import type { MouseEvent } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@workos-inc/authkit-nextjs/components'
import { BugIcon, ChatCircleTextIcon, LightbulbIcon } from '@/src/components/icons'
import { FEEDBACK_BOARD_PATH } from '@/lib/links'
import './FeedbackFab.css'

const APP_PREFIXES = ['/expense', '/insights', '/investments', '/account']
const HIDDEN_ON = [FEEDBACK_BOARD_PATH, '/account/feedback']

const onApp = (path: string) =>
  APP_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`)) && !HIDDEN_ON.includes(path)

// A link click navigates but doesn't count as a light dismiss, so close it by hand.
const closeMenu = (e: MouseEvent<HTMLElement>) => e.currentTarget.closest<HTMLElement>('[popover]')?.hidePopover?.()

/**
 * A bottom-right circle on the signed-in app that opens a two-item menu:
 * the ideas board or the bug form. Uses the native popover, so outside
 * clicks and Escape close it for free.
 */
export function FeedbackFab() {
  const { user } = useAuth()
  const pathname = usePathname() ?? ''
  if (!user || !onApp(pathname)) return null

  return (
    <>
      <button type="button" className="feedback-fab" popoverTarget="feedback-fab-menu" aria-label="Send feedback">
        <ChatCircleTextIcon weight="fill" aria-hidden />
      </button>
      <div id="feedback-fab-menu" popover="auto" className="feedback-fab-menu">
        <Link href={FEEDBACK_BOARD_PATH} onClick={closeMenu}>
          <LightbulbIcon weight="duotone" aria-hidden />
          Share an idea
        </Link>
        <Link href="/account/feedback" onClick={closeMenu}>
          <BugIcon weight="duotone" aria-hidden />
          Report a bug
        </Link>
      </div>
    </>
  )
}
