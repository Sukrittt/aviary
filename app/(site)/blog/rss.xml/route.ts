import { allPosts } from '@/lib/blog'
import { SITE_URL } from '@/lib/seo'

// Rebuilt hourly so scheduled posts appear on their date.
export const revalidate = 3600

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export async function GET() {
  const posts = await allPosts()
  const items = posts.map((p) => {
    const url = esc(new URL(p.path, SITE_URL).href)
    return `<item><title>${esc(p.title)}</title><link>${url}</link><guid>${url}</guid><description>${esc(p.description)}</description><pubDate>${new Date(`${p.published}T00:00:00Z`).toUTCString()}</pubDate></item>`
  }).join('')
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>Aviary Blog</title><link>${new URL('/blog', SITE_URL).href}</link><atom:link href="${new URL('/blog/rss.xml', SITE_URL).href}" rel="self" type="application/rss+xml"/><description>Plain guides to budgeting in India.</description><language>en-IN</language>${items}</channel></rss>`
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } })
}
