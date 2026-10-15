import { pages, type PagePath } from '@/lib/seo'
import { AUTHOR, articleJsonLd, formatPostDate, getPost, postMetadata, postSlugs } from '@/lib/blog'
import { jsonLd } from '@/src/components/JsonLd'
import { ContentPage, SoftCta, type Related } from '@/src/components/content/ContentPage'

// Every post is a file in content/blog, so the list is known at build time.
export const dynamicParams = false
export const generateStaticParams = () => postSlugs().map((slug) => ({ slug }))

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props) {
  return postMetadata((await getPost((await params).slug)).post)
}

export default async function BlogPostPage({ params }: Props) {
  const { post, Content } = await getPost((await params).slug)
  const related: Related[] = await Promise.all(post.related.map(async (href) => {
    if (!href.startsWith('/blog/')) return href as PagePath
    const { post: other } = await getPost(href.slice('/blog/'.length))
    return { href, label: other.title, description: other.description }
  }))
  // Fail the build on a typo'd related link rather than shipping a dead one.
  for (const r of related) if (typeof r === 'string' && !(r in pages)) throw new Error(`${post.slug}: unknown related page ${r}`)

  return <ContentPage section="blog" path={post.path} label={post.title} related={related}>
    {jsonLd(articleJsonLd(post))}
    <h1>{post.title}</h1>
    <p className="legal-updated lp-byline">
      By {post.author === AUTHOR.name ? <><a href={AUTHOR.url} rel="author noreferrer" target="_blank">{post.author}</a>, {AUTHOR.bio}</> : post.author}
      {' · '}<time dateTime={post.published}>{formatPostDate(post.published)}</time>
      {post.updated !== post.published && <> · Updated <time dateTime={post.updated}>{formatPostDate(post.updated)}</time></>}
      {' · '}{post.readingMinutes} min read
    </p>
    <div className="lp-post"><Content /></div>
    <SoftCta title="Budget the way this post describes" placement={`blog_${post.slug}`}>Aviary gives every rupee a category and makes logging one tap. Free for 30 days, no card, no bank link.</SoftCta>
  </ContentPage>
}
