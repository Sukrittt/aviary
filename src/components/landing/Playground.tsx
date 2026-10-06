'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Pause, Play, RotateCcw } from 'lucide-react'

import { PHONE, PhoneScreenContext, T } from './mobile/kit'
import { FloatingNav } from './mobile/nav'
import { EMPTY_SUBMIT, ExpenseAddedScreen, LogExpenseScreen, type LoggedExpense, type SubmitState } from './mobile/LogExpense'
import { CATEGORIES, GROUPS, type DemoCategory } from './mobile/demo'
import { useOnScreen } from './useOnScreen'

/**
 * The app's own log-expense screens (web twins of Mobile's), live in a phone.
 * Until someone touches it, it plays itself: a thumb taps the field, types what
 * it was, the category pill picks, the keypad enters the amount, and + logs it.
 * One tap hands it over, and from then on the visitor is logging for real
 * against the sample month, chime and buzz included.
 */

type Tap = { x: number; y: number; n: number }
const ITEM = 'Coffee with Sam'
const AMOUNT = ['1', '8', '0']
// Each one is in demo.ts's WORDS, so the pill always has an envelope to land on.
const STARTERS = ['Chai', 'Uber home', 'Groceries', 'Netflix']

const sleep = (ms: number, alive: () => boolean) =>
  new Promise<void>((res, rej) => setTimeout(() => (alive() ? res() : rej(new Error('stopped'))), ms))

/** Types into a React-controlled input the way a keyboard would, one letter at a time. */
async function typeInto(input: HTMLInputElement, text: string, alive: () => boolean) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  for (let i = 1; i <= text.length; i++) {
    set.call(input, text.slice(0, i))
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await sleep(70, alive)
  }
}

