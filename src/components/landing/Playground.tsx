'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Pause, Play } from 'lucide-react'

import { PHONE, PhoneScreenContext, T } from './mobile/kit'
import { FloatingNav } from './mobile/nav'
import { EMPTY_SUBMIT, ExpenseAddedScreen, LogExpenseScreen, type LoggedExpense, type SubmitState } from './mobile/LogExpense'
import { CATEGORIES, GROUPS, type DemoCategory } from './mobile/demo'
import { useOnScreen } from './useOnScreen'

/**
 * The app's own log-expense screens, playing themselves: a thumb taps the
 * field, types what it was, the category pill picks, the keypad enters the
 * amount, and + logs it. The script drives the real twin components through
 * DOM events, so what plays is the actual screen, not a recording.
 */

type Tap = { x: number; y: number; n: number }
const ITEM = 'Coffee with Sam'
const AMOUNT = ['1', '8', '0']

const sleep = (ms: number, alive: () => boolean) =>
  new Promise<void>((res, rej) => setTimeout(() => (alive() ? res() : rej(new Error('stopped'))), ms))

export function Playground() {
  const reduced = useReducedMotion()
  const [paused, setPaused] = useState(false)
  const { ref: sectionRef, visible } = useOnScreen<HTMLElement>(0.35)
  const [run, setRun] = useState(0)
  const [screen, setScreen] = useState<'log' | 'added'>('log')
  const [categories, setCategories] = useState<DemoCategory[]>(CATEGORIES)
  const [added, setAdded] = useState<{ expense: LoggedExpense; before: DemoCategory | undefined } | null>(null)
  const [submit, setSubmit] = useState<SubmitState>(EMPTY_SUBMIT)
  const [tap, setTap] = useState<Tap | null>(null)
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const submitRef = useRef(submit)
  useEffect(() => { submitRef.current = submit }, [submit])

  const onAdded = useCallback((expense: LoggedExpense) => {
    setAdded({ expense, before: categories.find((c) => c.name === expense.category) })
    setCategories((cats) => cats.map((c) => (c.name === expense.category ? { ...c, spent: c.spent + expense.amount } : c)))
    setScreen('added')
  }, [categories])

  const playing = visible && !paused && !reduced

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
    const typeInto = async (input: HTMLInputElement, text: string) => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      for (let i = 1; i <= text.length; i++) {
        set.call(input, text.slice(0, i))
        input.dispatchEvent(new Event('input', { bubbles: true }))
        await sleep(70, isAlive)
      }
    }
    ;(async () => {
      try {
        await sleep(900, isAlive)
        const input = find('input.m-input-accent') as HTMLInputElement | null
        await touch(input)
        if (input) await typeInto(input, ITEM)
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
        setTap(null)
        setScreen('log')
        setAdded(null)
        setCategories(CATEGORIES)
        setRun((r) => r + 1)
      } catch { /* stopped mid-script: left where it was, picks up on the next run */ }
    })()
    return () => { alive = false }
  }, [playing, run, host])

  // Paused or scrolled away mid-take: the next take starts over from a clean screen.
  const [wasPlaying, setWasPlaying] = useState(playing)
  if (wasPlaying !== playing) {
    setWasPlaying(playing)
    if (!playing) {
      setTap(null)
      setScreen('log')
      setAdded(null)
      setCategories(CATEGORIES)
      setRun((r) => r + 1)
    }
  }

  return (
    <section id="play" className="lp-section lp-center" aria-labelledby="play-title" ref={sectionRef}>
      <h2 id="play-title" className="lp-h2">Tap, type, logged.</h2>
      <p className="lp-lede">The app’s own log screen, playing itself. Say what it was, the category picks itself, tap the amount, done.</p>
      <div className="lp-play-panel">
        <div className="lp-play-grid">
          <div className="lp-phone-wrap">
            <div className="lp-phone" inert>
              <div ref={setHost} className="lp-phone-screen" style={{ width: PHONE.width, height: PHONE.height, background: T.bg, color: T.text }}>
                <div className="lp-island" />
                <PhoneScreenContext.Provider value={host}>
                  <AnimatePresence initial={false}>
                    <motion.div key={screen === 'log' ? `log:${run}` : 'added'} style={{ position: 'absolute', inset: 0 }}
                      initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.25 } }} exit={{ opacity: 0, transition: { duration: 0.25 } }}>
                      {screen === 'log'
                        ? <LogExpenseScreen categories={categories} groups={GROUPS} publish={setSubmit} onAdded={onAdded} />
                        : added && <ExpenseAddedScreen expense={added.expense} before={added.before} onUndo={() => {}} onDone={() => {}} muted />}
                    </motion.div>
                  </AnimatePresence>
                  {screen === 'log' && <div style={{ position: 'absolute', inset: 0, zIndex: 20, pointerEvents: 'none' }}>
                    <FloatingNav active={null} addActive addSaving={submit.saving} addSuccess={submit.success}
                      addInvalid={!submit.canSubmit} addDisabled={submit.saving || submit.success} onSelect={() => false} onAdd={() => {}} />
                  </div>}
                  {tap && <span key={tap.n} className="lp-tap" style={{ left: tap.x, top: tap.y }} />}
                </PhoneScreenContext.Provider>
              </div>
            </div>
            {!reduced && <button type="button" className="lp-stage-pause lp-play-pause" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Play the demo' : 'Pause the demo'}>
              {paused ? <Play size={14} /> : <Pause size={14} />}
            </button>}
          </div>

          <div className="lp-play-copy">
            <h3 className="lp-h3">Tap a number. That’s the whole feature.</h3>
            <p className="lp-body">The keypad is the first thing your thumb finds. Say what it was and the category picks itself. Logged before the payment screen has closed.</p>
            <ul className="lp-points">
              <Point title="Logged in seconds" body="Amount, a word or two, done. No forms to fill." />
              <Point title="It picks the envelope" body="Type “coffee” or “uber” and watch the pill land." />
              <Point title="Works with no signal" body="Logs wait on your phone and sync when you’re back." />
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

function Point({ title, body }: { title: string; body: string }): ReactNode {
  return <li className="lp-point"><span className="lp-point-title">{title}</span><span className="lp-point-body">{body}</span></li>
}
