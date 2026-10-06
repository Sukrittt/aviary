import { describe, it, expect, vi } from 'vitest'
import { act } from 'react'
import { renderToString } from 'react-dom/server'
import { hydrateRoot } from 'react-dom/client'
import { AllocationBar } from './AllocationBar'

// /expense is server-rendered, and this bar sits in its subscriptions panel.
// A hydration mismatch makes React throw the server HTML away and rebuild the
// whole page on the client, which shows up as a late repaint (and LCP).
describe('AllocationBar hydration', () => {
  it('hydrates the server HTML without a mismatch', async () => {
    const segments = [
      { label: 'News App', value: 485, color: 'var(--blue)' },
      { label: 'Video Stream', value: 242, color: 'var(--green)' },
    ]
    const container = document.createElement('div')
    container.innerHTML = renderToString(<AllocationBar segments={segments} />)
    const onRecoverableError = vi.fn()
    await act(async () => {
      hydrateRoot(container, <AllocationBar segments={segments} />, { onRecoverableError })
    })
    expect(onRecoverableError).not.toHaveBeenCalled()
    expect(container.querySelector('rect.ins-allocation-segment title')?.textContent).toBe('News App · 66.7%')
  })
})
