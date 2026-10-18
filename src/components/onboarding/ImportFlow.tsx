'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowLeftIcon, ArrowsClockwiseIcon, CardholderIcon, CaretRightIcon, CheckIcon, CircleNotchIcon, FileTextIcon, PlusIcon, SealCheckIcon, SparkleIcon, TagIcon, UploadSimpleIcon, WalletIcon, WarningIcon } from '@/src/components/icons'
import { Scrim, Sheet } from '@/src/components/MotionSheet'
import { CurrencyPicker } from '@/src/components/CurrencyPicker'
import { CurrencyScope, useCurrency } from '@/src/context/CurrencyContext'
import { LoadingCaption } from '@/src/components/LoadingCaption'
import { useCountUp } from '@/src/components/wrapped/WeekRecapVisuals'
import { SuccessButton, useButtonPhase } from '@/src/components/SuccessButton'
import { currencyInfo } from '@/src/lib/currencies'
import { track } from '@/src/lib/analytics'
import { commitImport, ImportFailure, previewImport, recomputeImport, type CommitResult, type ImportReview } from '@/src/api/imports'
import { useImportStatus } from '@/src/components/ImportBanner'
import { commitSteps, countsLine, directionCopy, fileSize, historyDone, importErrorCopy, ordinal, precheckFile, shortDate, skippedCopy } from './importCopy'

/**
 * "How do you want to start?": the first onboarding step, and the import
 * that follows it. The review is the only screen with work on it; nothing
 * is written until its button is pressed.
 */

const MAX_BYTES = 4 * 1024 * 1024
/** lib/accounts.ts's MAX_BANK_ACCOUNTS: the balance check asks about at most five. */
const MAX_BANK_ACCOUNTS = 5

type AppChoice = { id: string; name: string; by?: string; file: string; how: [string, string] }

// how[0] is the path to the export, as a breadcrumb where the app has one.
const APPS: AppChoice[] = [
  { id: 'moneymanager', name: 'Money Manager', by: 'Realbyte', file: 'xlsx', how: ['More › Backup › Export to Excel file.', 'Send the file to yourself and upload it here.'] },
  { id: 'monefy', name: 'Monefy', file: 'csv', how: ['Settings › Export to file.', 'Share the csv to yourself and upload it here.'] },
  { id: 'wallet', name: 'Wallet', by: 'BudgetBakers', file: 'csv', how: ['On the web, Records › Export.', 'Pick csv as the format.'] },
  { id: 'spendee', name: 'Spendee', file: 'csv', how: ['Wallet settings › Export to CSV.', 'It lands in your email.'] },
  { id: 'ynab', name: 'YNAB', file: 'zip', how: ['On the web, plan menu › Export plan.', 'Upload the zip as it is. No need to unzip it.'] },
  { id: 'goodbudget', name: 'Goodbudget', file: 'csv', how: ['On the website, Account › Export data.', 'Upload the csv of your transactions.'] },
  { id: 'axio', name: 'axio', by: 'formerly Walnut', file: 'csv', how: ['Ask axio for your data from its settings.', 'Use the CSV from the email, not the PDF.'] },
]
// The catch-all sits under the list as a text link, not as a ninth "app".
const OTHER: AppChoice = { id: 'other', name: 'Another app or a spreadsheet', file: 'csv or xlsx', how: ['Any file with a date, an amount and a description works.', 'One row per transaction.'] }

const ACCOUNT_TYPES = [
  { value: 'bank', label: 'Bank' },
  { value: 'cash', label: 'Cash' },
  { value: 'credit_card', label: 'Credit card' },
] as const

const READING = ['Reading your file…', 'Sorting your categories…', 'Looking for your payday…', 'Adding up a typical month…']

/** The app a file came from, by the id the server detected. Null for a spreadsheet or an app without a preset. */
export function appName(id: string): string | null {
  return APPS.find((a) => a.id === id)?.name ?? null
}

