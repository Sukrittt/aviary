// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import sitemap from '@/app/sitemap'
import robots from '@/app/robots'
import { pageMetadata, pages, SITE_URL, type PagePath } from './seo'

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
      expect(canonical.origin).toBe('https://useaviary.com')
      expect(canonical.search).toBe('')
      expect(canonical.href).not.toContain('[id]')
      expect(metadata.openGraph).toMatchObject({ title, description: metadata.description, url: canonical.href })
      expect(metadata.twitter).toMatchObject({ title, description: metadata.description })
    }
  })

  it('indexes only public content and keeps all financial, auth and admin pages private', () => {
    const publicPaths = ['/', '/legal/privacy', '/legal/terms', '/legal/delete-account']
    for (const path of Object.keys(pages) as PagePath[]) {
      expect(pageMetadata(path).robots).toMatchObject({ index: publicPaths.includes(path) })
    }
    expect(sitemap().map((entry) => entry.url).sort())
      .toEqual(publicPaths.map((path) => new URL(path, SITE_URL).href).sort())
    expect(robots()).toMatchObject({
      rules: { userAgent: '*', allow: '/' },
      sitemap: 'https://useaviary.com/sitemap.xml',
    })
  })
})
