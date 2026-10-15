'use client'

import { useEffect, useState } from 'react'
import { WarningIcon, XIcon } from '@/src/components/icons'

const DISMISSED_KEY = 'aviary.maintenanceDismissed'

/**
 * Site-wide notice driven by /admin/system: a floating pill at the top centre, above the page
 * rather than pushing it down. Fetched once per page load; silent on any failure. Dismissing hides
 * that message for the rest of the browser session, and a different message shows again.
 */
export function MaintenanceBanner() {
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/system/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((status) => {
        const next = status?.maintenance?.on ? status.maintenance.message : null
        if (next && sessionStorage.getItem(DISMISSED_KEY) !== next) setMessage(next)
      })
      .catch(() => {})
  }, [])

  if (!message) return null
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        width: 'max-content',
        maxWidth: 'calc(100vw - 24px)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 8px 8px 14px',
        borderRadius: 999,
        border: '1px solid var(--tk-warn)',
        background: 'var(--tk-card-solid)',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
        color: 'var(--tk-text)',
        fontFamily: 'var(--font-body), system-ui, sans-serif',
        fontSize: 14,
        fontWeight: 500,
      }}
    >
      <WarningIcon size={16} color="var(--tk-warn)" aria-hidden style={{ flexShrink: 0 }} />
      <span>{message}</span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          sessionStorage.setItem(DISMISSED_KEY, message)
          setMessage(null)
        }}
        style={{
          display: 'grid',
          placeItems: 'center',
          width: 26,
          height: 26,
          flexShrink: 0,
          borderRadius: 999,
          border: 'none',
          background: 'var(--tk-warn-soft)',
          color: 'var(--tk-text)',
          cursor: 'pointer',
        }}
      >
        <XIcon size={14} aria-hidden />
      </button>
    </div>
  )
}