// Each step rises in as the last one goes: quick enough that it never feels like waiting.
const EASE = [0.22, 1, 0.36, 1] as const
function useEnter(delay = 0) {
  const reduce = useReducedMotion()
  return {
    initial: reduce ? false : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.32, ease: EASE, delay },
  } as const
}

type Stage = 'ask' | 'pick' | 'upload' | 'review'

export interface ImportDone {
  result: CommitResult
  currency: string
  /** The app it came from ("Money Manager"), or null for a spreadsheet. */
  app: string | null
}

export function ImportFlow({ onFresh, onDone }: { onFresh: () => void; onDone: (done: ImportDone) => void }) {
  const [stage, setStage] = useState<Stage>('ask')
  const [app, setApp] = useState<AppChoice | null>(null)
  const [review, setReview] = useState<ImportReview | null>(null)
  const dots: Stage[] = ['ask', 'pick', 'upload', 'review']
  const reduce = useReducedMotion()
  const enter = useEnter()

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
        // Two equal ways in: starting fresh is as good a start as switching, so
        // neither is the big button with the other as a small link under it.
        <motion.div key="ask" className="import-ask" {...enter}>
          <h1 className="setup-title">How do you want to start?</h1>
          <p className="setup-blurb">Both get you a budget in a few minutes.</p>
          <div className="import-choices">
            {[
              { Icon: SparkleIcon, title: 'Start fresh', detail: 'Set up your budget in about a minute. We’ll guide you.', onClick: onFresh },
              { Icon: ArrowsClockwiseIcon, title: 'Bring my budget over', detail: 'From YNAB, Money Manager, Wallet and more.', onClick: () => setStage('pick') },
            ].map(({ Icon, title, detail, onClick }, i) => (
              <motion.button
                key={title}
                type="button"
                className="import-choice"
                onClick={onClick}
                initial={reduce ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: EASE, delay: 0.08 + i * 0.06 }}
                whileTap={reduce ? undefined : { scale: 0.98 }}
              >
                <span className="import-choice-icon"><Icon size={20} weight="bold" aria-hidden="true" /></span>
                <span className="import-choice-text">
                  <span className="import-choice-title">{title}</span>
                  <span className="import-choice-detail">{detail}</span>
                </span>
                <CaretRightIcon size={14} aria-hidden="true" className="import-app-caret" />
              </motion.button>
            ))}
          </div>
        </motion.div>
      )}

      {stage === 'pick' && (
        <motion.div key="pick" className="import-pick" {...enter}>
          <h1 className="setup-title">Where are you coming from?</h1>
          <p className="setup-blurb">Pick your app and we’ll tell you how to export from it.</p>
          <div className="setup-body">
            <div className="import-apps">
              {APPS.map((a, i) => (
                <motion.button
                  key={a.id}
                  type="button"
                  className="import-app"
                  onClick={() => pick(a)}
                  initial={reduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, ease: EASE, delay: 0.06 + i * 0.035 }}
                  whileTap={reduce ? undefined : { scale: 0.98 }}
                >
                  <span className="import-app-name">{a.name}</span>
                  {a.by && <span className="import-app-by">{a.by}</span>}
                  <CaretRightIcon size={14} aria-hidden="true" className="import-app-caret" />
                </motion.button>
              ))}
            </div>
            <button type="button" className="setup-pick-own" onClick={() => pick(OTHER)}>Using something else? Upload any csv or xlsx</button>
          </div>
        </motion.div>
      )}

      {stage === 'upload' && app && (
        <Upload
          key="upload"
          app={app}
          onPreview={(r) => {
            setReview(r)
            setStage('review')
          }}
        />
      )}

      {stage === 'review' && review && (
        <CurrencyScope code={review.currency}>
          <Review key="review" review={review} picked={app} onReview={setReview} onDone={onDone} />
        </CurrencyScope>
      )}
    </>
  )
}

