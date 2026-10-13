'use client'

import { useState } from 'react'
import { CheckIcon, CopyIcon } from '@/src/components/icons'

export function CopyEmailButton({ email }: { email: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(email)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard blocked: the mailto link still works.
    }
  }

  return (
    <button type="button" className="lp-contact-copy" onClick={copy} aria-label={copied ? 'Email copied' : 'Copy email'}>
      {copied ? <CheckIcon size={18} weight="bold" /> : <CopyIcon size={18} />}
      <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
    </button>
  )
}
