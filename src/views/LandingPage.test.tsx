import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LandingPage } from './LandingPage'

vi.mock('../lib/analytics', () => ({ track: vi.fn() }))
vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} })

describe('LandingPage', () => {
  it('shows Android visitors the Play Store, not the hero waitlist', () => {
    render(<LandingPage />)
    expect(screen.getAllByRole('link', { name: /Get it on Android/ })).toHaveLength(2)
    expect(screen.getAllByLabelText('Email for the iPhone waitlist')).toHaveLength(1)
  })

  it('hides the iPhone waitlist from Android visitors', () => {
    render(<LandingPage android />)
    expect(screen.getAllByRole('link', { name: /Get it on Android/ })).toHaveLength(2)
    expect(screen.queryByLabelText('Email for the iPhone waitlist')).not.toBeInTheDocument()
  })

  it('swaps every Play Store CTA for the waitlist on iPhone', () => {
    render(<LandingPage ios />)
    expect(screen.queryByRole('link', { name: /Get it on Android|Get the app/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Join waitlist' })).toHaveAttribute('href', '#top')
    expect(screen.getAllByLabelText('Email for the iPhone waitlist')).toHaveLength(2)
  })
})
