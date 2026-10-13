'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin'
import { audit } from '@/lib/adminAudit'
import { deleteIdea, isIdeaStatus, setIdeaHidden, setIdeaStatus } from '@/lib/ideas'
import type { ActionResult } from '../ActionForm'

export async function setIdeaStatusAction(ideaId: string, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  const adminId = await requireAdmin()
  const status = form.get('status')
  if (!isIdeaStatus(status)) return { ok: false, message: 'Pick a status' }
  if (!(await setIdeaStatus(ideaId, status))) return { ok: false, message: 'Idea not found' }
  await audit(adminId, 'idea.status', null, { ideaId, status })
  revalidatePath('/admin/ideas')
  return { ok: true, message: 'Saved' }
}

export async function setIdeaHiddenAction(ideaId: string, hidden: boolean): Promise<ActionResult> {
  const adminId = await requireAdmin()
  if (!(await setIdeaHidden(ideaId, hidden))) return { ok: false, message: 'Idea not found' }
  await audit(adminId, hidden ? 'idea.hide' : 'idea.unhide', null, { ideaId })
  revalidatePath('/admin/ideas')
  return { ok: true, message: hidden ? 'Hidden' : 'Visible again' }
}

export async function deleteIdeaAction(ideaId: string): Promise<ActionResult> {
  const adminId = await requireAdmin()
  if (!(await deleteIdea(ideaId))) return { ok: false, message: 'Idea not found' }
  await audit(adminId, 'idea.delete', null, { ideaId })
  revalidatePath('/admin/ideas')
  return { ok: true, message: 'Deleted' }
}
