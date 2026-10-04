import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChangelogAnnouncement } from './ChangelogAnnouncement'

let identity: { id: string } | null
let pathname: string
let brainOpen: boolean
let seen: boolean
const release = { id: 'a'.repeat(24), title: 'Faster expense logging', version: 'v1.2', highlights: ['Log an expense in fewer taps'], body: 'Full details', publishedAt: '2026-10-03T00:00:00Z' }
const fetchMock = vi.fn()
vi.mock('@workos-inc/authkit-nextjs/components', () => ({ useAuth: () => ({ user: identity }) }))
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))
vi.mock('./MoneyBrainProvider', () => ({ useMoneyBrain: () => ({ isMoneyBrainOpen: brainOpen }) }))

function mount(strict = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  const tree = () => <QueryClientProvider client={client}>{strict ? <StrictMode><ChangelogAnnouncement /></StrictMode> : <ChangelogAnnouncement />}</QueryClientProvider>
  const view = render(tree())
  return { ...view, refresh: () => view.rerender(tree()), client }
}
const claims = () => fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST')

beforeEach(() => {
  identity = { id: 'user_1' }; pathname = '/expense'; brainOpen = false; seen = false
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (_url, options) => {
    const available = !seen
    if (options?.method === 'POST') seen = true
    return { ok: true, json: async () => ({ release: available ? release : null }) }
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllGlobals(); document.querySelectorAll('[data-test-modal]').forEach((modal) => modal.remove()) })

describe('release announcements', () => {
  it('shows once under StrictMode, links to the archive, and stays dismissed on remount', async () => {
    const first = mount(true)
    await waitFor(() => expect(screen.getByText(release.title)).toBeVisible())
    expect(claims()).toHaveLength(1)
    expect(screen.getByRole('link', { name: /View changelog/ })).toHaveAttribute('href', `/account/changelog#release-${release.id}`)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss update' }))
    // It stays mounted through the exit transition, then disappears.
    expect(screen.getByText(release.title)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText(release.title)).toBeNull())
    first.unmount(); first.client.clear()
    const second = mount()
    await waitFor(() => expect(fetchMock.mock.calls.filter(([, options]) => !options?.method)).toHaveLength(2))
    expect(screen.queryByText(release.title)).toBeNull()
    expect(claims()).toHaveLength(1)
    second.client.clear()
  })

  it('waits for an existing modal, then pauses the card when another modal opens', async () => {
    const modal = document.createElement('div')
    modal.setAttribute('aria-modal', 'true'); modal.setAttribute('data-test-modal', '')
    document.body.appendChild(modal)
    const view = mount()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(claims()).toHaveLength(0)
    await act(async () => modal.remove())
    await waitFor(() => expect(screen.getByText(release.title)).toBeVisible())
    await act(async () => document.body.appendChild(modal))
    await waitFor(() => expect(screen.queryByText(release.title)).toBeNull())
    await act(async () => modal.remove())
    await waitFor(() => expect(screen.getByText(release.title)).toBeVisible())
    expect(claims()).toHaveLength(1)
    view.client.clear()
  })

  it('does not consume the update in a background tab or while Ask Aviary is open', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    brainOpen = true
    const view = mount()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(claims()).toHaveLength(0)
    await act(async () => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(claims()).toHaveLength(0)
    brainOpen = false; view.refresh()
    await waitFor(() => expect(screen.getByText(release.title)).toBeVisible())
    view.client.clear()
  })

  it.each(['/onboarding', '/admin/changelog', '/sign-in', '/account/trial-notice', '/account/guided-tour', '/account/changelog'])('stays quiet on %s', async (path) => {
    pathname = path
    const view = mount()
    await act(async () => {})
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByText(release.title)).toBeNull()
    view.client.clear()
  })

  it('does not fetch while signed out and hides the previous account’s card immediately', async () => {
    identity = null
    const view = mount()
    expect(fetchMock).not.toHaveBeenCalled()
    identity = { id: 'user_1' }; view.refresh()
    await waitFor(() => expect(screen.getByText(release.title)).toBeVisible())
    identity = { id: 'user_2' }; view.refresh()
    expect(screen.queryByText(release.title)).toBeNull()
    await act(async () => {})
    view.client.clear()
  })

  it('does not show when another device wins the claim or recording fails', async () => {
    fetchMock.mockImplementation(async (_url, options) => ({ ok: true, json: async () => ({ release: options?.method === 'POST' ? null : release }) }))
    const otherDevice = mount()
    await waitFor(() => expect(claims()).toHaveLength(1))
    await act(async () => {})
    expect(screen.queryByText(release.title)).toBeNull()
    otherDevice.unmount(); otherDevice.client.clear()
    fetchMock.mockImplementation(async (_url, options) => ({ ok: options?.method !== 'POST', json: async () => ({ release }) }))
    const failure = mount()
    await waitFor(() => expect(claims()).toHaveLength(2))
    await act(async () => {})
    expect(screen.queryByText(release.title)).toBeNull()
    failure.client.clear()
  })
})
