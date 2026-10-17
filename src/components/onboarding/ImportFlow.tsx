'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeftIcon, PlusIcon } from '@/src/components/icons'
import { CurrencyPicker } from '@/src/components/CurrencyPicker'
import { CurrencyScope, useCurrency } from '@/src/context/CurrencyContext'
import { LoadingCaption } from '@/src/components/LoadingCaption'
import { SuccessButton, useButtonPhase } from '@/src/components/SuccessButton'
import { currencyInfo } from '@/src/lib/currencies'
import { track } from '@/src/lib/analytics'
import { commitImport, ImportFailure, previewImport, recomputeImport, type CommitResult, type ImportReview } from '@/src/api/imports'
import { countsLine, directionCopy, importErrorCopy, ordinal, skippedCopy } from './importCopy'

/**
 * "Switching apps?": the first onboarding step, and the import
 * that follows it. The review is the only screen with work on it; nothing
 * is written until its button is pressed.
 */

const MAX_BYTES = 4 * 1024 * 1024
/** lib/accounts.ts's MAX_BANK_ACCOUNTS: the balance check asks about at most five. */
const MAX_BANK_ACCOUNTS = 5

type AppChoice = { id: string; name: string; by?: string; how: [string, string] }

const APPS: AppChoice[] = [
  { id: 'moneymanager', name: 'Money Manager', by: 'Realbyte', how: ['Open More, then Backup, then Export to Excel file.', 'Send the file to yourself and upload it here.'] },
  { id: 'monefy', name: 'Monefy', how: ['Open Settings, then Export to file.', 'Share the csv to yourself and upload it here.'] },
  { id: 'wallet', name: 'Wallet', by: 'BudgetBakers', how: ['In Wallet on the web, open Records and export them.', 'Pick csv as the format.'] },
  { id: 'spendee', name: 'Spendee', how: ['Open a wallet’s settings and tap Export to CSV.', 'It lands in your email.'] },
  { id: 'ynab', name: 'YNAB', how: ['On the web, open your plan’s menu and pick Export plan.', 'Upload the zip as it is. No need to unzip it.'] },
  { id: 'goodbudget', name: 'Goodbudget', how: ['On the website, open Account, then Export data.', 'Upload the csv of your transactions.'] },
  { id: 'axio', name: 'axio', by: 'formerly Walnut', how: ['Ask axio for your data from its settings.', 'Use the CSV from the email, not the PDF.'] },
]
// The catch-all sits under the list as a text link, not as a ninth "app".
const OTHER: AppChoice = { id: 'other', name: 'Another app or a spreadsheet', how: ['Any file with a date, an amount and a description works.', 'One row per transaction.'] }

const ACCOUNT_TYPES = [
  { value: 'bank', label: 'Bank' },
  { value: 'cash', label: 'Cash' },
  { value: 'credit_card', label: 'Credit card' },
] as const

const READING = ['Reading your file…', 'Sorting your categories…', 'Looking for your payday…', 'Adding up a typical month…']

type Stage = 'ask' | 'pick' | 'upload' | 'review'

export interface ImportDone {
  result: CommitResult
  currency: string
}

export function ImportFlow({ onFresh, onDone }: { onFresh: () => void; onDone: (done: ImportDone) => void }) {
  const [stage, setStage] = useState<Stage>('ask')
  const [app, setApp] = useState<AppChoice | null>(null)
  const [review, setReview] = useState<ImportReview | null>(null)
  const dots: Stage[] = ['ask', 'pick', 'upload', 'review']

  const back = () => setStage((s) => (s === 'review' ? 'upload' : s === 'upload' ? 'pick' : 'ask'))

  const pick = (a: AppChoice) => {
    setApp(a)
    track('import_started', { app: a.id })
    setStage('upload')
  }

  return (
    <>
      <div className="setup-top">
        <button type="button" className="setup-back" onClick={back} disabled={stage === 'ask'} aria-label="Back">
          <ArrowLeftIcon size={16} aria-hidden="true" />
        </button>
        <div className="setup-dots" role="img" aria-label={`Step ${dots.indexOf(stage) + 1} of ${dots.length}`}>
          {dots.map((d, i) => <span key={d} className={`setup-dot ${i <= dots.indexOf(stage) ? 'is-active' : ''}`} />)}
        </div>
      </div>

      {stage === 'ask' && (
        <div className="import-ask">
          <h1 className="setup-title">Switching apps?</h1>
          <p className="setup-blurb">Don’t start from zero. Export one file from your old app and we’ll rebuild it all here.</p>
          <button type="button" className="setup-cta" onClick={() => setStage('pick')}>Bring it all over</button>
          <button type="button" className="setup-pick-own" onClick={onFresh}>No, start fresh</button>
        </div>
      )}

      {stage === 'pick' && (
        <div className="import-pick">
          <h1 className="setup-title">Where are you coming from?</h1>
          <p className="setup-blurb">Pick your app and we’ll tell you how to export from it.</p>
          <div className="setup-body">
            <div className="import-apps">
              {APPS.map((a) => (
                <button key={a.id} type="button" className="import-app" onClick={() => pick(a)}>
                  <span className="import-app-name">{a.name}</span>
                  {a.by && <span className="import-app-by">{a.by}</span>}
                </button>
              ))}
            </div>
            <button type="button" className="setup-pick-own" onClick={() => pick(OTHER)}>Using something else? Upload any csv or xlsx</button>
          </div>
        </div>
      )}

      {stage === 'upload' && app && (
        <Upload
          app={app}
          onPreview={(r) => {
            setReview(r)
            setStage('review')
          }}
        />
      )}

      {stage === 'review' && review && (
        <CurrencyScope code={review.currency}>
          <Review review={review} onReview={setReview} onDone={onDone} />
        </CurrencyScope>
      )}
    </>
  )
}

