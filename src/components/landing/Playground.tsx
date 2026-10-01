'use client'

import { useCurrency } from '@/src/context/CurrencyContext'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, type TargetAndTransition, type Transition } from 'motion/react'
import { Filter, ChartPie, Sparkles, Target, WifiOff, Zap, type LucideIcon } from 'lucide-react'

import { PHONE, PhoneScreenContext, T, ease } from './mobile/kit'
import { FloatingNav, type NavRoute } from './mobile/nav'
import { EMPTY_SUBMIT, ExpenseAddedScreen, LogExpenseScreen, type LoggedExpense, type SubmitState } from './mobile/LogExpense'
import { HomeScreen } from './mobile/Home'
import { InsightsScreen } from './mobile/Insights'
import { CATEGORIES, DAYS_LEFT, GROUPS, toEnvelope, type DemoCategory } from './mobile/demo'

type Screen = 'home' | 'log' | 'added' | 'insights'
type Tab = 'log' | 'envelopes' | 'insights'

const TAB_OF: Record<Screen, Tab> = { home: 'envelopes', log: 'log', added: 'log', insights: 'insights' }
const TABS: { tab: Tab; label: string }[] = [
  { tab: 'log', label: 'Log expense' },
  { tab: 'envelopes', label: 'Envelopes' },
  { tab: 'insights', label: 'Where it went' },
]
const NAV_LABEL: Record<NavRoute, string> = { index: 'Home', activity: 'Activity', envelopes: 'Envelopes', more: 'More' }

// Stack order: a screen entering above the current one plays its own entrance
// (log/added fade, insights slides from the right); one leaving from above
// plays it in reverse. Home is a tab, so it always runs AnimatedTabContent's fade.
const Z: Record<Screen, number> = { home: 1, log: 2, added: 3, insights: 4 }
const ENTER: Record<Screen, TargetAndTransition> = {
  home: { opacity: 0, scale: 0.98 },
  log: { opacity: 0 },
  added: { opacity: 0 },
  insights: { x: '100%' },
}
const TRANSITION: Record<Screen, Transition> = {
  home: { duration: 0.18, ease: ease.outEase },
  log: { duration: 0.25, ease: ease.inOutQuad },
  added: { duration: 0.25, ease: ease.inOutQuad },
  insights: { duration: 0.35, ease: [0.2, 0.8, 0.2, 1] },
}

