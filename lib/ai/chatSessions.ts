import type { ObjectId } from 'mongodb'
import type { CaptureProposal } from './capture'

export type ProposalStatus = 'pending' | 'submitted' | 'dismissed'

export interface StoredChatMessage {
  role: 'user' | 'model'
  text: string
  createdAt: Date
  /** A capture proposal (lib/ai/capture.ts) as JSON. Encrypted at rest like `text` (lib/encryptedFields.ts). */
  proposal?: string
  /** Plaintext beside the encrypted proposal, so its status can change with a positional update. */
  proposalId?: string
  proposalStatus?: ProposalStatus
  /** The expenses a submitted proposal became. */
  expenseIds?: string[]
  /** Ask Aviary's reply once a proposal's rows were logged (src/lib/captureAck.ts). */
  ack?: boolean
}

export interface ChatSessionDoc {
  _id: ObjectId
  user_id: string
  title: string
  messages: StoredChatMessage[]
  createdAt: Date
  updatedAt: Date
}

export type ClientProposal = CaptureProposal & { status: ProposalStatus; expenseIds?: string[] }

export interface ClientChatMessage {
  role: 'user' | 'model'
  text: string
  createdAt: Date
  proposal?: ClientProposal
  ack?: boolean
}

/** The stored-array cap every write to `messages` applies with `$slice`. */
export const MAX_SESSION_MESSAGES = 100

const TITLE_MAX_LEN = 40

/** Truncate to `maxLen` chars with an ellipsis. Used for both session titles and list previews. */
export function makeTitle(text: string, maxLen = TITLE_MAX_LEN): string {
  const trimmed = text.trim()
  return trimmed.length > maxLen ? `${trimmed.slice(0, maxLen).trimEnd()}…` : trimmed
}

/** The model message a capture reply is stored as: the proposal travels with the text it streamed under. */
export function captureMessage(text: string, proposal: CaptureProposal, createdAt: Date = new Date()): StoredChatMessage {
  return { role: 'model', text, createdAt, proposal: JSON.stringify(proposal), proposalId: proposal.id, proposalStatus: 'pending' }
}

/** A stored message as the session endpoint returns it, with any proposal parsed and its status attached. */
export function toClientMessage(message: StoredChatMessage): ClientChatMessage {
  const base = { role: message.role, text: message.text, createdAt: message.createdAt, ...(message.ack ? { ack: true } : {}) }
  if (typeof message.proposal !== 'string') return base
  try {
    const proposal = JSON.parse(message.proposal) as CaptureProposal
    return {
      ...base,
      proposal: {
        ...proposal,
        status: message.proposalStatus ?? 'pending',
        ...(message.expenseIds ? { expenseIds: message.expenseIds } : {}),
      },
    }
  } catch {
    return base
  }
}
