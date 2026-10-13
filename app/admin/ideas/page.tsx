import { pageMetadata } from '@/lib/seo'
import { Lightbulb } from 'lucide-react'
import { getDb } from '@/lib/mongodb'
import { IDEA_STATUSES, IDEAS, type IdeaDoc } from '@/lib/ideas'
import type { UserDoc } from '@/lib/users'
import { num, fmtDateTime } from '../format'
import { ActionForm, SubmitButton } from '../ActionForm'
import { deleteIdeaAction, setIdeaHiddenAction, setIdeaStatusAction } from './actions'

const STATUS_LABEL: Record<IdeaDoc['status'], string> = {
  open: 'Open',
  planned: 'Planned',
  in_progress: 'In progress',
  shipped: 'Shipped',
  declined: 'Declined',
}

// ponytail: newest 200, no pager. Add one when the board outgrows it.
const LIMIT = 200

export default async function AdminIdeas() {
  const db = await getDb()
  const rows = await db.collection<IdeaDoc>(IDEAS).find().sort({ createdAt: -1 }).limit(LIMIT).toArray()
  const userIds = [...new Set(rows.map((r) => r.user_id))]
  const emails = new Map(
    (await db.collection<UserDoc>('users').find({ _id: { $in: userIds } }, { projection: { email: 1 } }).toArray()).map((u) => [u._id, u.email]),
  )

  return (
    <>
      <div className="adm-head">
        <h1>Ideas</h1>
        <span className="adm-sub">{num(rows.length)} on the board, hidden ones included</span>
      </div>

      <section className="erd-card adm-card adm-card-fill">
        {rows.length === 0 ? (
          <div className="adm-empty-fill">
            <Lightbulb size={32} aria-hidden="true" />
            <span>No ideas yet.</span>
          </div>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Idea</th>
                  <th>Score</th>
                  <th>Status</th>
                  <th>Author</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const id = String(r._id)
                  return (
                    <tr key={id}>
                      <td className="adm-when">{fmtDateTime(r.createdAt)}</td>
                      <td>
                        <div>
                          {r.title} {r.hidden && <span className="adm-badge is-bad">Hidden</span>}
                        </div>
                        {r.description && <div className="adm-muted">{r.description}</div>}
                      </td>
                      <td>
                        {num(r.score)} <span className="adm-muted">(+{num(r.up)} / -{num(r.down)})</span>
                      </td>
                      <td>
                        <ActionForm action={setIdeaStatusAction.bind(null, id)}>
                          <select className="adm-select" name="status" defaultValue={r.status} aria-label="Status">
                            {IDEA_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {STATUS_LABEL[s]}
                              </option>
                            ))}
                          </select>
                          <SubmitButton>Save</SubmitButton>
                        </ActionForm>
                      </td>
                      <td className="adm-who">
                        {r.authorFirstName ?? 'No name'}
                        <div className="adm-muted">{emails.get(r.user_id) ?? r.user_id}</div>
                      </td>
                      <td>
                        <ActionForm action={setIdeaHiddenAction.bind(null, id, !r.hidden)}>
                          <SubmitButton>{r.hidden ? 'Unhide' : 'Hide'}</SubmitButton>
                        </ActionForm>
                        <ActionForm action={deleteIdeaAction.bind(null, id)} confirm="Delete this idea and its votes? This can't be undone.">
                          <SubmitButton variant="danger">Delete</SubmitButton>
                        </ActionForm>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

export const metadata = pageMetadata('/admin/ideas')
