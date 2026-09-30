/** Friendly copy for writes that could not be completed; never expose API logs. */
export function expenseNotice(status: number | undefined, action: 'edit' | 'delete') {
  const backLabel = action === 'edit' ? 'Back to my draft' : 'Back to transactions'
  if (status === 404) return {
    title: 'This transaction is already deleted',
    message: action === 'edit'
      ? 'It was deleted elsewhere while you were editing. Your draft is still here, but these changes can no longer be saved to this transaction.'
      : 'It was deleted elsewhere, so there’s nothing more to do. Go back to see your updated transactions.',
    backLabel,
  }
  if (status === 409) return {
    title: 'This transaction was updated',
    message: `A newer version was saved elsewhere, so we haven’t ${action === 'edit' ? 'saved your changes' : 'deleted it'}. Go back to review the transaction before trying again.`,
    backLabel,
  }
  if (status === 428) return {
    title: 'Let’s get you up to date',
    message: 'Refresh the web page or update the app, then open this transaction again before making changes.',
    backLabel,
  }
  return {
    title: action === 'edit' ? 'We couldn’t save your changes' : 'We couldn’t confirm the deletion',
    message: 'Check your connection, then go back and refresh your transactions before trying again.',
    backLabel,
  }
}
