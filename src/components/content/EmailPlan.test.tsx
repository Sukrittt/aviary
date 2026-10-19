import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { EmailPlan } from './EmailPlan'
import { track } from '../../lib/analytics'

vi.mock('../../lib/analytics', () => ({ track: vi.fn() }))
afterEach(() => { vi.unstubAllGlobals(); vi.mocked(track).mockClear() })

function send(email: string) {
  fireEvent.change(screen.getByLabelText('Email for your plan'), { target: { value: email } })
  fireEvent.click(screen.getByRole('button', { name: 'Email me this plan' }))
}

it('posts the salary and rent, not the rows, and confirms', async () => {
  const fetchMock = vi.fn(async () => new Response('{"ok":true}'))
  vi.stubGlobal('fetch', fetchMock)
  render(<EmailPlan salary={50000} rent={null} />)
  send('me@example.com')
  expect(await screen.findByText('Check your inbox. Tips only follow if you ask for them in that email.')).toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledWith('/api/leads', expect.objectContaining({ body: JSON.stringify({ email: 'me@example.com', salary: 50000, rent: null }) }))
  expect(track).toHaveBeenCalledWith('plan_emailed', { placement: 'tool_salary_planner' })
})

it('writes its own error instead of showing the server’s', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"rate limited"}', { status: 429 })))
  render(<EmailPlan salary={50000} rent={12000} />)
  send('me@example.com')
  expect(await screen.findByText('Check your connection and try again.')).toBeInTheDocument()
})
