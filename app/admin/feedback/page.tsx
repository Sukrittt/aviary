import { pageMetadata } from '@/lib/seo'
import Link from 'next/link'
import type { Filter } from 'mongodb'
import { Inbox } from 'lucide-react'
import { getDb } from '@/lib/mongodb'
import { escapeRegExp } from '@/lib/http'
import { FEEDBACK, type FeedbackDoc } from '@/lib/feedback'
import { FEEDBACK_AREAS } from '@/lib/ai/feedbackTriage'
import type { UserDoc } from '@/lib/users'
import { num, fmtDateTime } from '../format'
import { FeedbackFilters } from './FeedbackFilters'

const PAGE_SIZE = 50
const SEVERITY_LABEL = ['Minor', 'Friction', 'Broken workflow', 'Data/security risk']

type Params = Promise<{ q?: string; type?: string; area?: string; severity?: string; page?: string }>

export default async function AdminFeedback({ searchParams }: { searchParams: Params }) {
  const params = await searchParams
  const q = params.q?.trim() ?? ''
  const type = params.type === 'bug' || params.type === 'idea' ? params.type : ''
  const area = (FEEDBACK_AREAS as readonly string[]).includes(params.area ?? '') ? params.area! : ''
  const severity = ['0', '1', '2', '3'].includes(params.severity ?? '') ? Number(params.severity) : null
  const page = Math.max(1, Number(params.page) || 1)

  const db = await getDb()
  const feedback = db.collection<FeedbackDoc>(FEEDBACK)
  const users = db.collection<UserDoc>('users')

  const and: Filter<FeedbackDoc>[] = []
  if (type) and.push({ type })
  if (area) and.push({ area: area as FeedbackDoc['area'] })
  if (severity !== null) and.push({ severity: severity as FeedbackDoc['severity'] })
  if (q) {
    const re = new RegExp(escapeRegExp(q), 'i')
    and.push({ $or: [{ title: re }, { description: re }] })
  }
  const filter: Filter<FeedbackDoc> = and.length ? { $and: and } : {}

  const [total, rows] = await Promise.all([
    feedback.countDocuments(filter),
    feedback
      .find(filter)
      .sort({ at: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .toArray(),
  ])

  const userIds = [...new Set(rows.map((r) => r.userId))]
  const emails = new Map((await users.find({ _id: { $in: userIds } }, { projection: { email: 1 } }).toArray()).map((u) => [u._id, u.email]))

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const filtered = !!(q || type || area || severity !== null)
  const href = (p: number) => `/admin/feedback?${new URLSearchParams({ q, type, area, severity: severity === null ? '' : String(severity), page: String(p) })}`

  return (
    <>
      <div className="adm-head">
        <h1>Feedback</h1>
        <span className="adm-sub">{filtered ? `${num(total)} matching` : `${num(total)} reports`}</span>
      </div>

      <FeedbackFilters
        key={`${q}|${type}|${area}|${severity}`}
        q={q}
        type={type}
        area={area}
        severity={severity === null ? '' : String(severity)}
        areas={FEEDBACK_AREAS}
        severityLabels={SEVERITY_LABEL}
      />

      <section className="erd-card adm-card adm-card-fill">
        {rows.length === 0 ? (
          <div className="adm-empty-fill">
            <Inbox size={32} aria-hidden="true" />
            <span>{filtered ? 'No feedback matches these filters.' : 'No feedback yet.'}</span>
          </div>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Type</th>
                  <th>Title</th>
                  <th>Area</th>
                  <th>Severity</th>
                  <th>Reporter</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={String(r._id)}>
                    <td className="adm-when">{fmtDateTime(r.at)}</td>
                    <td>
                      <span className={`adm-badge${r.type === 'bug' ? ' is-bad' : ''}`}>{r.type === 'bug' ? 'Bug' : 'Idea'}</span>
                    </td>
                    <td>
                      <div>{r.title}</div>
                      <div className="adm-muted">{r.description}</div>
                    </td>
                    <td>{r.area ?? '—'}</td>
                    <td>{r.severity !== null ? SEVERITY_LABEL[r.severity] : '—'}</td>
                    <td className="adm-who">{emails.get(r.userId) ?? r.userId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

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

export const metadata = pageMetadata('/admin/feedback')
