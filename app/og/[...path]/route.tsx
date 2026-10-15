import { pages, ogCardPaths, ogTitle, type PagePath } from '@/lib/seo'
import { allPosts } from '@/lib/blog'
import { ogCard } from '@/src/components/OgCard'

// One card per public page, rendered at build: /og/compare/axio is the card for /compare/axio.
export const dynamicParams = false

export async function generateStaticParams() {
  const posts = await allPosts()
  return [...ogCardPaths(), ...posts.map((p) => p.path)].map((path) => ({ path: path.slice(1).split('/') }))
}

const KICKERS: Record<string, string> = { compare: 'Compare', tools: 'Free tool', features: 'Feature', blog: 'Blog', help: 'Help', changelog: 'Changelog', legal: 'Aviary' }

export async function GET(_: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const segments = (await params).path
  const path = `/${segments.join('/')}`
  const post = segments[0] === 'blog' && segments.length === 2 ? (await allPosts()).find((p) => p.path === path) : undefined
  const title = post?.title ?? ogTitle(pages[path as PagePath].title)
  return ogCard({ kicker: KICKERS[segments[0]], title })
}
