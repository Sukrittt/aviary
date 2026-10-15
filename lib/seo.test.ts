// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import sitemap from '@/app/sitemap'
import robots from '@/app/robots'
import { pageMetadata, pages, publicPagePaths, SITE_URL, type PagePath } from './seo'
import { CONTENT_SECTIONS } from './content'
import { postSlugs } from './blog'

function pageFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = join(dir, entry.name)
    return entry.isDirectory() ? pageFiles(file) : entry.name === 'page.tsx' ? [file] : []
  })
}

describe('site metadata', () => {
  it('covers every page with server-rendered metadata, including client pages', () => {
    for (const file of pageFiles(join(process.cwd(), 'app'))) {
      const route = '/' + relative(join(process.cwd(), 'app'), file)
        .split('/').filter((part) => !part.startsWith('(') && part !== 'page.tsx').join('/')
      const path = route === '/privacy-policy' ? '/legal/privacy' : route
      // Blog posts are files, not entries in `pages`: their route builds metadata from each post.
      if (path === '/blog/[slug]') {
        expect(readFileSync(file, 'utf8')).toContain('return postMetadata(')
        continue
      }
      expect(pages, `${route} needs its own metadata`).toHaveProperty(path)
      const source = readFileSync(file, 'utf8')
      const metadataSource = source.startsWith("'use client'") || source.startsWith('"use client"')
        ? readFileSync(file.replace('page.tsx', 'layout.tsx'), 'utf8')
        : source
      expect(metadataSource, `${route} must emit metadata on the server`)
        .toContain(`export const metadata = pageMetadata('${path}')`)
    }
  })

  it('gives each page a unique title and matching social metadata on the production domain', () => {
    const titles = new Set<string>()
    for (const path of Object.keys(pages) as PagePath[]) {
      const metadata = pageMetadata(path)
      const title = metadata.title as string
      expect(titles.has(title), `${path} should have a unique title`).toBe(false)
      titles.add(title)
      expect(metadata.description).toBeTruthy()
      const canonical = new URL(metadata.alternates!.canonical as string)
      expect(canonical.origin).toBe('https://www.useaviary.com')
      expect(canonical.search).toBe('')
      expect(canonical.href).not.toContain('[id]')
      expect(metadata.openGraph).toMatchObject({ title, description: metadata.description, url: canonical.href })
      expect(metadata.twitter).toMatchObject({ title, description: metadata.description })
    }
  })

  it('indexes only public content and keeps all financial, auth and admin pages private', async () => {
    const contentPaths = Object.values(CONTENT_SECTIONS).flatMap((s) => [s.path, ...s.pages.map(([p]) => p)])
    expect(contentPaths).toHaveLength(26)
    const publicPaths = ['/', '/intl', '/changelog', '/help', ...contentPaths, '/legal/privacy', '/legal/terms', '/legal/pricing', '/legal/refunds', '/legal/contact', '/legal/delete-account']
    for (const path of Object.keys(pages) as PagePath[]) {
      expect(pageMetadata(path).robots).toMatchObject({ index: publicPaths.includes(path) })
    }
    const postPaths = postSlugs().map((slug) => `/blog/${slug}`)
    expect(postPaths.length).toBeGreaterThanOrEqual(4)
    expect((await sitemap()).map((entry) => entry.url).sort())
      .toEqual([...publicPaths, ...postPaths].map((path) => new URL(path, SITE_URL).href).sort())
    expect(robots()).toMatchObject({
      rules: { userAgent: '*', allow: '/' },
      sitemap: 'https://www.useaviary.com/sitemap.xml',
    })
  })

  it('links / (India) and /intl as hreflang alternates, in metadata and the sitemap', async () => {
    const languages = { 'en-IN': '/', en: '/intl', 'x-default': '/' }
    expect(pageMetadata('/').alternates).toEqual({ canonical: 'https://www.useaviary.com/', languages })
    expect(pageMetadata('/intl').alternates).toEqual({ canonical: 'https://www.useaviary.com/intl', languages })
    expect(pageMetadata('/help').alternates).toEqual({ canonical: 'https://www.useaviary.com/help' })
    const absolute = { 'en-IN': 'https://www.useaviary.com/', en: 'https://www.useaviary.com/intl', 'x-default': 'https://www.useaviary.com/' }
    for (const url of ['https://www.useaviary.com/', 'https://www.useaviary.com/intl']) {
      expect((await sitemap()).find((entry) => entry.url === url)?.alternates).toEqual({ languages: absolute })
    }
    expect((await sitemap()).find((entry) => entry.url === 'https://www.useaviary.com/help')).not.toHaveProperty('alternates')
  })

  it('gives public pages keyword titles, search-length descriptions and a large share card', () => {
    expect(pageMetadata('/').title).toBe('Aviary: Budget App & Expense Tracker for India')
    expect(pageMetadata('/expense').title).toBe('Aviary | Budget Dashboard')
    for (const path of publicPagePaths) {
      const { title, description, openGraph, twitter } = pageMetadata(path)
      expect((title as string).length, `${path} title`).toBeLessThanOrEqual(65)
      expect(description!.length, `${path} description`).toBeGreaterThanOrEqual(70)
      expect(description!.length, `${path} description`).toBeLessThanOrEqual(160)
      expect(description, `${path} description`).not.toContain('—')
      expect(openGraph?.images).toEqual([expect.objectContaining({ url: path === '/' || path === '/intl' ? '/og.png' : `/og${path}`, width: 1200, height: 630 })])
      expect(twitter).toMatchObject({ card: 'summary_large_image' })
    }
    // Private pages never get a card of their own.
    expect(pageMetadata('/expense').openGraph?.images).toEqual([expect.objectContaining({ url: '/og.png' })])
  })
})
