import { afterEach, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams('email=a%40b.com'),
}))
vi.mock('@/src/lib/analytics', () => ({ track: vi.fn() }))
vi.mock('@/src/lib/returnTo', () => ({ takeReturnTo: () => null }))
const { default: CodePage } = await import('./page')

afterEach(() => vi.unstubAllGlobals())

it("says the resend didn't go out when the request never reaches us", async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
  render(<CodePage />)
  fireEvent.click(screen.getByRole('button', { name: /Resend code/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't resend the code. Check your connection and try again.")
})

it("says the resend didn't go out when the server refuses", async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 429 })))
  render(<CodePage />)
  fireEvent.click(screen.getByRole('button', { name: /Resend code/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't resend the code. Try again in a moment.")
})