function Upload({ app, onPreview }: { app: AppChoice; onPreview: (review: ImportReview) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Bumped per failure so the drop zone shakes again on a second bad file.
  const [failures, setFailures] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState<{ name: string; size: number } | null>(null)
  const reduce = useReducedMotion()
  const enter = useEnter()

  const fail = (code: string, stage: 'precheck' | 'preview') => {
    setError(importErrorCopy(code))
    setFailures((n) => n + 1)
    track('import_failed', { stage, reason: code })
  }

  const read = async (picked: File | undefined) => {
    if (!picked || busy) return
    setError('')
    // An empty file, a PDF, a photo or an old .xls: say so now, not after an upload.
    const bad = precheckFile(picked, MAX_BYTES)
    if (bad) {
      setFile(null)
      fail(bad, bad === 'too_big' ? 'preview' : 'precheck')
      return
    }
    setFile({ name: picked.name, size: picked.size })
    setBusy(true)
    try {
      const review = await previewImport(picked)
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
      setFile(null)
      fail(err instanceof ImportFailure ? err.code : 'network', 'preview')
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.div className="import-upload" {...enter}>
      <h1 className="setup-title">{app.id === 'other' ? 'Drop your file here' : `Drop your ${app.name} export`}</h1>
      <p className="setup-blurb">{app.how[0]} {app.how[1]}</p>
      <div className="setup-body">
        <motion.label
          key={failures}
          className={`import-drop${dragging ? ' is-dragging' : ''}${busy ? ' is-busy' : ''}${error ? ' is-error' : ''}`}
          animate={failures && !reduce ? { x: [0, -10, 9, -6, 4, 0] } : undefined}
          transition={{ duration: 0.42, ease: 'easeOut' }}
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
            accept=".csv,.tsv,.txt,.xlsx,.xls,.zip"
            aria-label="Choose your export file"
            disabled={busy}
            onChange={(e) => {
              void read(e.target.files?.[0])
              // The same file again after a fix still counts as a change.
              e.target.value = ''
            }}
          />
          {busy && file ? (
            <>
              <span className="import-drop-file">
                <FileTextIcon size={16} aria-hidden="true" />
                <span className="import-drop-file-name">{file.name}</span>
                <span className="import-drop-hint">{fileSize(file.size)}</span>
              </span>
              <LoadingCaption phrases={READING} ordered placement="inline" align="center" />
              <span className="import-drop-scan" aria-hidden="true" />
            </>
          ) : (
            <>
              <span className="import-drop-icon" aria-hidden="true">
                {error ? <WarningIcon size={22} /> : <UploadSimpleIcon size={22} />}
              </span>
              <span className="import-drop-title">{dragging ? 'Let go to bring it in' : error ? 'Try another file' : 'Choose a file, or drop it here'}</span>
              <span className="import-drop-hint">{app.file} · up to 4 MB</span>
            </>
          )}
        </motion.label>
      </div>
      <AnimatePresence>
        {error && (
          <motion.p
            key={error}
            className="setup-error"
            role="alert"
            initial={reduce ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

type CategoryEdit = { source: string; name: string; group: string; monthly: number }
type AccountEdit = ImportReview['accounts'][number]

function Review({ review, picked, onReview, onDone }: { review: ImportReview; picked: AppChoice | null; onReview: (r: ImportReview) => void; onDone: (done: ImportDone) => void }) {
  // What the server recognised, else what they said it was (axio has no preset of its own).
  const from = appName(review.app) ?? (picked && picked.id !== 'other' ? picked.name : null)
  const { formatMoney } = useCurrency()
  const phase = useButtonPhase()
  const [groups, setGroups] = useState(review.groups)
  const [newGroup, setNewGroup] = useState('')
  const [cats, setCats] = useState<CategoryEdit[]>(review.categories)
  const [accounts, setAccounts] = useState<AccountEdit[]>(review.accounts)
  const [salary, setSalary] = useState(review.salary ? String(review.salary.amount) : '')
  const [day, setDay] = useState(String(review.salary?.day ?? 1))
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
  const saveProgress = useCreep(phase.saving)
  const steps = commitSteps(cats.length, accounts.length, hasSalary)
  const saveStep = steps[Math.min(steps.length - 1, Math.floor((saveProgress / CREEP_MAX) * steps.length))]

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
      phase.succeed(() => onDone({ result, currency: review.currency, app: from }))
    } catch (err) {
      phase.fail()
      const code = err instanceof ImportFailure ? err.code : 'network'
      setError(importErrorCopy(code))
      track('import_failed', { stage: 'commit', reason: code })
    }
  }

  // The screen is a summary first: three rows, a few transactions as proof,
  // one button. Each row opens its editor in a dialog, as does the currency.
  const [sheet, setSheet] = useState<'envelopes' | 'accounts' | 'income' | 'currency' | null>(null)
  const close = () => setSheet(null)
  // The peak of the flow: their own numbers, counted up as each row lands.
  const reduce = useReducedMotion()
  const enter = useEnter()
  const catCount = useCountUp(cats.length, 700, 250)
  const accountCount = useCountUp(accounts.length, 700, 330)
  const incomeShown = useCountUp(hasSalary ? Math.round(salaryAmount) : 0, 900, 410)
  const summary = [
    { key: 'envelopes' as const, icon: TagIcon, label: 'Envelopes', value: String(catCount) },
    ...(accounts.length > 0 ? [{ key: 'accounts' as const, icon: WalletIcon, label: 'Accounts', value: String(accountCount) }] : []),
    { key: 'income' as const, icon: CardholderIcon, label: 'Monthly income', value: hasSalary ? formatMoney(incomeShown === Math.round(salaryAmount) ? salaryAmount : incomeShown) : 'Add it later' },
  ]
  const rise = (i: number) => ({
    initial: reduce ? false : { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.34, ease: EASE, delay: 0.18 + i * 0.08 },
  } as const)
  const budgetLine = !hasSalary
    ? 'Each envelope starts at what you usually spend on it in a month. Change any of them later.'
    : budgetTotal <= salaryAmount
      ? `Your envelopes add up to ${formatMoney(budgetTotal)} a month. That fits inside your ${formatMoney(salaryAmount)} income.`
      : `Your envelopes add up to ${formatMoney(budgetTotal)} a month, ${formatMoney(budgetTotal - salaryAmount)} more than your ${formatMoney(salaryAmount)} income.`

  return (
    <motion.div className="import-review-shell" {...enter}>
      <motion.p
        className="import-found"
        initial={reduce ? false : { opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 420, damping: 22, delay: 0.05 }}
      >
        <SealCheckIcon size={15} weight="fill" aria-hidden="true" />
        {from ? `${from} export` : review.filename}
      </motion.p>
      <h1 className="setup-title">Here’s what we found</h1>
      <p className="setup-blurb">{countsLine(review.counts)}</p>
      <div className="setup-body import-review" aria-busy={recomputing}>
        <div className="setup-done-list import-summary">
          {summary.map((s, i) => (
            <motion.button
              key={s.key}
              type="button"
              className="setup-done-row import-summary-row"
              onClick={() => setSheet(s.key)}
              disabled={busy}
              aria-label={`${s.label} ${s.key === 'envelopes' ? cats.length : s.key === 'accounts' ? accounts.length : hasSalary ? formatMoney(salaryAmount) : 'Add it later'}`}
              {...rise(i)}
              whileTap={reduce ? undefined : { scale: 0.985 }}
            >
              <span className="setup-done-icon"><s.icon size={16} strokeWidth={2.2} aria-hidden="true" /></span>
              <span className="setup-done-label">{s.label}</span>
              <span className="setup-done-value">{s.value}</span>
              <CaretRightIcon size={14} aria-hidden="true" className="import-summary-caret" />
            </motion.button>
          ))}
        </div>

        <motion.section className="import-card" aria-label="Direction" {...rise(summary.length)}>
          <div className="import-line">
            <span>{directionCopy(review)}</span>
            {review.directionSource === 'sign' && (
              <button type="button" className="setup-selection-action" onClick={flip} disabled={busy}>That’s backwards</button>
            )}
          </div>
          <ul className="import-samples">
            {review.samples.map((s, i) => (
              <motion.li
                key={`${s.date}-${s.item}-${s.kind}`}
                initial={reduce ? false : { opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, ease: EASE, delay: 0.5 + i * 0.09 }}
              >
                <span className="import-sample-date">{shortDate(s.date)}</span>
                <span className="import-sample-item">{s.item}</span>
                <span className={`import-sample-amount is-${s.kind}`}>{s.kind === 'expense' ? '−' : '+'}{formatMoney(s.amount)}</span>
              </motion.li>
            ))}
          </ul>
        </motion.section>

        <motion.div className="import-notes" {...rise(summary.length + 1)}>
          <p className="import-note">{budgetLine}</p>
          {skippedCopy(review).map((line) => <p key={line} className="import-note">{line}</p>)}

          <div className="import-line import-note">
            <span>Your money’s in {currencyInfo(review.currency).name} · {review.currency}</span>
            <button type="button" className="setup-selection-action import-change" onClick={() => setSheet('currency')} disabled={busy}>Change</button>
          </div>
        </motion.div>
      </div>

      {tooManyBanks && (
        <p className="setup-error" role="alert">{`You can have up to ${MAX_BANK_ACCOUNTS} bank accounts. Make one of these cash or a credit card.`}</p>
      )}
      {error && <p className="setup-error" role="alert">{error}</p>}

      <SuccessButton
        type="button"
        baseClass="setup-cta"
        className={phase.saving ? 'is-saving' : undefined}
        style={phase.saving ? ({ '--save-progress': saveProgress } as CSSProperties) : undefined}
        saving={phase.saving}
        success={phase.success}
        savingLabel={saveStep}
        successLabel="You’re set up"
        disabled={busy || tooManyBanks}
        aria-busy={phase.saving}
        onClick={commit}
      >
        Looks right, set me up
      </SuccessButton>

      <AnimatePresence>
        {sheet === 'envelopes' && (
          <ReviewDialog title="Your envelopes" onClose={close}>
            <p className="import-note">Each starts at what you usually spend on it in a month.</p>
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
          </ReviewDialog>
        )}

        {sheet === 'accounts' && (
          <ReviewDialog title="Your accounts" onClose={close}>
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
              <p className="setup-error" role="alert">{`You can have up to ${MAX_BANK_ACCOUNTS} bank accounts. Make one of these cash or a credit card.`}</p>
            )}
            {review.droppedAccounts.length > 0 && (
              <p className="import-note">
                {`We kept your ${accounts.length} busiest accounts. Rows from ${review.droppedAccounts.slice(0, 5).join(', ')}${review.droppedAccounts.length > 5 ? ' and the rest' : ''} come in without one.`}
              </p>
            )}
          </ReviewDialog>
        )}

        {sheet === 'income' && (
          <ReviewDialog title="Your income" onClose={close}>
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
          </ReviewDialog>
        )}

        {sheet === 'currency' && (
          <ReviewDialog title="Currency" onClose={close} done={false}>
            <p className="import-note">Amounts stay as they are in your file. This only sets which currency they’re in.</p>
            <CurrencyPicker
              value={review.currency}
              disabled={busy}
              onChange={(code) => {
                close()
                if (code !== review.currency) void recompute({ currency: code })
              }}
            />
          </ReviewDialog>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/** The review's editors, one at a time, in the app's usual modal card. */
function ReviewDialog({ title, onClose, done = true, children }: { title: string; onClose: () => void; done?: boolean; children: React.ReactNode }) {
  return (
    <Scrim className="erd-modal-overlay" onClick={onClose}>
      <Sheet
        className="erd-modal-card import-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
          }
        }}
      >
        <div className="erd-modal-head">
          <h3>{title}</h3>
          <button type="button" className="erd-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="import-dialog-body">{children}</div>
        {done && <button type="button" className="setup-cta import-dialog-done" onClick={onClose}>Done</button>}
      </Sheet>
    </Scrim>
  )
}

// The commit is one request with no progress of its own, so the bar eases
// toward CREEP_MAX and the success tick takes it the rest of the way.
const CREEP_MAX = 0.92

/** 0 while idle; while `active`, climbs fast then slows, never quite arriving. */
function useCreep(active: boolean): number {
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    if (!active) return
    const start = Date.now()
    const id = setInterval(() => setProgress(CREEP_MAX * (1 - Math.exp(-(Date.now() - start) / 5000))), 250)
    return () => {
      clearInterval(id)
      setProgress(0)
    }
  }, [active])
  return progress
}

/** Eases from the number it last showed to `target`, so a count that jumps by a chunk still reads as counting. */
function useTween(target: number, ms = 700): number {
  const reduce = useReducedMotion()
  const [shown, setShown] = useState(reduce ? target : 0)
  const from = useRef(shown)
  useEffect(() => {
    if (reduce) return
    const a = from.current
    let frame = 0
    let start = 0
    const tick = (now: number) => {
      if (!start) start = now
      const t = Math.min(1, (now - start) / ms)
      from.current = Math.round(a + (target - a) * (1 - Math.pow(1 - t, 3)))
      setShown(from.current)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, ms, reduce])
  return reduce ? target : shown
}

/**
 * The done screen's live line, and the end of the import: the history
 * counting in row by row, then a check once every spend and payday is
 * booked. `total` stands in until the first status arrives.
 */
export function ImportHistory({ total: committed }: { total: number }) {
  const status = useImportStatus(1_500)
  const reduce = useReducedMotion()
  const live = status && status.status !== 'none' ? status : null
  const state = live?.status ?? 'importing'
  const total = live?.total || committed
  const count = useTween(state === 'done' ? total : live?.done ?? 0)
  const progress = state === 'done' ? 1 : total ? count / total : 0
  return (
    <motion.div
      className={`import-history is-${state}`}
      role="status"
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE, delay: 0.25 }}
    >
      <span className="import-history-icon" aria-hidden="true">
        <AnimatePresence mode="wait" initial={false}>
          {state === 'done' ? (
            <motion.span key="done" initial={reduce ? false : { scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 18 }}>
              <CheckIcon size={16} weight="bold" />
            </motion.span>
          ) : state === 'failed' ? (
            <motion.span key="failed" initial={reduce ? false : { scale: 0 }} animate={{ scale: 1 }}>
              <WarningIcon size={16} />
            </motion.span>
          ) : (
            <motion.span key="busy" className="import-history-spin" exit={{ scale: 0 }}>
              <CircleNotchIcon size={16} />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      <span className="import-history-text">
        <strong>
          {state === 'done' ? historyDone(total, live?.failed ?? 0) : state === 'failed' ? 'Some of your history didn’t make it in' : 'Bringing in your history'}
        </strong>
        <span>
          {state === 'done'
            ? 'Every one is filed under its envelope, month by month.'
            : state === 'failed'
              ? 'You can try again from Home.'
              : `${count ? `${count.toLocaleString('en-US')} of ${total.toLocaleString('en-US')}` : 'Starting with your oldest month'} · Close the app if you like, we’ll let you know.`}
        </span>
      </span>
      <span className="import-history-bar" aria-hidden="true" style={{ '--import-progress': progress } as CSSProperties} />
    </motion.div>
  )
}
