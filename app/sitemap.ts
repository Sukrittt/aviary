import type { MetadataRoute } from 'next'
import { marketAlternates, publicPagePaths, SITE_URL } from '@/lib/seo'

const abs = (path: string) => new URL(path, SITE_URL).href

export default function sitemap(): MetadataRoute.Sitemap {
  return publicPagePaths.map((path) => {
    const languages = marketAlternates(path)
    return {
      url: abs(path),
      ...(languages && { alternates: { languages: Object.fromEntries(Object.entries(languages).map(([lang, p]) => [lang, abs(p)])) } }),
    }
  })
}
