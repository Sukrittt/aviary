import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { IosWaitlist } from './IosWaitlist'

afterEach(() => vi.unstubAllGlobals())

function join(email: string) {
  fireEvent.change(screen.getByLabelText('Email for the iPhone waitlist'), { target: { value: email } })
  fireEvent.click(screen.getByRole('button', { name: 'Join the iPhone waitlist' }))
}

describe('IosWaitlist', () => {
  it('posts the email and shows the joined state', async () => {
    const fetchMock = vi.fn(async () => new Response('{"ok":true}'))
    vi.stubGlobal('fetch', fetchMock)
    render(<IosWaitlist />)
    join('me@example.com')
    expect(await screen.findByRole('button', { name: 'You’re on the list' })).toBeDisabled()
    expect(fetchMock).toHaveBeenCalledWith('/api/waitlist', expect.objectContaining({
      body: JSON.stringify({ email: 'me@example.com', platform: 'ios' }),
    }))
  })

  it('shows a written error, not the server text, when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"rate limited"}', { status: 429 })))
    render(<IosWaitlist />)
    join('me@example.com')
    expect(await screen.findByText('Check your connection and try again.')).toBeInTheDocument()
    expect(screen.queryByText(/rate limited/)).not.toBeInTheDocument()
  })
})


it('uses the shared animated success beat before settling on the joined label', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{"ok":true}')))
  render(<IosWaitlist />)
  join('me@example.com')
  const tick = await screen.findByRole('img', { name: 'You’re on the list' })
  expect(tick.closest('button')).toHaveClass('is-success')
  expect(tick.querySelector('path')).toHaveAttribute('pathLength', '1')
  await waitFor(() => expect(screen.queryByRole('img', { name: 'You’re on the list' })).not.toBeInTheDocument(), { timeout: 2000 })
  expect(screen.getByRole('button', { name: 'You’re on the list' })).toBeDisabled()
})
