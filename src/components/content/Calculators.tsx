'use client'

import { useId, useState } from 'react'
import { emergencyFund, lakhs, rentAffordability, salaryPlan, sinkingFund, split503020 } from '@/lib/tools/money'
import { formatINR } from '@/src/lib/format'
import { EmailPlan } from './EmailPlan'

/** A rupee amount field. Keeps digits only and shows the amount the Indian way under it. */
/** `onChange` gets null when the field is emptied, so callers can tell "0" from "not entered". */
function MoneyField({ label, value, onChange, hint }: { label: string; value: number | null; onChange: (n: number | null) => void; hint?: string }) {
  const id = useId()
  return <div className="lp-calc-item">
    <label htmlFor={id}>{label}</label>
    <span className="lp-calc-field"><span aria-hidden="true">₹</span><input id={id} inputMode="numeric" autoComplete="off" aria-describedby={`${id}-hint`} value={value === null ? '' : value.toLocaleString('en-IN')} placeholder="0" onChange={(e) => { const digits = e.target.value.replace(/\D/g, '').slice(0, 10); onChange(digits ? Number(digits) : null) }} /></span>
    <span className="lp-calc-hint" id={`${id}-hint`}>{hint ?? (value ? lakhs(value) : '\u00a0')}</span>
  </div>
}

function Results({ items }: { items: [string, number, string?][] }) {
  return <dl className="lp-calc-out" aria-live="polite">{items.map(([label, n, note]) => <div key={label}><dt>{label}</dt><dd>{formatINR(n)}{note && <small>{note}</small>}</dd></div>)}</dl>
}

export function Calculator503020({ initial = 50000 }: { initial?: number }) {
  const [income, setIncome] = useState<number | null>(initial)
  const s = split503020(income ?? 0)
  return <div className="lp-calc">
    <MoneyField label="Monthly take-home pay" value={income} onChange={setIncome} />
    <Results items={[['Needs (50%)', s.needs, 'Rent, groceries, bills, EMIs'], ['Wants (30%)', s.wants, 'Eating out, shopping, trips'], ['Savings (20%)', s.savings, 'Emergency fund, SIPs']]} />
  </div>
}

export function SalaryPlanner({ initial = 40000 }: { initial?: number }) {
  const [salary, setSalary] = useState<number | null>(initial)
  const [rent, setRent] = useState<number | null>(null)
  const plan = salaryPlan(salary ?? 0, rent === null ? {} : { rent })
  return <div className="lp-calc">
    <MoneyField label="Monthly take-home salary" value={salary} onChange={setSalary} />
    <MoneyField label="Your rent (leave empty to use 30%)" value={rent} onChange={setRent} hint={rent ? lakhs(rent) : 'Living with family? Put 0 and the rent goes to savings.'} />
    <div className="table-scroll"><table>
      <thead><tr><th scope="col">Category</th><th scope="col">Per month</th><th scope="col">Share</th></tr></thead>
      <tbody>{plan.map((c) => <tr key={c.name}><th scope="row">{c.name}</th><td>{formatINR(c.amount)}</td><td>{salary ? `${Math.round((c.amount / salary) * 100)}%` : '0%'}</td></tr>)}</tbody>
    </table></div>
    <EmailPlan salary={salary ?? 0} rent={rent} />
  </div>
}

export function EmergencyFundCalculator() {
  const [essentials, setEssentials] = useState<number | null>(30000)
  const [months, setMonths] = useState(6)
  const [saved, setSaved] = useState<number | null>(null)
  const [perMonth, setPerMonth] = useState<number | null>(5000)
  const r = emergencyFund({ monthlyEssentials: essentials ?? 0, months, saved: saved ?? 0, monthlySaving: perMonth ?? 0 })
  const id = useId()
  return <div className="lp-calc">
    <MoneyField label="Essential spending a month" value={essentials} onChange={setEssentials} hint="Rent, groceries, bills, EMIs, insurance. Not eating out." />
    <div className="lp-calc-item">
      <label htmlFor={id}>Months to cover</label>
      <span className="lp-calc-field"><select id={id} aria-describedby={`${id}-hint`} value={months} onChange={(e) => setMonths(Number(e.target.value))}>
        {[3, 4, 6, 9, 12].map((m) => <option key={m} value={m}>{m} months</option>)}
      </select></span>
      <span className="lp-calc-hint" id={`${id}-hint`}>6 is a good default. Pick more if your income is irregular.</span>
    </div>
    <MoneyField label="Already saved for it" value={saved} onChange={setSaved} />
    <MoneyField label="You can put aside a month" value={perMonth} onChange={setPerMonth} />
    <Results items={[['Your target', r.target, lakhs(r.target)], ['Still to save', r.gap]]} />
    <p className="lp-calc-note" aria-live="polite">{r.monthsToGoal === 0 ? 'You’re covered. Anything more can go to your goals.' : r.monthsToGoal === null ? 'Add a monthly amount to see when you’ll get there.' : `At ${formatINR(perMonth ?? 0)} a month, you’ll get there in ${r.monthsToGoal} ${r.monthsToGoal === 1 ? 'month' : 'months'}.`}</p>
  </div>
}

