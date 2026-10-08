'use client'

import { BIRD_BODY_PATH } from '../../BirdMark'
import { CATEGORIES, DAYS_LEFT } from './demo'
import { lightTokens as T } from '@/src/theme/tokens'

/**
 * Web twins of Mobile's home-screen widgets (src/widgets/EnvelopeMiniWidget.tsx
 * and EnvelopeWidget.tsx), in the light scheme at the "ok" mood, fed from the
 * landing's sample categories. The bird, ring and doodles are ports of
 * src/widgets/bird.ts and doodles.ts; sizes are Mobile's dp scaled to the
 * 214px card the phone frame leaves.
 */

const EYE = { cx: 306, cy: 216, r: 19 }
const fmt = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`

/** Card widths inside the phone frame: 2 of 4 columns for the mini, all 4 for the large. */
export const MINI = 104
const CARD = 214
const BAND = 88

const spendable = CATEGORIES.filter((c) => !c.group.includes('Investments'))
const assigned = spendable.reduce((s, c) => s + c.assigned, 0)
const left = spendable.reduce((s, c) => s + Math.max(0, c.assigned - c.spent), 0)
const LEFT_PCT = left / assigned
const PER_DAY = fmt(left / DAYS_LEFT)
const TODAY = [
  { item: 'Coffee with Sam', amount: 180 },
  { item: 'Metro card', amount: 100 },
]
const ROWS = ['🍅 Groceries', '🛍️ Shopping', '🛵 Travel'].map((name) => {
  const c = CATEGORIES.find((x) => x.name === name)!
  return { icon: name.split(' ')[0], name: name.slice(name.indexOf(' ') + 1), left: fmt(c.assigned - c.spent), pct: (c.spent / c.assigned) * 100 }
})
const PILLS = [
  { label: 'per day', value: PER_DAY, tint: T.text },
  { label: 'today', value: fmt(TODAY.reduce((s, t) => s + t.amount, 0)), tint: T.text },
  { label: 'week', value: '-8%', tint: T.mint },
]

/** The bird alone on its 400x340 artboard, eye open; the lid is the blink frame. */
function Bird({ size }: { size: number }) {
  const { cx, cy, r } = EYE
  return <svg className="m-bird" width={size} height={size * 0.85} viewBox="60 60 400 340" aria-hidden="true">
    <rect x="224" y="340" width="17" height="46" rx="8.5" fill={T.accent} />
    <rect x="259" y="340" width="17" height="46" rx="8.5" fill={T.accent} />
    <path d={BIRD_BODY_PATH} fill={T.accent} />
    <path d="M 168 236 Q 214 318 292 300 Q 246 262 168 236 Z" fill="#fcfcfc" fillOpacity="0.22" />
    <ellipse cx="318" cy="258" rx="17" ry="11" fill="#ffb199" fillOpacity="0.75" />
    <g className="m-bird-eye"><circle cx={cx} cy={cy} r={r} fill="#fcfcfc" /><circle cx={cx + 6} cy={cy - 6} r="6" fill={T.accent} /></g>
    <path className="m-bird-lid" d={`M ${cx - 16} ${cy + 4} Q ${cx} ${cy + 18} ${cx + 16} ${cy + 4}`} fill="none" stroke="#fcfcfc" strokeWidth="9" strokeLinecap="round" />
  </svg>
}

/** The ring gauge alone, as in the label line under the number. */
function Ring({ size }: { size: number }) {
  const R = 43
  const c = 2 * Math.PI * R
  return <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
    <circle cx="50" cy="50" r={R} fill="none" stroke={T.text} strokeOpacity="0.09" strokeWidth="14" />
    <circle cx="50" cy="50" r={R} fill="none" stroke={T.mint} strokeWidth="14" strokeLinecap="round" strokeDasharray={`${(c * LEFT_PCT).toFixed(2)} ${c.toFixed(2)}`} transform="rotate(-90 50 50)" />
  </svg>
}

const GLYPH = {
  star: 'M 50 22 L 57 42 L 78 43 L 61 56 L 67 77 L 50 65 L 33 77 L 39 56 L 22 43 L 43 42 Z',
  arc: 'M 30 70 Q 50 20 70 70',
  triangle: 'M 50 26 L 74 70 L 26 70 Z',
  ring: 'M 50 50 m -16 0 a 16 16 0 1 0 32 0 a 16 16 0 1 0 -32 0',
  zigzag: 'M 12 60 L 30 40 L 48 60 L 66 40 L 84 60',
  wave: 'M 10 50 Q 25 30 40 50 T 70 50 T 95 50',
  stripes: 'M 30 30 L 70 70 M 45 22 L 85 62 M 15 45 L 55 85',
} as const
type Spot = { glyph: keyof typeof GLYPH; x: number; y: number; size: number; rotate: number }
/** Hand-placed so none lands under the bird, the + or the number (same spots as Mobile, size in dp). */
const SQUARE: Spot[] = [
  { glyph: 'star', x: 0.6, y: 0.1, size: 18, rotate: -14 },
  { glyph: 'arc', x: 0.7, y: 0.42, size: 18, rotate: 32 },
  { glyph: 'ring', x: 0.92, y: 0.6, size: 16, rotate: 0 },
  { glyph: 'triangle', x: 0.3, y: 0.62, size: 14, rotate: -28 },
  { glyph: 'wave', x: 0.88, y: 0.9, size: 22, rotate: -8 },
  { glyph: 'stripes', x: 0.55, y: 0.6, size: 14, rotate: 0 },
]
const WIDE: Spot[] = [
  { glyph: 'star', x: 0.93, y: 0.12, size: 20, rotate: -14 },
  { glyph: 'arc', x: 0.34, y: 0.56, size: 18, rotate: 32 },
  { glyph: 'ring', x: 0.97, y: 0.48, size: 14, rotate: 0 },
  { glyph: 'triangle', x: 0.1, y: 0.9, size: 14, rotate: -28 },
  { glyph: 'zigzag', x: 0.28, y: 0.92, size: 20, rotate: 12 },
  { glyph: 'stripes', x: 0.34, y: 0.08, size: 14, rotate: 0 },
]

/** The landing's wallpaper glyphs on the card at a whisper, scaled by 0.71 (dp to card px). */
function Doodles({ width, height }: { width: number; height: number }) {
  const spots = width > height * 1.4 ? WIDE : SQUARE
  return <svg className="m-widget-doodles" width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none" stroke={T.text} strokeOpacity="0.14" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {spots.map((s) => <path key={s.glyph} d={GLYPH[s.glyph]} transform={`translate(${(s.x * width).toFixed(1)} ${(s.y * height).toFixed(1)}) rotate(${s.rotate}) scale(${(s.size * 0.0071).toFixed(4)}) translate(-50 -50)`} />)}
  </svg>
}

function Plus({ size }: { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={T.onAccent} strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
}

/** The 2×2 mini widget: bird peeking in top-left, + top-right, the number across the bottom. */
export function MiniWidget() {
  return <div className="m-widget m-widget--mini">
    <Doodles width={MINI} height={MINI} />
    <Bird size={Math.round(MINI * 0.66)} />
    <span className="m-widget-plus"><Plus size={16} /></span>
    <div className="m-widget-hero">
      <b>{fmt(left)}</b>
      <span><Ring size={11} />{DAYS_LEFT} days left</span>
    </div>
  </div>
}

/** The large widget: bird band with the total and stat pills, three envelopes, today's logs, quick-log chips. */
export function EnvelopeWidget() {
  return <div className="m-widget">
    <div className="m-widget-band">
      <Doodles width={CARD} height={BAND} />
      <Bird size={70} />
      <div className="m-widget-hero">
        <b><small>₹</small>{Math.round(left).toLocaleString('en-IN')}</b>
        <span><Ring size={11} />{DAYS_LEFT} days left · {PER_DAY}/day</span>
        <div className="m-widget-pills">
          {PILLS.map((p) => <div key={p.label}><b style={{ color: p.tint }}>{p.value}</b><span>{p.label}</span></div>)}
        </div>
      </div>
    </div>
    <div className="m-widget-rows">
      {ROWS.map((r) => <div key={r.name}>
        <div className="m-widget-row"><span>{r.icon}</span><b>{r.name}</b><em>{r.left}</em></div>
        <div className="m-widget-bar"><i style={{ width: `${Math.max(2, Math.min(92, Math.round(r.pct)))}%` }} /></div>
      </div>)}
    </div>
    <span className="m-widget-today">TODAY</span>
    {TODAY.map((t) => <div key={t.item} className="m-widget-log"><span>{t.item}</span><b>{fmt(t.amount)}</b></div>)}
    <div className="m-widget-actions"><span>🍅 Groceries</span><span>🛵 Travel</span><span className="m-widget-plus"><Plus size={16} /></span></div>
  </div>
}
