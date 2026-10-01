import type { MetadataRoute } from 'next'
import { publicPagePaths, SITE_URL } from '@/lib/seo'

export default function sitemap(): MetadataRoute.Sitemap {
  return publicPagePaths.map((path) => ({ url: new URL(path, SITE_URL).href }))
}