function Upload({ app, onPreview }: { app: AppChoice; onPreview: (review: ImportReview) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)

  const read = async (file: File | undefined) => {
    if (!file || busy) return
    setError('')
    if (file.size > MAX_BYTES) {
      setError(importErrorCopy('too_big'))
      track('import_failed', { stage: 'preview', reason: 'too_big' })
      return
    }
    setBusy(true)
    try {
      const review = await previewImport(file)
      track('import_previewed', {
        picked: app.id,
        detected: review.app,
        spends: review.counts.expense,
        paydays: review.counts.income,
        categories: review.categories.length,
        accounts: review.accounts.length,
        ...Object.fromEntries(Object.entries(review.skipped).map(([reason, count]) => [`skipped_${reason}`, count ?? 0])),
      })
      onPreview(review)
    } catch (err) {
      const code = err instanceof ImportFailure ? err.code : 'network'
      setError(importErrorCopy(code))
      track('import_failed', { stage: 'preview', reason: code })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h1 className="setup-title">Drop your export here</h1>
      <p className="setup-blurb">{app.how[0]} {app.how[1]}</p>
      <div className="setup-body">
        <label
          className={`import-drop${dragging ? ' is-dragging' : ''}${busy ? ' is-busy' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            void read(e.dataTransfer.files[0])
          }}
        >
          <input
            type="file"
            className="import-drop-input"
            accept=".csv,.tsv,.txt,.xlsx,.zip"
            aria-label="Choose your export file"
            disabled={busy}
            onChange={(e) => void read(e.target.files?.[0])}
          />
          {busy ? (
            <LoadingCaption phrases={READING} ordered placement="inline" align="center" />
          ) : (
            <>
              <span className="import-drop-title">Choose a file, or drop it here</span>
              <span className="import-drop-hint">csv, xlsx or the YNAB zip · up to 4 MB</span>
            </>
          )}
        </label>
      </div>
      {error && <p className="setup-error" role="alert">{error}</p>}
    </>
  )
}

type CategoryEdit = { source: string; name: string; group: string; monthly: number }
type AccountEdit = ImportReview['accounts'][number]

function Review({ review, onReview, onDone }: { review: ImportReview; onReview: (r: ImportReview) => void; onDone: (done: ImportDone) => void }) {
  const { formatMoney } = useCurrency()
  const phase = useButtonPhase()
  const [groups, setGroups] = useState(review.groups)
  const [newGroup, setNewGroup] = useState('')
  const [cats, setCats] = useState<CategoryEdit[]>(review.categories)
  const [accounts, setAccounts] = useState<AccountEdit[]>(review.accounts)
  const [salary, setSalary] = useState(review.salary ? String(review.salary.amount) : '')
  const [day, setDay] = useState(String(review.salary?.day ?? 1))
  const [currencyOpen, setCurrencyOpen] = useState(false)
  const [recomputing, setRecomputing] = useState(false)
  const [error, setError] = useState('')
  const seen = useRef(`${review.importId}:${review.direction}:${review.currency}`)
  const salaryEdited = useRef(false)

  // A flip or a currency change brings a new review: keep what the user edited, by source.
  useEffect(() => {
    if (seen.current === `${review.importId}:${review.direction}:${review.currency}`) return
    seen.current = `${review.importId}:${review.direction}:${review.currency}`
    setCats((prev) => review.categories.map((c) => {
      const old = prev.find((p) => p.source === c.source)
      return old ? { ...c, name: old.name, group: old.group } : c
    }))
    setAccounts((prev) => review.accounts.map((a) => prev.find((p) => p.source === a.source) ?? a))
    // A flip can find a salary the first read missed, or lose one it found.
    if (!salaryEdited.current) {
      setSalary(review.salary ? String(review.salary.amount) : '')
      setDay(String(review.salary?.day ?? 1))
    }
  }, [review])

  const recompute = async (change: { direction?: string; currency?: string }) => {
    setRecomputing(true)
    setError('')
    try {
      onReview(await recomputeImport(review.importId, change))
    } catch (err) {
      setError(importErrorCopy(err instanceof ImportFailure ? err.code : 'network'))
    } finally {
      setRecomputing(false)
    }
  }

  const flip = () => {
    track('import_direction_flipped', { to: review.direction === 'negative_spend' ? 'positive_spend' : 'negative_spend' })
    void recompute({ direction: review.direction === 'negative_spend' ? 'positive_spend' : 'negative_spend' })
  }

  const addGroup = () => {
    const name = newGroup.trim().slice(0, 60)
    if (!name || groups.some((g) => g.toLowerCase() === name.toLowerCase())) return
    setGroups((g) => [...g, name])
    setNewGroup('')
  }

  const salaryAmount = Math.round(Number(salary) * 100) / 100
  const hasSalary = salaryAmount > 0
  const budgetTotal = cats.reduce((sum, c) => sum + c.monthly, 0)
  const tooManyBanks = accounts.filter((a) => a.type === 'bank').length > MAX_BANK_ACCOUNTS
  const busy = phase.saving || phase.success || recomputing

  const commit = async () => {
    if (busy) return
    phase.start()
    setError('')
    try {
      const result = await commitImport(review.importId, {
        currency: review.currency,
        direction: review.direction,
        groups,
        categories: cats.map((c) => ({ source: c.source, name: c.name.trim() || c.source, group: c.group })),
        accounts: accounts.map((a) => ({ ...a, name: a.name.trim() || a.source })),
        salary: hasSalary ? { amount: salaryAmount, day: Math.min(31, Math.max(1, Math.round(Number(day)) || 1)) } : null,
      })
      track('import_committed', { app: review.app, categories: cats.length, accounts: accounts.length, has_salary: hasSalary, rows: result.total })
      phase.succeed(() => onDone({ result, currency: review.currency }))
    } catch (err) {
      phase.fail()
      const code = err instanceof ImportFailure ? err.code : 'network'
      setError(importErrorCopy(code))
      track('import_failed', { stage: 'commit', reason: code })
    }
  }

  return (
    <>
      <h1 className="setup-title">Here’s what we found</h1>
      <p className="setup-blurb">{countsLine(review.counts)}</p>
      <div className="setup-body import-review" aria-busy={recomputing}>
        {skippedCopy(review).map((line) => <p key={line} className="import-note">{line}</p>)}

        <section className="import-section" aria-label="Direction">
          <div className="import-line">
            <span>{directionCopy(review)}</span>
            {review.directionSource === 'sign' && (
              <button type="button" className="setup-selection-action" onClick={flip} disabled={busy}>That’s backwards</button>
            )}
          </div>
          <ul className="import-samples">
            {review.samples.map((s, i) => (
              <li key={`${s.date}-${i}`}>
                <span>{s.date}</span>
                <span className="import-sample-item">{s.item}</span>
                <span className={`import-sample-amount is-${s.kind}`}>{s.kind === 'expense' ? '−' : '+'}{formatMoney(s.amount)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="import-section" aria-label="Currency">
          <div className="import-line">
            <span>Your money’s in {currencyInfo(review.currency).name} · {review.currency}</span>
            <button type="button" className="setup-selection-action" onClick={() => setCurrencyOpen((o) => !o)} disabled={busy}>
              {currencyOpen ? 'Done' : 'Change'}
            </button>
          </div>
          {currencyOpen && (
            <CurrencyPicker
              value={review.currency}
              disabled={busy}
              onChange={(code) => {
                setCurrencyOpen(false)
                if (code !== review.currency) void recompute({ currency: code })
              }}
            />
          )}
        </section>

        <section className="import-section" aria-label="Envelopes">
          <h2 className="import-heading">Your envelopes</h2>
          <div className="import-rows">
            {cats.map((c, i) => (
              <div key={c.source} className="import-row">
                <input
                  type="text"
                  className="setup-pick-input"
                  aria-label={`Name for ${c.source}`}
                  value={c.name}
                  maxLength={60}
                  onChange={(e) => setCats((all) => all.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                />
                <select
                  className="import-select"
                  aria-label={`Group for ${c.source}`}
                  value={c.group}
                  onChange={(e) => setCats((all) => all.map((x, j) => (j === i ? { ...x, group: e.target.value } : x)))}
                >
                  {groups.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
                <span className="import-row-amount">{formatMoney(c.monthly)}</span>
              </div>
            ))}
          </div>
          <div className="import-row">
            <input
              type="text"
              className="setup-pick-input"
              placeholder="Add a group"
              aria-label="New group name"
              value={newGroup}
              maxLength={60}
              onChange={(e) => setNewGroup(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addGroup()}
            />
            <button type="button" className="setup-add-pill" onClick={addGroup} disabled={!newGroup.trim()}>
              <PlusIcon size={14} aria-hidden="true" /> Add group
            </button>
          </div>
        </section>

        {accounts.length > 0 && (
          <section className="import-section" aria-label="Accounts">
            <h2 className="import-heading">Your accounts</h2>
            <div className="import-rows">
              {accounts.map((a, i) => (
                <div key={a.source} className="import-row">
                  <input
                    type="text"
                    className="setup-pick-input"
                    aria-label={`Name for ${a.source}`}
                    value={a.name}
                    maxLength={30}
                    onChange={(e) => setAccounts((all) => all.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  />
                  <select
                    className="import-select"
                    aria-label={`Type for ${a.source}`}
                    value={a.type}
                    onChange={(e) => setAccounts((all) => all.map((x, j) => (j === i ? { ...x, type: e.target.value as AccountEdit['type'] } : x)))}
                  >
                    {ACCOUNT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              ))}
            </div>
            {tooManyBanks && (
              <p className="import-note" role="alert">{`You can have up to ${MAX_BANK_ACCOUNTS} bank accounts. Make one of these cash or a credit card.`}</p>
            )}
            {review.droppedAccounts.length > 0 && (
              <p className="import-note">
                {`We kept your ${accounts.length} busiest accounts. Rows from ${review.droppedAccounts.slice(0, 5).join(', ')}${review.droppedAccounts.length > 5 ? ' and the rest' : ''} come in without one.`}
              </p>
            )}
          </section>
        )}

        <section className="import-section" aria-label="Income">
          <h2 className="import-heading">Your income</h2>
          <p className="import-note">
            {review.salary
              ? `We think your salary is ${formatMoney(review.salary.amount)} on about the ${ordinal(review.salary.day)}.`
              : 'We didn’t spot a regular payday. Add your monthly income if you like, or leave it for later.'}
          </p>
          <div className="import-row">
            <input
              type="number"
              inputMode="decimal"
              className="txn-entry-input"
              aria-label="Monthly income"
              placeholder="Monthly income"
              min={0}
              value={salary}
              onChange={(e) => {
                salaryEdited.current = true
                setSalary(e.target.value)
              }}
            />
            <label className="import-day">
              <span>Payday</span>
              <input
                type="number"
                className="txn-entry-input"
                aria-label="Payday, day of the month"
                min={1}
                max={31}
                value={day}
                onChange={(e) => {
                  salaryEdited.current = true
                  setDay(e.target.value)
                }}
              />
            </label>
          </div>
        </section>

        <section className="import-section" aria-label="Budget">
          <p className="import-note">We’ll set each envelope to what you spent on it in a typical month. Change any of them later.</p>
          {hasSalary && (
            <p className="import-note">
              {budgetTotal <= salaryAmount
                ? `That’s ${formatMoney(budgetTotal)} a month, inside your ${formatMoney(salaryAmount)}.`
                : `That’s ${formatMoney(budgetTotal)} a month, ${formatMoney(budgetTotal - salaryAmount)} more than comes in.`}
            </p>
          )}
        </section>
      </div>

      {error && <p className="setup-error" role="alert">{error}</p>}

      <SuccessButton
        type="button"
        baseClass="setup-cta"
        saving={phase.saving}
        success={phase.success}
        savingLabel="Setting you up…"
        successLabel="You’re set up"
        disabled={busy || tooManyBanks}
        aria-busy={phase.saving}
        onClick={commit}
      >
        Looks right, set me up
      </SuccessButton>
    </>
  )
}
