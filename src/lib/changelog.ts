export interface ChangelogContent {
  title: string
  version: string
  highlights: string[]
  body: string
}

export interface ChangelogRelease extends ChangelogContent {
  id: string
  publishedAt: string | null
}

export const CHANGELOG_LIMITS = { title: 80, version: 32, highlights: 3, highlight: 180, body: 5000 } as const

/** Plain text only: preview and published notes share the same rendering. */
export function parseChangelog(form: FormData): ChangelogContent | string {
  const title = String(form.get('title') ?? '').trim()
  const version = String(form.get('version') ?? '').trim()
  const highlights = String(form.get('highlights') ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const body = String(form.get('body') ?? '').trim()
  if (!title || title.length > CHANGELOG_LIMITS.title) return 'Add a title of 1–80 characters.'
  if (version.length > CHANGELOG_LIMITS.version) return 'Keep the version label under 33 characters.'
  if (!highlights.length || highlights.length > CHANGELOG_LIMITS.highlights || highlights.some((line) => line.length > CHANGELOG_LIMITS.highlight)) {
    return 'Add 1–3 highlights, one per line, up to 180 characters each.'
  }
  if (body.length > CHANGELOG_LIMITS.body) return 'Keep the full notes under 5,001 characters.'
  return { title, version, highlights, body }
}
