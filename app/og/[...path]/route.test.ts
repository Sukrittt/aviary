// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { pages, type PagePath } from '@/lib/seo'
import { postSlugs } from '@/lib/blog'
import { GET, generateStaticParams } from './route'

describe('per-page share cards', () => {
  it('render one for every indexed page and post, and none for the home pages or the app', async () => {
    const paths = (await generateStaticParams()).map(({ path }) => `/${path.join('/')}`)
    const indexed = (Object.keys(pages) as PagePath[]).filter((p) => 'index' in pages[p] && pages[p].index)
    expect(paths.sort()).toEqual([...indexed.filter((p) => p !== '/' && p !== '/intl'), ...postSlugs().map((s) => `/blog/${s}`)].sort())
  })

  it('serve a PNG', async () => {
    const res = await GET(new Request('https://www.useaviary.com/og/compare/axio'), { params: Promise.resolve({ path: ['compare', 'axio'] }) })
    expect(res.headers.get('content-type')).toBe('image/png')
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(10_000)
  })
})
