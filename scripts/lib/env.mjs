// Shared .env.local loader for the one-off scripts in this directory.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function loadEnv() {
  const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  try {
    const envPath = path.join(workspace, '.env.local')
    if (!fs.existsSync(envPath)) return
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      const value = trimmed.slice(eq + 1).trim()
      if (process.env[key] === undefined) process.env[key] = value
    }
  } catch {
    // ignore
  }
}

/** Parse `--flag value` / `--flag` argv pairs. */
export function args() {
  const out = {}
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue
    const key = argv[i].slice(2)
    const next = argv[i + 1]
    if (next && !next.startsWith('--')) {
      out[key] = next
      i++
    } else {
      out[key] = true
    }
  }
  return out
}

/** Base (non-demo) collections that hold per-user data. */
export const USER_COLLECTIONS = [
  'expenses',
  'budgets',
  'categories',
  'groups',
  'subscriptions',
  'holdings',
  'holding_events',
  'push_tokens',
  'category_map_overrides',
  'chat_sessions',
  'balance_checks',
]