export function Playground() {
  const reduced = useReducedMotion()
  const [paused, setPaused] = useState(false)
  const [tookOver, setTookOver] = useState(false)
  const { ref: sectionRef, visible } = useOnScreen<HTMLElement>(0.35)
  const [run, setRun] = useState(0)
  const [screen, setScreen] = useState<'log' | 'added'>('log')
  const [categories, setCategories] = useState<DemoCategory[]>(CATEGORIES)
  const [added, setAdded] = useState<{ expense: LoggedExpense; before: DemoCategory | undefined } | null>(null)
  const [prefill, setPrefill] = useState<LoggedExpense | null>(null)
  const [starter, setStarter] = useState<{ text: string; n: number } | null>(null)
  const [submit, setSubmit] = useState<SubmitState>(EMPTY_SUBMIT)
  const [tap, setTap] = useState<Tap | null>(null)
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const submitRef = useRef(submit)
  useEffect(() => { submitRef.current = submit }, [submit])

  // With reduced motion nothing plays itself, so the phone is the visitor's from the start.
  const mine = tookOver || !!reduced
  const playing = visible && !paused && !mine

  const onAdded = useCallback((expense: LoggedExpense) => {
    setAdded({ expense, before: categories.find((c) => c.name === expense.category) })
    setCategories((cats) => cats.map((c) => (c.name === expense.category ? { ...c, spent: c.spent + expense.amount } : c)))
    setScreen('added')
  }, [categories])

  /** Back to an empty log screen. `keep` holds on to what the visitor has already logged. */
  const fresh = (keep = false) => {
    setTap(null)
    setScreen('log')
    setAdded(null)
    setPrefill(null)
    if (!keep) setCategories(CATEGORIES)
    setRun((r) => r + 1)
  }

  // The self-playing take.
  useEffect(() => {
    if (!playing) return
    let alive = true
    const isAlive = () => alive
    const find = (sel: string) => host?.querySelector<HTMLElement>(sel) ?? null
    const touch = async (el: HTMLElement | null) => {
      if (!el || !host) return
      const a = el.getBoundingClientRect()
      const b = host.getBoundingClientRect()
      // The phone can be CSS-zoomed on small screens; map back to its own pixels.
      const k = host.offsetWidth / b.width
      setTap({ x: (a.left + a.width / 2 - b.left) * k, y: (a.top + a.height / 2 - b.top) * k, n: Date.now() })
      await sleep(260, isAlive)
    }
    ;(async () => {
      try {
        await sleep(900, isAlive)
        const input = find('input.m-input-accent') as HTMLInputElement | null
        await touch(input)
        if (input) await typeInto(input, ITEM, isAlive)
        await sleep(2300, isAlive) // the pill looks it up and lands
        for (const k of AMOUNT) {
          const key = find(`button.m-key[aria-label="${k}"]`)
          await touch(key)
          key?.click()
          await sleep(230, isAlive)
        }
        await sleep(500, isAlive)
        await touch(find('[aria-label="Log expense"]'))
        submitRef.current.submit()
        await sleep(350, isAlive)
        setTap(null)
        await sleep(4850, isAlive) // saving, the tick, then the Added screen
        fresh()
      } catch { /* stopped mid-script: left where it was, picks up on the next run */ }
    })()
    return () => { alive = false }
  }, [playing, run, host])

  // Paused, scrolled away or taken over mid-take: whatever comes next starts from a clean screen.
  const [wasPlaying, setWasPlaying] = useState(playing)
  if (wasPlaying !== playing) {
    setWasPlaying(playing)
    if (!playing) fresh()
  }

  // A starter chip types itself into the visitor's log screen, so the pill still gets its spin.
  useEffect(() => {
    if (!starter || !mine || screen !== 'log') return
    let alive = true
    // A screen that's fading out is still in the DOM for a beat; the live one comes last.
    const input = Array.from(host?.querySelectorAll<HTMLInputElement>('input.m-input-accent') ?? []).at(-1)
    if (input) typeInto(input, starter.text, () => alive).then(() => setStarter(null), () => {})
    return () => { alive = false }
  }, [starter, mine, screen, host])

  const start = (text: string) => {
    if (!tookOver) setTookOver(true)
    if (screen === 'added') fresh(true)
    setStarter((prev) => ({ text, n: (prev?.n ?? 0) + 1 }))
  }

  // The nav's other tabs lead to screens this demo doesn't have; say so instead of doing nothing.
  const [elsewhere, setElsewhere] = useState(0)
  useEffect(() => {
    if (!elsewhere) return
    const id = setTimeout(() => setElsewhere(0), 2600)
    return () => clearTimeout(id)
  }, [elsewhere])

  const hint = !mine
    ? 'It’s playing itself. Tap the phone to take over.'
    : elsewhere
    ? 'This demo only logs. Home, envelopes and the rest are in the app.'
    : screen === 'added'
    ? 'That chime is the one you hear in the app.'
    : 'Your turn. Say what it was, tap the amount, hit +.'

  return (
    <section id="play" className="lp-section lp-play" aria-labelledby="play-title" ref={sectionRef}>
      <div className="lp-play-copy">
        <h2 id="play-title" className="lp-h2">Go on, log one.</h2>
        <p className="lp-lede">That’s the app’s real log screen, not a recording. Say what it was, watch the envelope pick itself, then tap the amount and hit +.</p>
        <div className="lp-starters">
          <span id="play-starters">Stuck? Start with one of these.</span>
          <div role="group" aria-labelledby="play-starters">
            {STARTERS.map((s) => <button key={s} type="button" className="lp-starter" onClick={() => start(s)}>{s}</button>)}
          </div>
        </div>
        <p className="lp-play-note">Sample month. Nothing you log here is saved.</p>
      </div>

      <div className="lp-phone-wrap">
        <div className="lp-phone">
          <div ref={setHost} className="lp-phone-screen" style={{ width: PHONE.width, height: PHONE.height, background: T.bg, color: T.text }}>
            <div className="lp-island" />
            <PhoneScreenContext.Provider value={host}>
              <div inert={!mine} style={{ position: 'absolute', inset: 0 }}>
                <AnimatePresence initial={false}>
                  <motion.div key={screen === 'log' ? `log:${run}` : 'added'} style={{ position: 'absolute', inset: 0 }}
                    initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.25 } }} exit={{ opacity: 0, transition: { duration: 0.25 } }}>
                    {screen === 'log'
                      ? <LogExpenseScreen categories={categories} groups={GROUPS} prefill={prefill} publish={setSubmit} onAdded={onAdded} />
                      : added && <ExpenseAddedScreen expense={added.expense} before={added.before} muted={!mine}
                          onDone={() => fresh(true)}
                          onUndo={() => {
                            const { expense } = added
                            setCategories((cats) => cats.map((c) => (c.name === expense.category ? { ...c, spent: c.spent - expense.amount } : c)))
                            fresh(true)
                            setPrefill(expense)
                          }} />}
                  </motion.div>
                </AnimatePresence>
                {screen === 'log' && <div style={{ position: 'absolute', inset: 0, zIndex: 20, pointerEvents: 'none' }}>
                  <div style={{ pointerEvents: 'auto' }}>
                    <FloatingNav active={null} addActive addSaving={submit.saving} addSuccess={submit.success}
                      addInvalid={!submit.canSubmit} addDisabled={submit.saving || submit.success} onSelect={() => { setElsewhere((n) => n + 1); return false }} onAdd={() => submit.submit()} />
                  </div>
                </div>}
              </div>
              {tap && <span key={tap.n} className="lp-tap" style={{ left: tap.x, top: tap.y }} />}
              {!mine && <button type="button" className="lp-play-take" onClick={() => setTookOver(true)}><span>Try it yourself</span></button>}
            </PhoneScreenContext.Provider>
          </div>
        </div>
        <p className="lp-phone-hint" aria-live="polite">{hint}</p>
        {!reduced && (mine
          ? <button type="button" className="lp-replay" onClick={() => { fresh(); setTookOver(false); setPaused(false) }}><RotateCcw size={15} aria-hidden="true" />Watch the demo instead</button>
          : <button type="button" className="lp-stage-pause lp-play-pause" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Play the demo' : 'Pause the demo'}>
              {paused ? <Play size={14} /> : <Pause size={14} />}
            </button>)}
      </div>
    </section>
  )
}
