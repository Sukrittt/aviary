import Link from 'next/link'
import { pageMetadata } from '@/lib/seo'
import { allPosts, formatPostDate, type Post } from '@/lib/blog'
import { ContentPage, SoftCta } from '@/src/components/content/ContentPage'

export const metadata = pageMetadata('/blog')
// Hourly, so scheduled posts appear on their date.
export const revalidate = 3600

export default async function BlogIndexPage() {
  const [latest, ...rest] = await allPosts()
  return <ContentPage section="blog" path="/blog" title="Budgeting guides for India" kicker="The Aviary blog" lede={<>Plain guides to budgeting in India. Real rupee examples, no jargon, nothing to sell you until the last line. New posts land in the <a href="/blog/rss.xml">RSS feed</a> too.</>} related={['/tools/salary-budget-planner', '/tools/50-30-20-calculator']}>
    <ul className="article-cards">
      {latest && <PostCard post={latest} featured />}
      {rest.map((post) => <PostCard key={post.slug} post={post} />)}
    </ul>
    <SoftCta title="Try the method, not just the reading" placement="blog_index">Aviary turns these guides into a budget you can keep up with. Free for 30 days.</SoftCta>
  </ContentPage>
}

function PostCard({ post, featured = false }: { post: Post; featured?: boolean }) {
  return <li className={featured ? 'article-card article-card--featured' : 'article-card'}>
    <Link href={post.path}>
      <small>{featured && 'Latest · '}<time dateTime={post.published}>{formatPostDate(post.published)}</time> · {post.readingMinutes} min read</small>
      <strong>{post.title}</strong>
      <span>{post.description}</span>
    </Link>
  </li>
}
