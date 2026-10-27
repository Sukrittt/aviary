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

export const AUTHOR = { name: 'Sukrit', bio: 'Founder, builds Aviary', url: 'https://github.com/Sukrittt' }

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

/** Today's date in India. A post goes live at midnight IST on its `published` date. */
export const todayInIndia = (now = new Date()) => now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
export const isLive = (post: PostMeta, now = new Date()) => post.published <= todayInIndia(now)

/** Live posts, newest first. `scheduled` includes posts dated in the future too. */
export async function allPosts({ scheduled = false } = {}): Promise<Post[]> {
  const posts = (await Promise.all(postSlugs().map(async (slug) => (await load(slug)).post))).filter((p) => scheduled || isLive(p))
  return posts.sort((a, b) => b.published.localeCompare(a.published) || a.title.localeCompare(b.title))
}

/**
 * Posts as "Keep reading" links for pages outside the blog, read straight from each post's `meta`
 * so the page stays synchronous. A scheduled post is left out until it's live.
 * ponytail: liveness is checked when the page is built, so a newly live post shows up after the next deploy.
 */
export function postLinks(...slugs: string[]): { href: string; label: string; description: string }[] {
  return slugs.flatMap((slug) => {
    const source = readFileSync(join(DIR, `${slug}.mdx`), 'utf8')
    const field = (key: string) => source.match(new RegExp(`^  ${key}: '(.*)',$`, 'm'))?.[1] ?? ''
    return isLive({ published: field('published') } as PostMeta) ? [{ href: `/blog/${slug}`, label: field('title'), description: field('description') }] : []
  })
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
    // The profile URL is Sukrit's, so it only goes with Sukrit's name.
    author: { '@type': 'Person', name: post.author, ...(post.author === AUTHOR.name && { url: AUTHOR.url }) },
    publisher: { '@type': 'Organization', name: 'Aviary', logo: { '@type': 'ImageObject', url: new URL('/icon.png', SITE_URL).href } },
    image: new URL(`/og${post.path}`, SITE_URL).href,
    mainEntityOfPage: url,
    url,
  }
}

/** Dates the way the rest of the site writes them: 15 October 2026. */
export const formatPostDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })

