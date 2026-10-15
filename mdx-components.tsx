import type { MDXComponents } from 'mdx/types'
import Link from 'next/link'

// Blog posts (content/blog/*.mdx): internal links go through next/link, external ones open in a new tab.
const components: MDXComponents = {
  a: ({ href = '', children }) => href.startsWith('/')
    ? <Link href={href}>{children}</Link>
    : <a href={href} target="_blank" rel="noreferrer">{children}</a>,
  table: (props) => <div className="table-scroll"><table {...props} /></div>,
}

export function useMDXComponents(): MDXComponents {
  return components
}
