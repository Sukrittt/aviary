import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/seo'

export default function robots(): MetadataRoute.Robots {
  return {
    // Allow crawlers to read each page's noindex directive; blocking private
    // URLs here can leave URL-only results in search indexes.
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/logout'] },
    sitemap: new URL('/sitemap.xml', SITE_URL).href,
  }
}
