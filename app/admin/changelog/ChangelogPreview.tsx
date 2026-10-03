'use client'

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { RotateCcw } from 'lucide-react'
import { ChangelogPopup } from '@/src/components/ChangelogPopup'
import type { ChangelogRelease } from '@/src/lib/changelog'

const PreviewContext = createContext<((release: ChangelogRelease) => void) | null>(null)

/** Page-local preview only: no API calls or writes to release/account state. */
export function ChangelogPreviewProvider({ children }: { children: ReactNode }) {
  const [preview, setPreview] = useState<{ release: ChangelogRelease | null; replay: number }>({ release: null, replay: 0 })
  const replay = useCallback((release: ChangelogRelease) => {
    setPreview((previous) => ({ release, replay: previous.replay + 1 }))
  }, [])
  return (
    <PreviewContext.Provider value={replay}>
      {children}
      <ChangelogPopup release={preview.release} replay={preview.replay} preview onDismiss={() => setPreview((previous) => ({ ...previous, release: null }))} />
    </PreviewContext.Provider>
  )
}

export function ReplayChangelogPreview({ release }: { release: ChangelogRelease }) {
  const replay = useContext(PreviewContext)
  if (!replay) throw new Error('ReplayChangelogPreview requires ChangelogPreviewProvider')
  return <button type="button" className="adm-btn" aria-label={`Replay preview: ${release.title}`} onClick={() => replay(release)}><RotateCcw size={14} aria-hidden="true" /> Replay preview</button>
}
