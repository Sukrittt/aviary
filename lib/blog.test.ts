// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { pages } from './seo'
import { allPosts, articleJsonLd, getPost, isLive, postLinks, postMetadata, postSlugs, readingMinutes, todayInIndia, wordCount } from './blog'
import { GET as rss } from '@/app/(site)/blog/rss.xml/route'
import BlogPostPage from '@/app/(site)/blog/[slug]/page'

const words = (slug: string) => wordCount(readFileSync(join(process.cwd(), 'content/blog', `${slug}.mdx`), 'utf8'))

describe('blog posts', () => {
  it('404 until their published date', async () => {
    for (const post of (await allPosts({ scheduled: true })).filter((p) => !isLive(p))) {
      await expect(BlogPostPage({ params: Promise.resolve({ slug: post.slug }) })).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/)
    }
    await expect(BlogPostPage({ params: Promise.resolve({ slug: 'no-such-post' }) })).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/)
  })

  it('link from other pages with their real title and description, only once they are live', async () => {
    const posts = await allPosts({ scheduled: true })
    const live = posts.filter((p) => isLive(p))
    expect(postLinks(...posts.map((p) => p.slug))).toEqual(live.map((p) => ({ href: p.path, label: p.title, description: p.description })))
    expect(live.length).toBeLessThan(posts.length)
  })

  it('each have complete frontmatter, 1,200 to 2,000 words, and related links that exist', async () => {
    const slugs = postSlugs()
    for (const post of await allPosts({ scheduled: true })) {
      expect(post.title.length, post.slug).toBeLessThanOrEqual(80)
      expect(post.description.length, post.slug).toBeGreaterThanOrEqual(70)
      expect(post.description.length, post.slug).toBeLessThanOrEqual(160)
      expect(post.published).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(post.updated >= post.published, post.slug).toBe(true)
      expect(words(post.slug), post.slug).toBeGreaterThanOrEqual(1200)
      expect(words(post.slug), post.slug).toBeLessThanOrEqual(2000)
      for (const href of post.related) {
        expect(href.startsWith('/blog/') ? slugs.includes(href.slice(6)) : href in pages, `${post.slug} → ${href}`).toBe(true)
      }
    }
  })

  it('only link to posts published on or before their own date, so nothing links to a post that isn’t live yet', async () => {
    const posts = await allPosts({ scheduled: true })
    const date = Object.fromEntries(posts.map((p) => [p.slug, p.published]))
    for (const post of posts) {
      const body = readFileSync(join(process.cwd(), 'content/blog', `${post.slug}.mdx`), 'utf8')
      const linked = [...post.related, ...[...body.matchAll(/\]\((\/blog\/[^)#\s]+)/g)].map((m) => m[1])].filter((h) => h.startsWith('/blog/'))
      for (const href of linked) expect(date[href.slice(6)] <= post.published, `${post.slug} → ${href}`).toBe(true)
    }
  })

  it('go live at midnight in India on their published date', () => {
    expect(todayInIndia(new Date('2026-10-18T18:29:00Z'))).toBe('2026-10-18')
    expect(todayInIndia(new Date('2026-10-18T18:30:00Z'))).toBe('2026-10-19')
    const post = { published: '2026-10-19' } as Parameters<typeof isLive>[0]
    expect(isLive(post, new Date('2026-10-18T18:29:00Z'))).toBe(false)
    expect(isLive(post, new Date('2026-10-18T18:30:00Z'))).toBe(true)
  })

  it('keep "envelope budgeting" in the copy and no em dashes', () => {
    const all = postSlugs().map((s) => readFileSync(join(process.cwd(), 'content/blog', `${s}.mdx`), 'utf8')).join('\n')
    expect(all.toLowerCase()).toContain('envelope budgeting')
    expect(all).not.toContain('—')
  })

  it('counts reading time from the body, not the meta block', () => {
    expect(readingMinutes('export const meta = {\n  title: "x"\n}\n\n' + 'word '.repeat(1000))).toBe(5)
  })

  it('render server-side with a byline, dates, reading time, Article JSON-LD and links to tools', async () => {
    const html = renderToStaticMarkup(await BlogPostPage({ params: Promise.resolve({ slug: 'envelope-budgeting-upi' }) }))
    expect(html.match(/<h1/g)).toHaveLength(1)
    expect(html).toContain('<a href="https://github.com/Sukrittt" rel="author noreferrer" target="_blank">Sukrit</a>')
    expect(html).toContain('aria-label="Share on WhatsApp"')
    expect(html).toContain('<time dateTime="2026-10-15">15 October 2026</time>')
    expect(html).toMatch(/\d+ min read/)
    expect(html).toContain('<table>')
    expect(html).toContain('href="/tools/salary-budget-planner"')
    expect(html).toContain('href="/blog/zero-based-budgeting-salary-india"')
    const ld = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]))
    expect(ld.map((d) => d['@type'])).toEqual(['BreadcrumbList', 'Article'])
  })

  it('get article metadata with a canonical URL and an RSS link', async () => {
    const { post } = await getPost('first-salary-budget')
    const meta = postMetadata(post)
    expect(meta.alternates?.canonical).toBe('https://www.useaviary.com/blog/first-salary-budget')
    expect(meta.alternates?.types).toHaveProperty('application/rss+xml')
    expect(meta.openGraph).toMatchObject({ type: 'article', publishedTime: post.published })
    expect(articleJsonLd(post)).toMatchObject({ '@type': 'Article', author: { name: 'Sukrit' }, mainEntityOfPage: 'https://www.useaviary.com/blog/first-salary-budget' })
  })

  it('all go in the RSS feed once live, and scheduled ones stay out', async () => {
    const xml = await (await rss()).text()
    for (const post of await allPosts({ scheduled: true })) expect(xml.includes(`<link>https://www.useaviary.com${post.path}</link>`), post.slug).toBe(isLive(post))
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;)/)
  })
})
