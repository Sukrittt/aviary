import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The sprite's URL carries a content hash (src/components/categoryIconSprite.ts).
  async headers() {
    return [{ source: '/category-icons.svg', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] }]
  },
}

export default nextConfig