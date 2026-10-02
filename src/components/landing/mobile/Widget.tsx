'use client'

import { BIRD_BODY_PATH } from '../../BirdMark'
import { CATEGORIES, DAYS_LEFT } from './demo'
import { lightTokens as T } from '@/src/theme/tokens'

/**
 * Web twins of Mobile's home-screen widgets (src/widgets/EnvelopeWidget.tsx and
 * EnvelopeBarWidget.tsx), in the light scheme, fed from the landing's sample
 * categories. The bird-in-a-ring is a port of src/widgets/bird.ts at the "ok" mood.
 */

const EYE = { cx: 306, cy: 216, r: 19 }
const fmt = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`

const spendable = CATEGORIES.filter((c) => !c.group.includes('Investments'))
const assigned = spendable.reduce((s, c) => s + c.assigned, 0)
const left = spendable.reduce((s, c) => s + Math.max(0, c.assigned - c.spent), 0)
const LEFT_PCT = left / assigned
const PER_DAY = `${fmt(left / DAYS_LEFT)}/day`
const ROWS = ['🍅 Groceries', '🛍️ Shopping', '🛵 Travel'].map((name) => {
  const c = CATEGORIES.find((x) => x.name === name)!
  return { icon: name.split(' ')[0], name: name.slice(name.indexOf(' ') + 1), left: fmt(c.assigned - c.spent), pct: (c.spent / c.assigned) * 100 }
})

function BirdRing({ size }: { size: number }) {
  const R = 45
  const c = 2 * Math.PI * R
  const { cx, cy, r } = EYE
  return <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
    <circle cx="50" cy="50" r={R} fill="none" stroke={T.text} strokeOpacity="0.09" strokeWidth="7" />
    <circle cx="50" cy="50" r={R} fill="none" stroke={T.mint} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(c * LEFT_PCT).toFixed(2)} ${c.toFixed(2)}`} transform="rotate(-90 50 50)" />
    <g transform="translate(50 53) scale(0.165) translate(-262 -240)">
      <rect x="224" y="340" width="17" height="46" rx="8.5" fill={T.accent} />
      <rect x="259" y="340" width="17" height="46" rx="8.5" fill={T.accent} />
      <path d={BIRD_BODY_PATH} fill={T.accent} />
      <path d="M 168 236 Q 214 318 292 300 Q 246 262 168 236 Z" fill="#0a0a0a" fillOpacity="0.22" />
      <ellipse cx="318" cy="258" rx="17" ry="11" fill="#ffb199" fillOpacity="0.75" />
      <circle cx={cx} cy={cy} r={r} fill="#fcfcfc" />
      <circle cx={cx + 6} cy={cy - 6} r="6" fill={T.accent} />
    </g>
  </svg>
}

function Plus({ size }: { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={T.onAccent} strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
}

/** The 4×1 bar widget: ring, what's left, and a + that opens the keypad. */
export function BarWidget() {
  return <div className="m-widget m-widget--bar">
    <BirdRing size={40} />
    <div className="m-widget-hero">
      <b>{fmt(left)}</b>
      <span>{DAYS_LEFT} days left · {PER_DAY}</span>
    </div>
    <span className="m-widget-plus"><Plus size={18} /></span>
  </div>
}

/** The large widget: ring and total, three envelopes, today's logs, quick-log chips. */
export function EnvelopeWidget() {
  return <div className="m-widget">
    <div className="m-widget-head">
      <BirdRing size={56} />
      <div className="m-widget-hero">
        <b><small>₹</small>{Math.round(left).toLocaleString('en-IN')}</b>
        <span>{DAYS_LEFT} days left · {PER_DAY}</span>
      </div>
    </div>
    <div className="m-widget-rows">
      {ROWS.map((r) => <div key={r.name}>
        <div className="m-widget-row"><span>{r.icon}</span><b>{r.name}</b><em>{r.left}</em></div>
        <div className="m-widget-bar"><i style={{ width: `${Math.max(2, Math.min(92, Math.round(r.pct)))}%` }} /></div>
      </div>)}
    </div>
    <span className="m-widget-today">TODAY</span>
    <div className="m-widget-log"><span>Coffee with Sam</span><b>₹180</b></div>
    <div className="m-widget-log"><span>Metro card</span><b>₹100</b></div>
    <div className="m-widget-actions"><span>🍅 Groceries</span><span>🛵 Travel</span><span className="m-widget-plus"><Plus size={16} /></span></div>
  </div>
}
