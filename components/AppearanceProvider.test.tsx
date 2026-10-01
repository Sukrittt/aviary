import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { AppearanceProvider, useAppearance } from './AppearanceProvider'
import { clearLocalPrefs } from '@/src/lib/localPref'

function Probe() {
  const { preference, theme, setPreference } = useAppearance()
  return <><output>{preference}:{theme ?? 'unresolved'}</output><button onClick={() => setPreference('dark')}>Dark</button><button onClick={() => setPreference('system')}>System</button></>
}

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
})

it('defaults to light even on a dark-mode device', () => {
  render(<AppearanceProvider><Probe /></AppearanceProvider>)
  expect(screen.getByRole('status')).toHaveTextContent('light:light')
  expect(localStorage.getItem('mc-theme-pref')).toBeNull()
})

it('renders the default light palette on the server', () => {
  expect(renderToString(<AppearanceProvider><Probe /></AppearanceProvider>)).toContain('light<!-- -->:<!-- -->light')
})

it.each([['dark', 'dark'], ['system', 'dark'], ['invalid', 'light']])('restores %s as %s without replacing the preference', (preference, theme) => {
  localStorage.setItem('mc-theme-pref', preference)
  render(<AppearanceProvider><Probe /></AppearanceProvider>)
  expect(screen.getByRole('status')).toHaveTextContent(`${preference === 'invalid' ? 'light' : preference}:${theme}`)
  expect(localStorage.getItem('mc-theme-pref')).toBe(preference)
})

it('still lets people choose dark or system', () => {
  render(<AppearanceProvider><Probe /></AppearanceProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Dark' }))
  expect(screen.getByRole('status')).toHaveTextContent('dark:dark')
  expect(localStorage.getItem('mc-theme-pref')).toBe('dark')
  fireEvent.click(screen.getByRole('button', { name: 'System' }))
  expect(screen.getByRole('status')).toHaveTextContent('system:dark')
  expect(localStorage.getItem('mc-theme-pref')).toBe('system')
})

it('keeps a saved appearance choice through logout', () => {
  localStorage.setItem('mc-theme-pref', 'dark')
  clearLocalPrefs()
  expect(localStorage.getItem('mc-theme-pref')).toBe('dark')
})

it('retains an older saved dark choice during migration', () => {
  localStorage.setItem('mc-theme', 'dark')
  render(<AppearanceProvider><Probe /></AppearanceProvider>)
  expect(screen.getByRole('status')).toHaveTextContent('dark:dark')
  expect(localStorage.getItem('mc-theme-pref')).toBe('dark')
})
