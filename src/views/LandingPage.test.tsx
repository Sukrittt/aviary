import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LandingPage } from './LandingPage'

vi.mock('../lib/analytics', () => ({ track: vi.fn() }))
vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} })

describe('LandingPage', () => {
  it('opens with the day 3 arc, then the fixes', () => {
    render(<LandingPage />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('It notices your 4pm chai and nudges you to log it.')
    const h2s = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(h2s.indexOf('You know how it goes.')).toBeLessThan(h2s.indexOf('It already knows your Friday cab.'))
  })

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
    expect(screen.getByRole('link', { name: 'Use it on the web today' })).toHaveClass('lp-button--dark')
  })

  it.each([{}, { ios: true }, { android: true }])('puts a web app button in the hero for %o', (props) => {
    render(<LandingPage {...props} />)
    expect(screen.getByRole('link', { name: 'Use it on the web today' })).toHaveAttribute('href', '/expense')
  })
  it('points desktop visitors to the iPhone waitlist from the hero', () => {
    render(<LandingPage />)
    expect(screen.getByRole('link', { name: 'Join the waitlist' })).toHaveAttribute('href', '#get')
  })

  it.each([{ ios: true }, { android: true }])('leaves the hero waitlist link off for %o', (props) => {
    render(<LandingPage {...props} />)
    expect(screen.queryByRole('link', { name: 'Join the waitlist' })).not.toBeInTheDocument()
  })
})
