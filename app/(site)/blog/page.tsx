import Link from 'next/link'
import { pageMetadata } from '@/lib/seo'
import { allPosts, formatPostDate, type Post } from '@/lib/blog'
import { ContentPage, SoftCta } from '@/src/components/content/ContentPage'
import { serifFont } from './fonts'

export const metadata = pageMetadata('/blog')

export default async function BlogIndexPage() {
  const [latest, ...rest] = await allPosts()
  return <ContentPage section="blog" path="/blog" related={['/tools/salary-budget-planner', '/tools/50-30-20-calculator']} className={`blog-doc ${serifFont.variable}`}>
    <header className="blog-head">
      <p className="blog-kicker">The Aviary blog</p>
      <h1>Budgeting guides for India</h1>
      <p className="blog-dek">Plain guides to budgeting in India. Real rupee examples, no jargon, nothing to sell you until the last line. New posts land in the <a href="/blog/rss.xml">RSS feed</a> too.</p>
    </header>
    <ul className="blog-cards">
      <PostCard post={latest} featured />
      {rest.map((post) => <PostCard key={post.slug} post={post} />)}
    </ul>
    <SoftCta title="Try the method, not just the reading" placement="blog_index">Aviary turns these guides into a budget you can keep up with. Free for 30 days.</SoftCta>
  </ContentPage>
}

function PostCard({ post, featured = false }: { post: Post; featured?: boolean }) {
  return <li className={featured ? 'blog-card blog-card--featured' : 'blog-card'}>
    <Link href={post.path}>
      <small>{featured && 'Latest · '}<time dateTime={post.published}>{formatPostDate(post.published)}</time> · {post.readingMinutes} min read</small>
      <strong>{post.title}</strong>
      <span>{post.description}</span>
    </Link>
  </li>
}
