import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OnboardingGate } from './OnboardingGate'

let mockPathname = '/'
const replace = vi.fn()
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ replace }),
}))

const fetchMock = vi.fn(() => new Promise<Response>(() => {}))
beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockImplementation(() => new Promise<Response>(() => {}))
  replace.mockClear()
  localStorage.clear()
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

  it('renders straight away for a browser that has seen this account onboarded, still checking in the background', async () => {
    mockPathname = '/expense'
    localStorage.setItem('aviary.onboarded', '1')
    render(<OnboardingGate><p>page</p></OnboardingGate>)
    expect(await screen.findByText('page')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith('/api/user')
  })

  it('remembers onboarding once the check confirms it', async () => {
    mockPathname = '/expense'
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ onboardedAt: '2026-01-01T00:00:00.000Z' })))
    render(<OnboardingGate><p>page</p></OnboardingGate>)
    expect(await screen.findByText('page')).toBeTruthy()
    expect(localStorage.getItem('aviary.onboarded')).toBe('1')
  })

  it('still sends a not-onboarded account to onboarding, and forgets the stale flag', async () => {
    mockPathname = '/expense'
    localStorage.setItem('aviary.onboarded', '1')
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ onboardedAt: null })))
    render(<OnboardingGate><p>page</p></OnboardingGate>)
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/onboarding'))
    expect(localStorage.getItem('aviary.onboarded')).toBeNull()
  })

  it.each(['/sign-in', '/email', '/code'])('forgets the flag on %s, so the next account to sign in gets a full check', (path) => {
    mockPathname = path
    localStorage.setItem('aviary.onboarded', '1')
    render(<OnboardingGate><p>page</p></OnboardingGate>)
    expect(localStorage.getItem('aviary.onboarded')).toBeNull()
  })
})
