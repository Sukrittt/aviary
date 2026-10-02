import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BIRD_PATH } from '@/src/components/BirdMark'
import LegalLayout from './layout'

describe('legal page branding', () => {
  it('uses the shared Aviary bird and an accessible link home', () => {
    render(<LegalLayout><article>Legal document</article></LegalLayout>)

    const home = screen.getByRole('link', { name: 'Aviary home' })
    expect(home).toHaveAttribute('href', '/')
    expect(home.querySelector('svg path')).toHaveAttribute('d', BIRD_PATH)
    expect(home).not.toHaveTextContent('🕊️')
  })
})
