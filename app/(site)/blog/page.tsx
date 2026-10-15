import Link from 'next/link'
import { pageMetadata } from '@/lib/seo'
import { allPosts, formatPostDate } from '@/lib/blog'
import { ContentPage, SoftCta } from '@/src/components/content/ContentPage'

export const metadata = pageMetadata('/blog')

export default async function BlogIndexPage() {
  const posts = await allPosts()
  return <ContentPage section="blog" path="/blog" related={['/tools/salary-budget-planner', '/tools/50-30-20-calculator']}>
    <h1>The Aviary blog</h1>
    <p className="lp-lede-doc">Plain guides to budgeting in India. Real rupee examples, no jargon, nothing to sell you until the last line.</p>
    <p>New posts land in the <a href="/blog/rss.xml">RSS feed</a> too.</p>
    <ul className="lp-hub lp-posts">{posts.map((post) => <li key={post.slug}>
      <Link href={post.path}>
        <strong>{post.title}</strong>
        <span>{post.description}</span>
        <small><time dateTime={post.published}>{formatPostDate(post.published)}</time> · {post.readingMinutes} min read</small>
      </Link>
    </li>)}</ul>
    <SoftCta title="Try the method, not just the reading" placement="blog_index">Aviary turns these guides into a budget you can keep up with. Free for 30 days.</SoftCta>
  </ContentPage>
}
