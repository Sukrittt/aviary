import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'

// Rendered once at build: the share card for every public page (lib/seo.ts OG_IMAGE).
export const dynamic = 'force-static'

export async function GET() {
  const icon = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/icon.png'))).toString('base64')}`
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72, background: '#fafaf7', color: '#1e1d1a' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse only renders plain img */}
        <img src={icon} width={88} height={88} style={{ borderRadius: 22 }} alt="" />
        <span style={{ fontSize: 44, fontWeight: 700 }}>Aviary<span style={{ color: '#f4501a' }}>.</span></span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>The budgeting app you’ll still open on day 4.</div>
        <div style={{ fontSize: 32, color: '#625f58' }}>Learns your spending. Never touches your bank.</div>
      </div>
      <div style={{ display: 'flex', fontSize: 28, color: '#b93c0c', fontWeight: 700 }}>useaviary.com</div>
    </div>,
    { width: 1200, height: 630 },
  )
}
