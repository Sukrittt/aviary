import { timingSafeEqual, createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { json } from '@/lib/http'
import { allPosts, todayInIndia } from '@/lib/blog'
import { SITE_URL } from '@/lib/seo'

export const dynamic = 'force-dynamic'

/** Constant-time comparison, normalizing length via SHA-256. Copied from notifications/run/route.ts. */
function safeEqual(a: string, b: string): boolean {
  const ah = createHash('sha256').update(a).digest()
  const bh = createHash('sha256').update(b).digest()
  return timingSafeEqual(ah, bh)
}

/**
 * Daily cron, 00:30 to 01:29 IST (Hobby picks the minute): puts the posts going live today online. A scheduled
 * post's 404 is cached like any ISR page, so without this the first visitor
 * after midnight, often Googlebot following the sitemap, got the stale 404
 * (sinking-funds-india, 26 Oct). Revalidates the post, the blog index, RSS and
 * the sitemap, then loads each post once so the fresh page is cached first.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const header = req.headers.get('authorization')
  if (!secret || !header || !safeEqual(header, `Bearer ${secret}`)) {
    return json({ error: 'unauthorized' }, { status: 401 })
  }

  const today = todayInIndia()
  const posts = (await allPosts()).filter((p) => p.published === today)
  if (posts.length) for (const path of ['/blog', '/blog/rss.xml', '/sitemap.xml', ...posts.map((p) => p.path)]) revalidatePath(path)
  await Promise.all(posts.map((p) => fetch(new URL(p.path, SITE_URL), { cache: 'no-store' }).catch(() => null)))
  return json({ ok: true, published: posts.map((p) => p.path) })
}
