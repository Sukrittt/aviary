import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OnboardingGate } from './OnboardingGate'

let mockPathname = '/'
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ replace: vi.fn() }),
}))

const fetchMock = vi.fn(() => new Promise<Response>(() => {}))
beforeEach(() => {
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
})

describe('OnboardingGate', () => {
  it.each(['/legal/privacy', '/legal/terms', '/'])('renders public page %s straight away, without asking for the user', (path) => {
    mockPathname = path
    render(<OnboardingGate><p>page</p></OnboardingGate>)
    expect(screen.getByText('page')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('holds an app page until the onboarding check answers', () => {
    mockPathname = '/expense'
    render(<OnboardingGate><p>page</p></OnboardingGate>)
    expect(screen.queryByText('page')).toBeNull()
    expect(fetchMock).toHaveBeenCalledWith('/api/user')
  })
})
