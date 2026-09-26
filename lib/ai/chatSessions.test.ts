import { describe, it, expect } from 'vitest'
import { captureMessage, toClientMessage } from './chatSessions'

const proposal = {
  id: '3f1c2a4e-8b7d-4c1e-9a2b-5d6e7f8a9b0c',
  items: [{ id: 'r1', item: 'Auto', amount: 240, splitWays: 1, date: '2026-09-26', category: 'Travel', categoryConfidence: 1 }],
  skipped: [],
  unparsed: [],
}
const at = new Date('2026-09-26T10:00:00Z')

describe('captureMessage', () => {
  it('stores the proposal as JSON beside plaintext status fields', () => {
    const message = captureMessage("Here's what I got.", proposal, at)
    expect(message).toEqual({
      role: 'model',
      text: "Here's what I got.",
      createdAt: at,
      proposal: JSON.stringify(proposal),
      proposalId: proposal.id,
      proposalStatus: 'pending',
    })
  })
})

describe('toClientMessage', () => {
  it('passes a plain message through', () => {
    expect(toClientMessage({ role: 'user', text: 'hi', createdAt: at })).toEqual({ role: 'user', text: 'hi', createdAt: at })
  })

  it('parses a proposal and attaches its current status', () => {
    const stored = { ...captureMessage("Here's what I got.", proposal, at), proposalStatus: 'submitted' as const, expenseIds: ['e1'] }
    expect(toClientMessage(stored).proposal).toEqual({ ...proposal, status: 'submitted', expenseIds: ['e1'] })
  })

  it('drops a proposal it cannot read rather than failing the whole transcript', () => {
    const message = toClientMessage({ role: 'model', text: 'ok', createdAt: at, proposal: 'enc:garbled' })
    expect(message).toEqual({ role: 'model', text: 'ok', createdAt: at })
  })
})