/** Common yearly costs to start from. Every row is editable. */
const SINKING_DEFAULTS = [
  { name: 'Health insurance', amount: 18000, months: 12 },
  { name: 'Diwali', amount: 15000, months: 8 },
  { name: 'Vehicle insurance', amount: 9000, months: 6 },
  { name: 'New phone', amount: 24000, months: 18 },
]

const digits = (s: string, max: number) => Number(s.replace(/\D/g, '').slice(0, max))

export function SinkingFundCalculator() {
  const [costs, setCosts] = useState(SINKING_DEFAULTS)
  const r = sinkingFund(costs)
  const edit = (i: number, patch: Partial<(typeof costs)[number]>) => setCosts(costs.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  return <div className="lp-calc">
    <div className="table-scroll"><table className="lp-calc-costs">
      <thead><tr><th scope="col">Cost</th><th scope="col">Amount</th><th scope="col">Months until due</th><th scope="col">Set aside a month</th><th scope="col"><span className="lp-sr-only">Remove</span></th></tr></thead>
      <tbody>{costs.map((c, i) => {
        const what = c.name || `cost ${i + 1}`
        return <tr key={i}>
          <td><span className="lp-calc-field"><input aria-label={`Name of cost ${i + 1}`} autoComplete="off" value={c.name} placeholder="School fees" onChange={(e) => edit(i, { name: e.target.value })} /></span></td>
          <td><span className="lp-calc-field"><span aria-hidden="true">₹</span><input aria-label={`Amount for ${what}`} inputMode="numeric" autoComplete="off" value={c.amount ? c.amount.toLocaleString('en-IN') : ''} placeholder="0" onChange={(e) => edit(i, { amount: digits(e.target.value, 10) })} /></span></td>
          <td><span className="lp-calc-field"><input aria-label={`Months until ${what} is due`} inputMode="numeric" autoComplete="off" value={c.months || ''} placeholder="1" onChange={(e) => edit(i, { months: digits(e.target.value, 3) })} /></span></td>
          <td>{formatINR(r.monthly[i])}</td>
          <td><button type="button" className="lp-calc-remove" aria-label={`Remove ${what}`} onClick={() => setCosts(costs.filter((_, j) => j !== i))}>×</button></td>
        </tr>
      })}</tbody>
    </table></div>
    <button type="button" className="lp-button lp-button--ghost lp-calc-add" onClick={() => setCosts([...costs, { name: '', amount: 0, months: 12 }])}>Add a cost</button>
    <Results items={[['Set aside a month', r.total, `${formatINR(r.total * 12)} a year`]]} />
    <p className="lp-calc-note">Each amount is rounded up to the nearest ₹100, so you’ll have a little more than you need when the bill comes.</p>
  </div>
}

export function RentCalculator() {
  const [salary, setSalary] = useState<number | null>(60000)
  const [emis, setEmis] = useState<number | null>(null)
  const r = rentAffordability({ salary: salary ?? 0, emis: emis ?? 0 })
  return <div className="lp-calc">
    <MoneyField label="Monthly take-home salary" value={salary} onChange={setSalary} />
    <MoneyField label="EMIs you already pay a month" value={emis} onChange={setEmis} hint="Car, phone, personal loan, credit card EMIs." />
    <Results items={[['Comfortable rent', r.comfortable, '25% of take-home'], ['Stretch rent', r.stretch, '30% of take-home']]} />
    {!!emis && r.stretch < rentAffordability({ salary: salary ?? 0 }).stretch && <p className="lp-calc-note">Your EMIs lower this. Rent plus EMIs is kept within 40% of what you take home.</p>}
  </div>
}
