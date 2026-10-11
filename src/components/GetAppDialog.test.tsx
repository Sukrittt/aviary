import { afterEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { GetAppDialog } from './GetAppDialog'
import { PLAY_STORE_URL } from './billing/copy'

vi.mock('../lib/analytics', () => ({ track: vi.fn() }))
afterEach(() => vi.unstubAllGlobals())

it('offers Google Play and joins the iPhone waitlist with the account email', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true })
  vi.stubGlobal('fetch', fetchMock)
  render(<GetAppDialog email="a@b.co" onClose={() => {}} />)
  expect(screen.getByRole('link', { name: /Open Google Play/ })).toHaveAttribute('href', PLAY_STORE_URL)
  expect(screen.queryByLabelText('Email for the iPhone waitlist')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Join the iPhone waitlist' }))
  expect(await screen.findAllByText('You’re on the list')).not.toHaveLength(0)
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: 'a@b.co', platform: 'ios' })
})

it('closes from the Close button and Escape', () => {
  const onClose = vi.fn()
  render(<GetAppDialog onClose={onClose} />)
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  expect(onClose).toHaveBeenCalledTimes(2)
})
