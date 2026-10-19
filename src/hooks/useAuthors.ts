import { useMemo } from 'react'
import type { BudgetSummary } from '@/src/api/spaces'
import { useSpaces } from './useSpaces'
import { useUser } from './useUser'

export const firstName = (name: string | null | undefined) => name?.trim().split(/\s+/)[0] || null

/** The owner's first name, for "until Priya renews". */
export function ownerName(budget: BudgetSummary | undefined): string | null {
  return firstName(budget?.members.find((m) => m.userId === budget.ownerId)?.name)
}

/**
 * "Who logged what" for the open budget: null unless 2+ people share it, so a
 * one-person budget looks just as it always has. `null` created_by is the owner.
 */
export function useAuthors() {
  const { active, shared } = useSpaces()
  const me = useUser().data?._id
  return useMemo(() => {
    if (!shared || !active) return null
    const authorId = (createdBy: string | null | undefined) => createdBy ?? active.ownerId
    const member = (createdBy: string | null | undefined) => active.members.find((m) => m.userId === authorId(createdBy))
    return {
      me,
      authorId,
      member,
      /** "you", "Rahul", or "someone who's left". */
      name: (createdBy: string | null | undefined) =>
        authorId(createdBy) === me ? 'you' : firstName(member(createdBy)?.name) ?? "someone who's left",
    }
  }, [active, shared, me])
}
