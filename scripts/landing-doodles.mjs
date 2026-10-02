// Writes the landing page's doodle backgrounds to public/landing/. A port of the
// scatter in ../store-screenshots/slides.html (the bird mark with a face, plus
// small hand-drawn shapes), seeded so every run gives the same files.
// Usage: node scripts/landing-doodles.mjs
import { writeFileSync } from 'node:fs'

const BODY = 'M 352 212 L 404 248 L 352 284 A 110 110 0 0 1 146 288 L 86 164 L 162 178 A 110 110 0 0 1 352 212 Z'
const FACES = [
  '<circle cx="306" cy="216" r="17" class="f"/>',
  '<path d="M 284 226 Q 306 196 328 226"/>',
  '<path d="M 286 212 Q 306 234 326 212"/><path d="M 392 112 H 426 L 392 146 H 426"/>',
  '<circle cx="306" cy="214" r="28"/><circle cx="310" cy="216" r="10" class="f"/>',
  '<path d="M 306 238 L 284 214 A 12 12 0 0 1 306 198 A 12 12 0 0 1 328 214 Z" class="f"/>',
  '<circle cx="306" cy="222" r="15" class="f"/><path d="M 278 186 L 334 200"/>',
  '<circle cx="306" cy="216" r="17" class="f"/><path d="M 430 160 V 96 L 470 86 V 146"/><circle cx="420" cy="162" r="12" class="f"/><circle cx="460" cy="148" r="12" class="f"/>',
  '<path d="M 288 216 H 326"/><path d="M 200 252 Q 240 296 296 266"/>',
]
const EXTRAS = ['', '<path d="M 232 334 V 372 M 264 334 V 372 M 186 380 H 318"/>', '<path d="M 196 248 Q 236 292 292 262"/>']
const STRUCTURE = ['scale(1,1)', 'scale(1.12,.9)', 'scale(.9,1.1)', 'scale(1.05,1)']
const SHAPES = [
  'M 10 50 Q 25 30 40 50 T 70 50 T 95 50',
  'M 50 50 m -16 0 a 16 16 0 1 0 32 0 a 16 16 0 1 0 -32 0',
  'M 50 26 L 74 70 L 26 70 Z',
  'M 30 30 L 70 70 M 45 22 L 85 62 M 15 45 L 55 85',
  'M 12 60 L 30 40 L 48 60 L 66 40 L 84 60',
  'M 50 22 L 57 42 L 78 43 L 61 56 L 67 77 L 50 65 L 33 77 L 39 56 L 22 43 L 43 42 Z',
  'M 50 50 m 0 -4 a 4 4 0 1 1 -4 4 a 9 9 0 0 1 9 -9 a 14 14 0 0 1 14 14 a 20 20 0 0 1 -20 20 a 26 26 0 0 1 -26 -26',
  'M 30 70 Q 50 20 70 70',
]
const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)

function doodles({ file, seed, w, h, cols, rows, color, opacity, size = 1, birdEvery = 7, avoid = [] }) {
  const r = rng(seed), cw = w / cols, ch = h / rows, pick = (a) => a[Math.floor(r() * a.length)]
  let shown = 0, out = ''
  for (let i = 0; i < cols * rows; i++) {
    const isBird = (shown + 3) % birdEvery === 0
    const s = (isBird ? 72 + r() * 18 : 42 + r() * 22) * size
    const x = (i % cols) * cw + r() * (cw - s), y = Math.floor(i / cols) * ch + r() * (ch - s)
    const rot = (r() - 0.5) * (isBird ? 30 : 120), flip = r() < 0.35 ? -1 : 1, op = opacity[0] + r() * (opacity[1] - opacity[0])
    const face = pick(FACES), extra = pick(EXTRAS), shape = pick(STRUCTURE), doodle = pick(SHAPES)
    if (r() < 0.3) continue
    if (avoid.some(([ax, ay, aw, ah]) => x + s > ax && x < ax + aw && y + s > ay && y < ay + ah)) continue
    shown++
    const body = isBird
      ? `<svg viewBox="40 40 460 460" width="${s}" height="${s}" overflow="visible"><g transform-origin="256 256" transform="${shape}"><path d="${BODY}"/>${face}${extra}</g></svg>`
      : `<svg viewBox="0 0 100 100" width="${s}" height="${s}" overflow="visible"><path d="${doodle}"/></svg>`
    out += `<g opacity="${op.toFixed(2)}" transform="translate(${(x + s / 2).toFixed(1)} ${(y + s / 2).toFixed(1)}) rotate(${rot.toFixed(1)}) scale(${flip} 1) translate(${(-s / 2).toFixed(1)} ${(-s / 2).toFixed(1)})">${body}</g>`
  }
  writeFileSync(new URL(`../public/landing/${file}`, import.meta.url), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" fill="none" stroke="${color}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><style>.f{fill:${color};stroke:none} path,circle{vector-effect:non-scaling-stroke}</style>${out}</svg>\n`)
}

// The hero stage: faint gray, like the store screenshots' margins.
doodles({ file: 'doodles-stage.svg', seed: 6, w: 1200, h: 720, cols: 10, rows: 5, color: '#bdb5ae', opacity: [0.35, 0.55] })
// Phone wallpaper: cream on Aviary orange, like the feature graphic.
doodles({ file: 'doodles-phone.svg', seed: 7, w: 290, h: 600, cols: 4, rows: 8, color: '#fff3ea', opacity: [0.22, 0.36], size: 0.55, birdEvery: 5 })
