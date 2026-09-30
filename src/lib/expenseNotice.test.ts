import { describe, expect, it } from 'vitest'
import { expenseNotice } from './expenseNotice'

describe('expenseNotice', () => {
  describe('status 404 (already deleted)', () => {
    it('returns edit-specific copy and draft backLabel when action is edit', () => {
      const result = expenseNotice(404, 'edit')
      expect(result).toEqual({
        title: 'This transaction is already deleted',
        message:
          'It was deleted elsewhere while you were editing. Your draft is still here, but these changes can no longer be saved to this transaction.',
        backLabel: 'Back to my draft',
      })
    })

    it('returns delete-specific copy and transactions backLabel when action is delete', () => {
      const result = expenseNotice(404, 'delete')
      expect(result).toEqual({
        title: 'This transaction is already deleted',
        message:
          'It was deleted elsewhere, so there’s nothing more to do. Go back to see your updated transactions.',
        backLabel: 'Back to transactions',
      })
    })
  })

  describe('status 409 (conflict / updated elsewhere)', () => {
    it('returns conflict copy with draft backLabel for edit', () => {
      const result = expenseNotice(409, 'edit')
      expect(result).toEqual({
        title: 'This transaction was updated',
        message:
          'A newer version was saved elsewhere, so we haven’t saved your changes. Go back to review the transaction before trying again.',
        backLabel: 'Back to my draft',
      })
    })

    it('returns conflict copy with transactions backLabel for delete', () => {
      const result = expenseNotice(409, 'delete')
      expect(result).toEqual({
        title: 'This transaction was updated',
        message:
          'A newer version was saved elsewhere, so we haven’t deleted it. Go back to review the transaction before trying again.',
        backLabel: 'Back to transactions',
      })
    })
  })

  describe('status 428 (precondition required / out of date)', () => {
    it('returns refresh/update prompt with draft backLabel for edit', () => {
      const result = expenseNotice(428, 'edit')
      expect(result).toEqual({
        title: 'Let’s get you up to date',
        message:
          'Refresh the web page or update the app, then open this transaction again before making changes.',
        backLabel: 'Back to my draft',
      })
    })

    it('returns refresh/update prompt with transactions backLabel for delete', () => {
      const result = expenseNotice(428, 'delete')
      expect(result).toEqual({
        title: 'Let’s get you up to date',
        message:
          'Refresh the web page or update the app, then open this transaction again before making changes.',
        backLabel: 'Back to transactions',
      })
    })
  })

  describe('fallback status (undefined or unhandled status codes)', () => {
    it('returns connection fallback with draft backLabel when status is undefined and action is edit', () => {
      const result = expenseNotice(undefined, 'edit')
      expect(result).toEqual({
        title: 'We couldn’t save your changes',
        message:
          'Check your connection, then go back and refresh your transactions before trying again.',
        backLabel: 'Back to my draft',
      })
    })

    it('returns connection fallback with transactions backLabel when status is undefined and action is delete', () => {
      const result = expenseNotice(undefined, 'delete')
      expect(result).toEqual({
        title: 'We couldn’t confirm the deletion',
        message:
          'Check your connection, then go back and refresh your transactions before trying again.',
        backLabel: 'Back to transactions',
      })
    })

    it('returns connection fallback for unhandled 500 server error on both edit and delete', () => {
      expect(expenseNotice(500, 'edit').backLabel).toBe('Back to my draft')
      expect(expenseNotice(500, 'delete').backLabel).toBe('Back to transactions')
      expect(expenseNotice(500, 'delete').title).toBe('We couldn’t confirm the deletion')
      expect(expenseNotice(500, 'edit').title).toBe('We couldn’t save your changes')
    })
  })
})
