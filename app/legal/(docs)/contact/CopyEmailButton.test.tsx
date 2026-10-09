import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CopyEmailButton } from './CopyEmailButton'

describe('CopyEmailButton', () => {
  it('copies the email and confirms it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<CopyEmailButton email="support@useaviary.com" />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy email' }))

    expect(await screen.findByRole('button', { name: 'Email copied' })).toHaveTextContent('Copied')
    expect(writeText).toHaveBeenCalledWith('support@useaviary.com')
  })
})
