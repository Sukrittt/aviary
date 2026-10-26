import { render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { CONTENT_SECTIONS } from '@/lib/content'
import { FooterSection } from './FooterSection'

const tools = CONTENT_SECTIONS.tools
afterEach(() => { document.cookie = 'aviary_market=; max-age=0; path=/' })

const links = () => screen.getAllByRole('link').map((a) => a.textContent ?? '')

it('lists every tool, rupee ones included, for India', () => {
  render(<FooterSection path={tools.path} label={tools.label} pages={tools.pages} />)
  expect(links().some((l) => l.includes('₹'))).toBe(true)
})

it.each([
  ['the market cookie', () => { document.cookie = 'aviary_market=intl; path=/' }, false],
  ['the /intl page', () => {}, true],
])('hides every rupee-only tool for intl visitors, from %s', (_, setup, intl) => {
  setup()
  render(<FooterSection path={tools.path} label={tools.label} pages={tools.pages} intl={intl} />)
  expect(links().filter((l) => l.includes('₹') || /salary/i.test(l))).toEqual([])
  expect(links()).toContain('Paycheck budget planner')
})
