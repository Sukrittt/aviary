import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'

const file = (path: string) => readFile(join(process.cwd(), path))

/**
 * The 1200×630 share card. Geist (from the geist npm package, OFL) is vendored
 * as TTF in assets/fonts because ImageResponse can’t read the woff2 next/font
 * serves. Its kerning tables are stripped: ImageResponse measures words without
 * kerning but draws them with it, which left gaps after words like "Aviary".
 * Category colours run along the bottom, like the envelopes in the app.
 */
export async function ogCard({ kicker, title, subtitle }: { kicker?: string; title: string; subtitle?: string }) {
  const [icon, regular, semibold] = await Promise.all([file('public/icon.png'), file('assets/fonts/Geist-Regular.ttf'), file('assets/fonts/Geist-SemiBold.ttf')])
  const long = title.length > 60
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#fafaf7', color: '#1e1d1a', fontFamily: 'Geist' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '64px 72px 56px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse only renders plain img */}
            <img src={`data:image/png;base64,${icon.toString('base64')}`} width={72} height={72} style={{ borderRadius: 18 }} alt="" />
            <span style={{ fontSize: 40, fontWeight: 600 }}>Aviary<span style={{ color: '#f4501a' }}>.</span></span>
          </div>
          {kicker && <span style={{ padding: '10px 22px', borderRadius: 999, background: '#fff0e6', color: '#b93c0c', fontSize: 26, fontWeight: 600 }}>{kicker}</span>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ fontSize: long ? 60 : 72, fontWeight: 600, lineHeight: 1.1 }}>{title}</div>
          {subtitle && <div style={{ fontSize: 32, color: '#625f58' }}>{subtitle}</div>}
        </div>
        <div style={{ display: 'flex', fontSize: 26, fontWeight: 600, color: '#b93c0c' }}>useaviary.com</div>
      </div>
      <div style={{ display: 'flex', height: 16 }}>
        {['#e7b7fd', '#b7e7a2', '#a5d8ee', '#f8cb7b'].map((c) => <div key={c} style={{ flex: 1, background: c }} />)}
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      fonts: [{ name: 'Geist', data: regular, weight: 400 }, { name: 'Geist', data: semibold, weight: 600 }],
    },
  )
}
