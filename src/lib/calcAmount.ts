/**
 * The amount keypad's inline calculator. The amount is kept as the typed
 * expression ("5+5+5.5"); a plain number is just an expression with no
 * operator, so screens without operator keys behave exactly as before.
 * Twin of Mobile's src/lib/calcAmount.ts.
 */
export const OPERATORS = ['+', '−', '×', '÷'] as const

const OP_RE = /[+−×÷]/
const isOp = (c: string) => (OPERATORS as readonly string[]).includes(c)

export const hasOperator = (expr: string) => OP_RE.test(expr)

/** "5+5+" -> "5 + 5 +", for the line under the total. */
export const formatExpression = (expr: string) => expr.replace(/([+−×÷])/g, ' $1 ').trim()

/** Total of the expression, rounded to 2 decimals. A trailing operator is ignored. */
export function evaluateAmount(expr: string): number {
  const e = isOp(expr.slice(-1)) ? expr.slice(0, -1) : expr
  let total = 0
  for (const term of e.match(/[+−]?[^+−]+/g) ?? []) {
    const sign = term[0] === '−' ? -1 : 1
    const parts = (term[0] === '+' || term[0] === '−' ? term.slice(1) : term).split(/([×÷])/)
    let v = Number(parts[0])
    for (let i = 1; i < parts.length; i += 2) v = parts[i] === '×' ? v * Number(parts[i + 1]) : v / Number(parts[i + 1])
    total += sign * v
  }
  return Number.isFinite(total) ? Math.round(total * 100) / 100 : 0
}

/** Applies one keypad key (digit, '.', or an operator) to the expression. */
export function pushAmountKey(prev: string, key: string): string {
  if (isOp(key)) {
    if (prev === '') return prev
    let base = isOp(prev.slice(-1)) ? prev.slice(0, -1) : prev
    // × and ÷ fold everything before them into one number, so the line under
    // the total always reads left to right.
    if ((key === '×' || key === '÷') && hasOperator(base)) base = String(evaluateAmount(base))
    return base + key
  }
  const seg = prev.split(OP_RE).pop() ?? ''
  const head = prev.slice(0, prev.length - seg.length)
  if (key === '.') return seg.includes('.') ? prev : head + (seg === '' ? '0.' : seg + '.')
  const dot = seg.indexOf('.')
  if (dot !== -1 && seg.length - dot - 1 >= 2) return prev
  const next = (seg + key).replace(/^0+(?=\d)/, '')
  return next.length > 9 ? prev : head + next
}
