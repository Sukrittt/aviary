'use client'

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { usePersistentState } from '../src/hooks/usePersistentState'
import { readPref, removePref, writePref } from '../src/lib/localPref'

/** The scheme actually painted. `null` until the browser has resolved one. */
export type Theme = 'light' | 'dark'
/** What the user chose. Matches Mobile's ThemePreference exactly. */
export type ThemePreference = Theme | 'system'
export type Density = 'comfortable' | 'compact'

interface AppearanceValue {
  /** Resolved scheme, or null before hydration — render no theme class then. */
  theme: Theme | null
  preference: ThemePreference
  density: Density
  /** Sets an explicit light/dark choice. For 'system', use setPreference. */
  setTheme: (t: Theme) => void
  setPreference: (p: ThemePreference) => void
  setDensity: (d: Density) => void
}

const AppearanceContext = createContext<AppearanceValue | null>(null)

// Same key and same default as Mobile's src/theme/pref.ts.
const PREF_KEY = 'mc-theme-pref'
const LEGACY_KEY = 'mc-theme'
const DEFAULT_THEME_PREFERENCE: ThemePreference = 'light'

function parsePreference(raw: string): ThemePreference {
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : DEFAULT_THEME_PREFERENCE
}

/**
 * The OS colour scheme as an external store, so it participates in rendering
 * without an effect. Only an explicitly saved 'system' choice uses it.
 */
function subscribeSystemScheme(onChange: () => void): () => void {
  const query = window.matchMedia('(prefers-color-scheme: dark)')
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function systemSchemeSnapshot(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = usePersistentState<ThemePreference>(
    PREF_KEY,
    DEFAULT_THEME_PREFERENCE,
    parsePreference,
    (value) => value,
  )
  const [density, setDensity] = usePersistentState<Density>(
    'mc-density',
    'comfortable',
    (raw) => (raw === 'compact' ? 'compact' : 'comfortable'),
    (value) => value,
  )

  const systemScheme = useSyncExternalStore(subscribeSystemScheme, systemSchemeSnapshot, () => null)

  // Light is the first-paint default. Stored choices are restored by the
  // preference store; an explicit 'system' choice follows the device.
  const theme: Theme | null = preference === 'system' ? systemScheme : preference

  // One-time migration off the old two-value key, which had no 'system' and
  // defaulted to dark. Without this, everyone who ever toggled the theme is
  // silently moved to the default on this release.
  useEffect(() => {
    const legacy = readPref(LEGACY_KEY)
    if (!legacy) return
    if (!readPref(PREF_KEY) && (legacy === 'light' || legacy === 'dark')) writePref(PREF_KEY, legacy)
    removePref(LEGACY_KEY)
  }, [])

  const value = useMemo(
    () => ({
      theme,
      preference,
      density,
      // Existing callers toggle between two values; that is an explicit
      // choice, so it lands on the preference rather than a separate slot.
      setTheme: (t: Theme) => setPreference(t),
      setPreference,
      setDensity,
    }),
    [theme, preference, density, setPreference, setDensity],
  )

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>
}

export function useAppearance(): AppearanceValue {
  const value = useContext(AppearanceContext)
  if (!value) throw new Error('useAppearance must be used within AppearanceProvider')
  return value
}
