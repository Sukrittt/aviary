import { notFound } from 'next/navigation'
import { pages, SITE_URL, type PagePath } from '@/lib/seo'
import { AUTHOR, allPosts, articleJsonLd, formatPostDate, getPost, isLive, postMetadata, postSlugs, type Post } from '@/lib/blog'
import { jsonLd } from '@/src/components/JsonLd'
import { ContentPage, SoftCta, type Related } from '@/src/components/content/ContentPage'
import { LinkedinLogoIcon, WhatsappLogoIcon, XLogoIcon } from '@/src/components/icons'

// Live posts are built ahead. A scheduled post 404s until its date, then renders
// on the first request after the hourly revalidate.
export const revalidate = 3600
export const generateStaticParams = async () => (await allPosts()).map((p) => ({ slug: p.slug }))

async function livePost(slug: string) {
  if (!postSlugs().includes(slug)) notFound()
  const loaded = await getPost(slug)
  if (!isLive(loaded.post)) notFound()
  return loaded
}

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props) {
  return postMetadata((await livePost((await params).slug)).post)
}

export default async function BlogPostPage({ params }: Props) {
  const { post, Content } = await livePost((await params).slug)
  const related: Related[] = await Promise.all(post.related.map(async (href) => {
    if (!href.startsWith('/blog/')) return href as PagePath
    const { post: other } = await getPost(href.slice('/blog/'.length))
    return { href, label: other.title, description: other.description }
  }))
  // Fail the build on a typo'd related link rather than shipping a dead one.
  for (const r of related) if (typeof r === 'string' && !(r in pages)) throw new Error(`${post.slug}: unknown related page ${r}`)

  return <ContentPage section="blog" path={post.path} label={post.title} related={related}>
    {jsonLd(articleJsonLd(post))}
    <header className="article-head">
      <p className="article-kicker">
        <time dateTime={post.published}>{formatPostDate(post.published)}</time>
        {post.updated !== post.published && <> · Updated <time dateTime={post.updated}>{formatPostDate(post.updated)}</time></>}
        {' · '}{post.readingMinutes} min read
      </p>
      <h1>{post.title}</h1>
      <p className="article-dek">{post.description}</p>
      <div className="blog-author">
        <span aria-hidden="true">{post.author[0]}</span>
        <p>{post.author === AUTHOR.name ? <><a href={AUTHOR.url} rel="author noreferrer" target="_blank">{post.author}</a><small>{AUTHOR.bio}</small></> : post.author}</p>
      </div>
    </header>
    <div className="article-body">
      <ShareLinks post={post} />
      <div className="lp-post"><Content /></div>
    </div>
    <SoftCta title="Budget the way this post describes" placement={`blog_${post.slug}`}>Aviary gives all your money a category and makes logging one tap. Free for 30 days, no card, no bank link.</SoftCta>
  </ContentPage>
}

/** Plain share links, no scripts: WhatsApp first, since that's where most Indian readers share. */
function ShareLinks({ post }: { post: Post }) {
  const url = new URL(post.path, SITE_URL).href
  const text = encodeURIComponent(post.title)
  const links = [
    ['WhatsApp', `https://wa.me/?text=${encodeURIComponent(`${post.title} ${url}`)}`, WhatsappLogoIcon],
    ['X', `https://x.com/intent/post?text=${text}&url=${encodeURIComponent(url)}`, XLogoIcon],
    ['LinkedIn', `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`, LinkedinLogoIcon],
  ] as const
  return <aside className="blog-share" aria-label="Share this post">
    <div>
      <span>Share</span>
      {links.map(([name, href, Icon]) => <a key={name} href={href} target="_blank" rel="noreferrer" aria-label={`Share on ${name}`}><Icon size={18} aria-hidden="true" /></a>)}
    </div>
  </aside>
}
