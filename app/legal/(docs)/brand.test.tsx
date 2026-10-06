import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BIRD_PATH } from '@/src/components/BirdMark'
import LegalLayout from './layout'

vi.mock('next/navigation', () => ({ usePathname: () => '/legal/terms' }))

describe('legal page shell', () => {
  it('wears the landing header: the shared Aviary bird and an accessible link home', () => {
    render(<LegalLayout><article>Legal document</article></LegalLayout>)

    const home = screen.getByRole('link', { name: 'Aviary home' })
    expect(home).toHaveAttribute('href', '/')
    expect(home.querySelector('svg path')).toHaveAttribute('d', BIRD_PATH)
    expect(home).not.toHaveTextContent('🕊️')
  })

  it('marks the current legal page in the pills and keeps the others reachable', () => {
    render(<LegalLayout><article>Legal document</article></LegalLayout>)

    const nav = screen.getByRole('navigation', { name: 'Legal pages' })
    expect(nav.querySelector('[aria-current="page"]')).toHaveTextContent('Terms')
    expect(nav.querySelectorAll('a')).toHaveLength(6)
    expect(screen.getByRole('navigation', { name: 'Footer' })).toBeInTheDocument()
  })
})
