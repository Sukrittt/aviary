import type { MetadataRoute } from 'next'
import { marketAlternates, publicPagePaths, SITE_URL } from '@/lib/seo'
import { allPosts } from '@/lib/blog'

const abs = (path: string) => new URL(path, SITE_URL).href

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = publicPagePaths.map((path) => {
    const languages = marketAlternates(path)
    return {
      url: abs(path),
      ...(languages && { alternates: { languages: Object.fromEntries(Object.entries(languages).map(([lang, p]) => [lang, abs(p)])) } }),
    }
  })
  // A new file in content/blog shows up here on the next build.
  const posts = (await allPosts()).map((post) => ({ url: abs(post.path), lastModified: post.updated }))
  return [...pages, ...posts]
}
