// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { pages } from './seo'
import { allPosts, articleJsonLd, getPost, postMetadata, postSlugs, readingMinutes, wordCount } from './blog'
import { GET as rss } from '@/app/(site)/blog/rss.xml/route'
import BlogPostPage from '@/app/(site)/blog/[slug]/page'

const words = (slug: string) => wordCount(readFileSync(join(process.cwd(), 'content/blog', `${slug}.mdx`), 'utf8'))

describe('blog posts', () => {
  it('each have complete frontmatter, 1,200 to 2,000 words, and related links that exist', async () => {
    const slugs = postSlugs()
    for (const post of await allPosts()) {
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
    expect(html).toContain('By <a href="https://github.com/Sukrittt"')
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

  it('all go in the RSS feed', async () => {
    const xml = await (await rss()).text()
    for (const slug of postSlugs()) expect(xml).toContain(`<link>https://www.useaviary.com/blog/${slug}</link>`)
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;)/)
  })
})
