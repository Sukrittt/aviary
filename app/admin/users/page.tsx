import { pageMetadata } from '@/lib/seo'
import Link from 'next/link'
import type { Filter } from 'mongodb'
import { getDb } from '@/lib/mongodb'
import { escapeRegExp } from '@/lib/http'
import { COLLECTIONS } from '@/lib/models'
import { displayName, type UserDoc } from '@/lib/users'
import { fmtDate, num, timeAgo } from '../format'

const PAGE_SIZE = 50
const SORTS = { created: 'createdAt', seen: 'lastSeenAt' } as const
const STATUSES = ['all', 'live', 'deleted', 'admin'] as const

type Params = Promise<{ q?: string; sort?: string; status?: string; page?: string }>

export default async function AdminUsers({ searchParams }: { searchParams: Params }) {
  const params = await searchParams
  const q = params.q?.trim() ?? ''
  const sort = params.sort === 'seen' ? 'seen' : 'created'
  const status = (STATUSES as readonly string[]).includes(params.status ?? '') ? params.status! : 'all'
  const page = Math.max(1, Number(params.page) || 1)

  const filter: Filter<UserDoc> = {}
  if (q) {
    const re = new RegExp(escapeRegExp(q), 'i')
    filter.$or = [{ email: re }, { name: re }, { _id: q }]
  }
  if (status === 'live') filter.deleted_at = null
  if (status === 'deleted') filter.deleted_at = { $ne: null }
  if (status === 'admin') filter.isAdmin = true

  const db = await getDb()
  const users = db.collection<UserDoc>('users')
  const [total, rows] = await Promise.all([
    users.countDocuments(filter),
    users
      .find(filter)
      .sort({ [SORTS[sort]]: -1, _id: 1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .toArray(),
  ])

  const expenseCounts = new Map(
    (
      await db
        .collection(COLLECTIONS.expenses)
        .aggregate<{ _id: string; n: number }>([
          { $match: { user_id: { $in: rows.map((u) => u._id) }, deleted_at: null } },
          { $group: { _id: '$user_id', n: { $sum: 1 } } },
        ])
        .toArray()
    ).map((r) => [r._id, r.n]),
  )

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const href = (overrides: Record<string, string | number>) =>
    `/admin/users?${new URLSearchParams({ q, sort, status, page: String(page), ...Object.fromEntries(Object.entries(overrides).map(([k, v]) => [k, String(v)])) })}`

  return (
    <>
      <div className="adm-head">
        <h1>Users</h1>
        <span className="adm-sub">{num(total)} matching</span>
      </div>

      <form className="adm-form" action="/admin/users">
        <input className="adm-input" name="q" defaultValue={q} placeholder="Email, name or user id" style={{ minWidth: 260 }} />
        <select className="adm-select" name="status" defaultValue={status}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === 'all' ? 'All statuses' : s === 'live' ? 'Active accounts' : s === 'deleted' ? 'Pending deletion' : 'Admins'}
            </option>
          ))}
        </select>
        <select className="adm-select" name="sort" defaultValue={sort}>
          <option value="created">Newest first</option>
          <option value="seen">Recently active</option>
        </select>
        <button className="adm-btn is-primary" type="submit">
          Search
        </button>
      </form>

      <section className="erd-card">
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Joined</th>
                <th>Last active</th>
                <th>Currency</th>
                <th className="num">Transactions</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u._id}>
                  <td>
                    <Link href={`/admin/users/${encodeURIComponent(u._id)}`}>
                      <strong>{displayName(u) ?? '(no name)'}</strong>
                    </Link>
                    <div className="adm-muted">{u.email}</div>
                  </td>
                  <td>{fmtDate(u.createdAt)}</td>
                  <td>{timeAgo(u.lastSeenAt)}</td>
                  <td>{u.currencyCode ?? '—'}</td>
                  <td className="num">{num(expenseCounts.get(u._id) ?? 0)}</td>
                  <td>
                    {u.deleted_at ? <span className="adm-badge is-bad">Deleting</span> : <span className="adm-badge is-good">Active</span>}{' '}
                    {u.isAdmin && <span className="adm-badge is-warn">Admin</span>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="adm-muted">
                    No users match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="adm-pager">
          <span className="adm-muted">
            Page {page} of {pages}
          </span>
          {page > 1 && (
            <Link className="adm-btn" href={href({ page: page - 1 })}>
              Previous
            </Link>
          )}
          {page < pages && (
            <Link className="adm-btn" href={href({ page: page + 1 })}>
              Next
            </Link>
          )}
        </div>
      </section>
    </>
  )
}

export const metadata = pageMetadata('/admin/users')
