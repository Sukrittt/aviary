import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ChangelogPreviewProvider, ReplayChangelogPreview } from './ChangelogPreview'

const release = { id: 'release_1', title: 'Web plans', version: 'v1.4.0', highlights: ['Subscribe on the web'], body: '', publishedAt: '2026-10-03T00:00:00Z' }
const fetch = vi.fn()
beforeEach(() => { fetch.mockReset(); vi.stubGlobal('fetch', fetch) })
afterEach(() => vi.unstubAllGlobals())

it('replays a dismissed preview locally without recording a seen flag or navigating', async () => {
  render(<ChangelogPreviewProvider><ReplayChangelogPreview release={release} /></ChangelogPreviewProvider>)
  expect(screen.queryByRole('complementary')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Replay preview: Web plans' }))
  await waitFor(() => expect(screen.getByText(release.title)).toBeVisible())
  expect(screen.queryByRole('link', { name: /View changelog/ })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss update' }))
  expect(screen.getByText(release.title)).toBeInTheDocument()
  await waitFor(() => expect(screen.queryByText(release.title)).toBeNull())
  fireEvent.click(screen.getByRole('button', { name: 'Replay preview: Web plans' }))
  await waitFor(() => expect(screen.getByText(release.title)).toBeVisible())
  expect(fetch).not.toHaveBeenCalled()
})
