import type { NextConfig } from 'next'
import createMDX from '@next/mdx'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Every page's metadata is static, so there's nothing to stream: keep <title> and
  // description in <head> for every user agent, not just the bots Next recognizes.
  htmlLimitedBots: /.*/,
}

// Blog posts (content/blog/*.mdx). remark-gfm for tables. Passed by name so it works under Turbopack too.
export default createMDX({ options: { remarkPlugins: [['remark-gfm']] } })(nextConfig)
