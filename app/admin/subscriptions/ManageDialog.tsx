'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { XIcon } from '@/src/components/icons'

/**
 * The per-account controls, in a native `<dialog>`.
 *
 * Which account is open lives in `?user=`, not in client state: the body is
 * server-rendered, so a grant or a re-sync revalidates straight back into the
 * open dialog with fresh data, and the URL is shareable. `showModal()` is what
 * buys Esc, the focus trap, an inert background and the top layer — none of
 * which a div-with-a-backdrop gets for free.
 */
export function ManageDialog({ title, subtitle, badge, closeHref, children }: { title: string; subtitle: string; badge: ReactNode; closeHref: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  const router = useRouter()

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  return (
    <dialog
      ref={ref}
      className="adm-dialog"
      aria-labelledby="adm-dialog-title"
      onClose={() => router.push(closeHref, { scroll: false })}
      // The backdrop is the dialog element's own box, so a click that lands on
      // it (and not on the card inside) is a click outside.
      onClick={(event) => {
        if (event.target === ref.current) ref.current?.close()
      }}
    >
      <div className="adm-dialog-head">
        <div style={{ minWidth: 0 }}>
          <h2 id="adm-dialog-title">{title}</h2>
          <div className="adm-sub adm-dialog-email">{subtitle}</div>
        </div>
        <div className="adm-dialog-head-end">
          {badge}
          <button type="button" className="adm-icon-btn" onClick={() => ref.current?.close()} aria-label="Close">
            <XIcon size={17} />
          </button>
        </div>
      </div>
      <div className="adm-dialog-body">{children}</div>
    </dialog>
  )
}