export function Playground() {
  const { formatCurrency } = useCurrency()

  const [nav, setNav] = useState<{ screen: Screen; from: Screen }>({ screen: 'log', from: 'log' })
  const [categories, setCategories] = useState<DemoCategory[]>(CATEGORIES)
  const [submit, setSubmit] = useState<SubmitState>(EMPTY_SUBMIT)
  const [logSession, setLogSession] = useState<{ key: number; prefill: LoggedExpense | null }>({ key: 0, prefill: null })
  const [added, setAdded] = useState<{ expense: LoggedExpense; before: DemoCategory | undefined } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const screen = nav.screen

  const go = useCallback((next: Screen) => setNav((n) => (n.screen === next ? n : { screen: next, from: n.screen })), [])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2400)
    return () => clearTimeout(id)
  }, [toast])

  function openLog(prefill: LoggedExpense | null = null) {
    setLogSession((s) => ({ key: s.key + 1, prefill }))
    go('log')
  }

  function openTab(tab: Tab) {
    if (TAB_OF[screen] === tab && screen !== 'added') return
    if (tab === 'log') openLog()
    else go(tab === 'envelopes' ? 'home' : 'insights')
  }

  const onAdded = useCallback(
    (expense: LoggedExpense) => {
      setAdded({ expense, before: categories.find((c) => c.name === expense.category) })
      setCategories(
        categories.map((c) =>
          c.name === expense.category ? { ...c, spent: c.spent + expense.amount, lastSpentDaysAgo: 0 } : c,
        ),
      )
      go('added')
    },
    [categories, go],
  )

  function undo() {
    if (!added) return
    const { before, expense } = added
    if (before) setCategories((cats) => cats.map((c) => (c.name === before.name ? before : c)))
    openLog(expense)
  }

  const envelopes = categories.map(toEnvelope)
  const totalLeft = envelopes.reduce((s, e) => s + Math.max(0, e.available), 0)
  const navVisible = screen === 'home' || screen === 'log'

  const screens: Record<Screen, () => React.ReactNode> = {
    home: () => <HomeScreen categories={categories} onOpenInsights={() => go('insights')} notice={setToast} />,
    log: () => (
      <LogExpenseScreen
        key={logSession.key}
        categories={categories}
        groups={GROUPS}
        prefill={logSession.prefill}
        publish={setSubmit}
        onAdded={onAdded}
      />
    ),
    added: () =>
      added && (
        <ExpenseAddedScreen expense={added.expense} before={added.before} onUndo={undo} onDone={() => go('home')} />
      ),
    insights: () => <InsightsScreen categories={categories} onBack={() => go('home')} notice={setToast} />,
  }

  const tab = TAB_OF[screen]

  return (
    <section id="play" className="lp-section">
      <div className="lp-play-head">
        <div>
          <h2 className="lp-h2">This is the real thing. Poke it.</h2>
          <p className="lp-sub" style={{ maxWidth: 520 }}>
            Not a video, not a GIF. The app’s own screens, running right here on the page.
          </p>
        </div>
        <div className="lp-pill-group" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.tab}
              type="button"
              role="tab"
              aria-selected={tab === t.tab}
              className={`lp-tab${tab === t.tab ? ' is-on' : ''}`}
              onClick={() => openTab(t.tab)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="lp-play-panel">
        <div className="lp-play-grid">
          <div className="lp-phone-wrap">
            <PhoneFrame>
              <AnimatePresence initial={false} custom={screen}>
                <motion.div
                  key={screen === 'log' ? `log:${logSession.key}` : screen}
                  style={{ position: 'absolute', inset: 0, zIndex: Z[screen] }}
                  initial={screen === 'home' || Z[screen] > Z[nav.from] ? ENTER[screen] : false}
                  animate={{ opacity: 1, scale: 1, x: 0, transition: TRANSITION[screen] }}
                  exit="exit"
                  variants={{
                    exit: (next: Screen) =>
                      Z[screen] > Z[next]
                        ? { ...ENTER[screen], transition: TRANSITION[screen] }
                        : { opacity: 1, transition: { duration: 0.35 } },
                  }}
                >
                  {screens[screen]()}
                </motion.div>
              </AnimatePresence>
              <motion.div
                initial={false}
                animate={{ opacity: navVisible ? 1 : 0 }}
                transition={{ duration: 0.16 }}
                style={{ position: 'absolute', inset: 0, zIndex: 20, pointerEvents: 'none' }}
              >
                <div style={{ pointerEvents: navVisible ? 'auto' : 'none' }}>
                  <FloatingNav
                    active={screen === 'home' ? 'index' : null}
                    addActive={screen === 'log'}
                    addSaving={screen === 'log' && submit.saving}
                    addSuccess={screen === 'log' && submit.success}
                    addInvalid={screen === 'log' && !submit.canSubmit}
                    addDisabled={screen === 'log' && (submit.saving || submit.success)}
                    onSelect={(name) => {
                      if (name === 'index') {
                        go('home')
                        return true
                      }
                      setToast(`${NAV_LABEL[name]} lives in the app. Home and + work here.`)
                      return false
                    }}
                    onAdd={() => (screen === 'log' ? submit.submit() : openLog())}
                  />
                </div>
              </motion.div>
            </PhoneFrame>
            <p className="lp-phone-hint">
              {tab === 'log'
                ? 'Tap an amount, say what it was for, then hit +.'
                : tab === 'envelopes'
                  ? 'Tap a group to fold it. Tap a row for its actions.'
                  : 'Tap a slice or a row. Try By group.'}
            </p>
          </div>

          <div className="lp-play-copy">
            {tab === 'log' && (
              <>
                <div className="lp-h3">Tap a number. That’s the whole feature.</div>
                <p className="lp-body">
                  The keypad is the first thing your thumb finds. Amount, category, one-word note. Logged before the payment
                  confirmation screen has closed.
                </p>
                <div className="lp-points">
                  <Point icon={Zap} title="Logged in seconds" body="Amount, note, done. No forms to fill." />
                  <Point icon={Sparkles} title="It guesses the envelope" body={'Type "coffee" or "uber" and watch the pill.'} />
                  <Point icon={WifiOff} title="Works with no signal" body="Logs queue locally and sync when you surface." />
                </div>
              </>
            )}
            {tab === 'envelopes' && (
              <>
                <div className="lp-h3">Your money has an address.</div>
                <p className="lp-body">
                  Group them how your life actually works. House, Lifestyle, whatever. Expand, collapse, drag to reorder.
                  The bar turns yellow before you’re in trouble, not after.
                </p>
                <div className="lp-card lp-stat">
                  <div className="lp-stat-label">This month</div>
                  <div className="lp-stat-value">{formatCurrency(Math.round(totalLeft))} left</div>
                  <div className="lp-stat-meta">
                    across {envelopes.length} envelopes · {DAYS_LEFT} days to go
                  </div>
                </div>
              </>
            )}
            {tab === 'insights' && (
              <>
                <div className="lp-h3">Where it actually went.</div>
                <p className="lp-body">Tap a slice. Or a row. Same answer, no drilling through four menus.</p>
                <div className="lp-points">
                  <Point icon={ChartPie} title="Category or group" body="Flip the lens and the ring redraws itself." />
                  <Point icon={Target} title="Against the budget" body="Every bar is spend vs what you gave that envelope." />
                  <Point icon={Filter} title="Filter the noise" body="Hide rent and investments to see the spend you control." />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast}
            className="lp-toast"
            initial={{ opacity: 0, y: 16, scale: 0.94, x: '-50%' }}
            animate={{ opacity: 1, y: 0, scale: 1, x: '-50%' }}
            exit={{ opacity: 0, y: 16, scale: 0.94, x: '-50%' }}
            transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

function Point({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="lp-point">
      <Icon className="lp-point-icon" size={18} aria-hidden="true" />
      <div>
        <div className="lp-point-title">{title}</div>
        <div className="lp-point-body">{body}</div>
      </div>
    </div>
  )
}

/** The simulated device: bezel, island, and the screen element sheets portal into. */
function PhoneFrame({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null)
  return (
    <div className="lp-phone">
      <div
        ref={setHost}
        className="lp-phone-screen"
        style={{ width: PHONE.width, height: PHONE.height, background: T.bg, color: T.text }}
      >
        <div className="lp-island" />
        <PhoneScreenContext.Provider value={host}>{children}</PhoneScreenContext.Provider>
      </div>
    </div>
  )
}

const noop = () => {}

/** The hero's floating phone: the same Home screen and nav, display only. */
export function HeroPhone() {
  return (
    <div className="lp-hero-phone" inert>
      <PhoneFrame>
        <HomeScreen categories={CATEGORIES} onOpenInsights={noop} notice={noop} />
        <FloatingNav active="index" onSelect={() => false} onAdd={noop} />
      </PhoneFrame>
    </div>
  )
}
