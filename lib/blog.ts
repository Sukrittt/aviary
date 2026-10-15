import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ComponentType } from 'react'
import { seoMetadata, SITE_URL } from './seo'

/**
 * Blog posts are MDX files in content/blog, read at build time. The file name
 * is the URL slug, and each file exports its own `meta` (see docs/blog.md).
 */
export interface PostMeta {
  title: string
  description: string
  /** YYYY-MM-DD */
  published: string
  /** YYYY-MM-DD; same as published until the post is edited. */
  updated: string
  /** Other posts (/blog/slug) or site pages to link at the end. */
  related: string[]
  author?: string
}

export interface Post extends PostMeta { slug: string; path: string; readingMinutes: number; author: string }

const DIR = join(process.cwd(), 'content/blog')
const WORDS_PER_MINUTE = 200

export const AUTHOR = { name: 'Sukrit', bio: 'who builds Aviary', url: 'https://github.com/Sukrittt' }

export function postSlugs(): string[] {
  return readdirSync(DIR).filter((f) => f.endsWith('.mdx')).map((f) => f.slice(0, -4))
}

/** Words in the post body, without the `export const meta` block or markup. */
export function wordCount(source: string): number {
  const body = source.replace(/^export const meta = \{[\s\S]*?\n\}\n/m, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[#>*|`_-]/g, ' ')
  return body.split(/\s+/).filter(Boolean).length
}

export const readingMinutes = (source: string) => Math.max(1, Math.round(wordCount(source) / WORDS_PER_MINUTE))

async function load(slug: string): Promise<{ post: Post; Content: ComponentType }> {
  const mod = await import(`../content/blog/${slug}.mdx`) as { default: ComponentType; meta: PostMeta }
  const source = readFileSync(join(DIR, `${slug}.mdx`), 'utf8')
  return {
    Content: mod.default,
    post: { ...mod.meta, author: mod.meta.author ?? AUTHOR.name, slug, path: `/blog/${slug}`, readingMinutes: readingMinutes(source) },
  }
}

export const getPost = load

/** Every post, newest first. */
export async function allPosts(): Promise<Post[]> {
  const posts = await Promise.all(postSlugs().map(async (slug) => (await load(slug)).post))
  return posts.sort((a, b) => b.published.localeCompare(a.published) || a.title.localeCompare(b.title))
}

export function postMetadata(post: Post) {
  return seoMetadata({
    path: post.path,
    title: post.title,
    description: post.description,
    index: true,
    openGraph: { type: 'article', publishedTime: post.published, modifiedTime: post.updated, authors: [post.author] },
  })
}

export function articleJsonLd(post: Post) {
  const url = new URL(post.path, SITE_URL).href
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    datePublished: post.published,
    dateModified: post.updated,
    author: { '@type': 'Person', name: post.author, url: AUTHOR.url },
    publisher: { '@type': 'Organization', name: 'Aviary', logo: { '@type': 'ImageObject', url: new URL('/icon.png', SITE_URL).href } },
    image: new URL('/og.png', SITE_URL).href,
    mainEntityOfPage: url,
    url,
  }
}

/** Dates the way the rest of the site writes them: 15 October 2026. */
export const formatPostDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })

