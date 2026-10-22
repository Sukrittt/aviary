'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ImportFlow, appName } from '@/src/components/onboarding/ImportFlow'
import { importErrorCopy, pastImportLine } from '@/src/components/onboarding/importCopy'
import { ConfirmDialog } from '@/src/components/ConfirmDialog'
import { useSpaces } from '@/src/hooks/useSpaces'
import { getPastImports, ImportFailure, undoImport, type ImportHistoryItem } from '@/src/api/imports'
import { track } from '@/src/lib/analytics'

export const pastImportsKey = ['import-history'] as const

/**
 * Settings' "Import from another app": the same flow as onboarding. Into a
 * budget that's set up, the server makes it a later import (history from
 * before the first entry only). Past imports sit under the app list, each
 * one undoable.
 */
export function ImportPage() {
  const router = useRouter()
  const { active } = useSpaces()
  return (
    <div className="setup-page settings-import">
      <ImportFlow
        skipAsk
        budgetName={active?.name}
        onFresh={() => router.push('/account')}
        // Home's banner carries the progress from here.
        onDone={() => { window.location.href = '/expense' }}
        onAlreadySetUp={() => router.push('/expense')}
      >
        {/* Undo is the owner's, like the import itself. */}
        {active?.role !== 'member' && <PastImports />}
      </ImportFlow>
    </div>
  )
}

function PastImports() {
  const queryClient = useQueryClient()
  const { data, isError, refetch, isRefetching } = useQuery({ queryKey: pastImportsKey, queryFn: getPastImports })
  const [confirm, setConfirm] = useState<ImportHistoryItem | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // A failed load mustn't look like no imports: that's where Undo lives.
  if (isError) {
    return (
      <div className="import-past import-line import-note">
        <span>We couldn’t load your past imports.</span>
        <button type="button" className="setup-selection-action" disabled={isRefetching} onClick={() => void refetch()}>{isRefetching ? 'Trying…' : 'Try again'}</button>
      </div>
    )
  }
  if (!data?.length) return null

  const undo = async (item: ImportHistoryItem) => {
    setBusy(true)
    setError('')
    try {
      await undoImport(item.importId)
      track('import_undone', { app: item.app, rows: item.total })
      setConfirm(null)
      void queryClient.invalidateQueries()
    } catch (err) {
      setError(importErrorCopy(err instanceof ImportFailure ? err.code : 'network'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="import-past" aria-label="Your imports">
      <h2 className="import-past-title">Your imports</h2>
      {data.map((item) => (
        <div key={item.importId} className="import-line import-note">
          <span>{pastImportLine(appName(item.app), item.committedAt, item.total)}</span>
          {item.status === 'importing' ? (
            <span className="account-row-meta">Still bringing it in…</span>
          ) : (
            <button type="button" className="setup-selection-action" onClick={() => setConfirm(item)}>Undo import</button>
          )}
        </div>
      ))}
      {confirm && (
        <ConfirmDialog
          title="Undo this import?"
          body="Everything it brought in goes to the Archive. Envelopes and accounts it made stay."
          cancelLabel="Keep it"
          busy={busy}
          onCancel={() => { setConfirm(null); setError('') }}
        >
          {error && <p className="setup-error" role="alert">{error}</p>}
          <button type="button" className="account-danger-btn" disabled={busy} aria-busy={busy || undefined} onClick={() => void undo(confirm)}>
            {busy ? <span role="status">Undoing…</span> : 'Undo import'}
          </button>
        </ConfirmDialog>
      )}
    </section>
  )
}
