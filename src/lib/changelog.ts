export const CHANGELOG_PLATFORMS = ['web', 'mobile'] as const
export type ChangelogPlatform = (typeof CHANGELOG_PLATFORMS)[number]

export interface ChangelogContent {
  /** Which app the notes describe. Missing on releases from before Mobile had its own: those are web. */
  platform?: ChangelogPlatform
  title: string
  version: string
  highlights: string[]
  body: string
  /**
   * Mobile only: ISO time just before the OTA update that ships these notes. The app waits
   * until its running bundle was published at or after this, so nobody reads about a
   * feature they don't have yet. Null for store releases and web notes.
   */
  otaAfter?: string | null
}

export interface ChangelogRelease extends ChangelogContent {
  id: string
  publishedAt: string | null
}

export const CHANGELOG_LIMITS = { title: 80, version: 32, highlights: 3, highlight: 180, body: 5000 } as const

/** Plain text only: preview and published notes share the same rendering. */
export function parseChangelog(form: FormData): ChangelogContent | string {
  const platform = String(form.get('platform') ?? 'web')
  const title = String(form.get('title') ?? '').trim()
  const version = String(form.get('version') ?? '').trim()
  const highlights = String(form.get('highlights') ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const body = String(form.get('body') ?? '').trim()
  const rawOtaAfter = String(form.get('otaAfter') ?? '').trim()
  // The admin field is a zone-less datetime-local in UTC, like every admin date.
  const otaAfter = platform === 'mobile' && rawOtaAfter ? new Date(/(z|[+-]\d\d:\d\d)$/i.test(rawOtaAfter) ? rawOtaAfter : `${rawOtaAfter}Z`) : null
  if (!CHANGELOG_PLATFORMS.includes(platform as ChangelogPlatform)) return 'Choose web or mobile.'
  if (!title || title.length > CHANGELOG_LIMITS.title) return 'Add a title of 1–80 characters.'
  if (version.length > CHANGELOG_LIMITS.version) return 'Keep the version label under 33 characters.'
  if (!highlights.length || highlights.length > CHANGELOG_LIMITS.highlights || highlights.some((line) => line.length > CHANGELOG_LIMITS.highlight)) {
    return 'Add 1–3 highlights, one per line, up to 180 characters each.'
  }
  if (body.length > CHANGELOG_LIMITS.body) return 'Keep the full notes under 5,001 characters.'
  if (otaAfter && Number.isNaN(otaAfter.getTime())) return 'Pick a valid OTA update time.'
  return { platform: platform as ChangelogPlatform, title, version, highlights, body, otaAfter: otaAfter?.toISOString() ?? null }
}
