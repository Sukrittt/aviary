import { pageMetadata } from '@/lib/seo'
import Link from 'next/link'
import type { Filter } from 'mongodb'
import { getDb } from '@/lib/mongodb'
import { escapeRegExp } from '@/lib/http'
import { ADMIN_AUDIT, type AdminAuditDoc } from '@/lib/adminAudit'
import type { UserDoc } from '@/lib/users'
import { num } from '../format'
import { ACTIONS, changesOf, factsOf, fmtValue } from './summarize'

const PAGE_SIZE = 50
const DAY = /^\d{4}-\d{2}-\d{2}$/
// Admin dates are IST everywhere (see ../format.ts), so a filter day runs midnight to midnight IST.
const istDay = (day: string, plusDays = 0) => new Date(new Date(`${day}T00:00:00+05:30`).getTime() + plusDays * 86400000)

type Params = Promise<{ q?: string; action?: string; admin?: string; from?: string; to?: string; page?: string }>

const stamp = (at: Date) => {
  const d = new Date(at)
  const sameYear = d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric' }) === new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric' })
  return {
    date: d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) }),
    time: d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }),
  }
}

export default async function AdminAudit({ searchParams }: { searchParams: Params }) {
  const params = await searchParams
  const q = params.q?.trim() ?? ''
  const action = params.action ?? ''
  const admin = params.admin ?? ''
  const from = DAY.test(params.from ?? '') ? params.from! : ''
  const to = DAY.test(params.to ?? '') ? params.to! : ''
  const page = Math.max(1, Number(params.page) || 1)

  const db = await getDb()
  const log = db.collection<AdminAuditDoc>(ADMIN_AUDIT)
  const users = db.collection<UserDoc>('users')

  const and: Filter<AdminAuditDoc>[] = []
  if (action) and.push({ action })
  if (admin) and.push({ adminId: admin })
  if (from || to) and.push({ at: { ...(from && { $gte: istDay(from) }), ...(to && { $lt: istDay(to, 1) }) } })
  if (q) {
    // Free text hits the action name, the admin's or target's email/name, and the email recorded on delete entries.
    const re = new RegExp(escapeRegExp(q), 'i')
    const matched = (await users.find({ $or: [{ email: re }, { name: re }, { _id: q }] }, { projection: { _id: 1 } }).limit(200).toArray()).map((u) => u._id)
    and.push({ $or: [{ action: re }, { adminId: { $in: matched } }, { targetUserId: { $in: matched } }, { 'detail.email': re }, { 'detail.job': re }] })
  }
  const filter: Filter<AdminAuditDoc> = and.length ? { $and: and } : {}

  const [total, rows, actions, adminIds] = await Promise.all([
    log.countDocuments(filter),
    log
      .find(filter)
      .sort({ at: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .toArray(),
    log.distinct('action'),
    log.distinct('adminId'),
  ])

  const ids = [...new Set([...adminIds, ...rows.map((r) => r.targetUserId)].filter((id): id is string => !!id))]
  const emails = new Map((await users.find({ _id: { $in: ids } }, { projection: { email: 1 } }).toArray()).map((u) => [u._id, u.email]))
  // Hard-deleted targets have no users doc left; their email was recorded in the entry itself.
  const who = (id: string | null, fallback?: unknown) => (id ? (emails.get(id) ?? (typeof fallback === 'string' ? fallback : id)) : '—')

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const filtered = !!(q || action || admin || from || to)
  const href = (p: number) => `/admin/audit?${new URLSearchParams({ q, action, admin, from, to, page: String(p) })}`

  return (
    <>
      <div className="adm-head">
        <h1>Audit log</h1>
        <span className="adm-sub">{filtered ? `${num(total)} matching` : `${num(total)} admin actions`}</span>
      </div>

      <form className="adm-form adm-filters" action="/admin/audit">
        <input className="adm-input adm-search" name="q" type="search" defaultValue={q} placeholder="Search action, admin or user email" aria-label="Search" />
        <select className="adm-select" name="action" defaultValue={action} aria-label="Action">
          <option value="">All actions</option>
          {actions.sort().map((a) => (
            <option key={a} value={a}>
              {ACTIONS[a]?.label ?? a}
            </option>
          ))}
        </select>
        <select className="adm-select" name="admin" defaultValue={admin} aria-label="Admin">
          <option value="">All admins</option>
          {adminIds.map((id) => (
            <option key={id} value={id}>
              {who(id)}
            </option>
          ))}
        </select>
        <label className="adm-date">
          <span>From</span>
          <input className="adm-input" type="date" name="from" defaultValue={from} />
        </label>
        <label className="adm-date">
          <span>To</span>
          <input className="adm-input" type="date" name="to" defaultValue={to} />
        </label>
        <button className="adm-btn is-primary" type="submit">
          Apply
        </button>
        {filtered && (
          <Link className="adm-btn" href="/admin/audit">
            Clear
          </Link>
        )}
      </form>

      <section className="erd-card adm-card">
        <div className="adm-table-wrap">
          <table className="adm-table adm-audit">
            <thead>
              <tr>
                <th>When</th>
                <th>Admin</th>
                <th>Action</th>
                <th>Target</th>
                <th>What changed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const meta = ACTIONS[r.action]
                const changes = changesOf(r.action, r.detail)
                const facts = changes ? [] : factsOf(r.detail).filter((f) => f.label !== 'email')
                const t = stamp(r.at)
                return (
                  <tr key={String(r._id)}>
                    <td className="adm-when">
                      <span>{t.date}</span>
                      <span className="adm-muted">{t.time}</span>
                    </td>
                    <td className="adm-who">{who(r.adminId)}</td>
                    <td>
                      <span className={`adm-badge${meta?.tone ? ` is-${meta.tone}` : ''}`}>{meta?.label ?? r.action}</span>
                    </td>
                    <td className="adm-who">
                      {r.targetUserId && emails.has(r.targetUserId) ? <Link href={`/admin/users/${encodeURIComponent(r.targetUserId)}`}>{who(r.targetUserId)}</Link> : who(r.targetUserId, r.detail.email)}
                    </td>
                    <td>
                      {changes &&
                        (changes.length === 0 ? (
                          <span className="adm-muted">Saved with no changes</span>
                        ) : (
                          <ul className="adm-changes">
                            {changes.map((c) => (
                              <li key={c.label}>
                                <span className="adm-change-label">{c.label}</span>
                                <del>{fmtValue(c.from)}</del>
                                <span aria-label="changed to" className="adm-arrow">
                                  →
                                </span>
                                <ins>{fmtValue(c.to)}</ins>
                              </li>
                            ))}
                          </ul>
                        ))}
                      {!changes &&
                        (facts.length === 0 ? (
                          <span className="adm-muted">—</span>
                        ) : (
                          <dl className="adm-facts">
                            {facts.map((f) => (
                              <div key={f.label}>
                                <dt>{f.label}</dt>
                                <dd>{f.value}</dd>
                              </div>
                            ))}
                          </dl>
                        ))}
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="adm-muted">
                    {filtered ? 'No admin actions match these filters.' : 'No admin actions yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="adm-pager">
            <span className="adm-muted">
              Page {page} of {pages}
            </span>
            {page > 1 && (
              <Link className="adm-btn" href={href(page - 1)}>
                Previous
              </Link>
            )}
            {page < pages && (
              <Link className="adm-btn" href={href(page + 1)}>
                Next
              </Link>
            )}
          </div>
        )}
      </section>
    </>
  )
}

export const metadata = pageMetadata('/admin/audit')
