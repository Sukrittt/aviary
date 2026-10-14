import { expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CountedTextarea } from './CountedTextarea'

it('shows the count only from 90% of the limit', () => {
  const { rerender } = render(<CountedTextarea aria-label="Details" maxLength={100} value={'a'.repeat(89)} onChange={() => {}} />)
  expect(screen.queryByText('89/100')).toBeNull()
  rerender(<CountedTextarea aria-label="Details" maxLength={100} value={'a'.repeat(90)} onChange={() => {}} />)
  expect(screen.getByText('90/100')).toBeInTheDocument()
})
