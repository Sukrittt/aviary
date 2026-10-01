// Color tokens for the app's two schemes. Hand-maintained — edit the values here.
//
// Twin of Mobile/src/theme/tokens.ts, kept identical value-for-value: this is
// what makes the two apps read as one product. `npm run gen:tokens` turns it
// into src/theme/tokens.css, which is what the stylesheets actually consume —
// so this file stays the record and no colour is typed twice.
//
// Accent is electric orange. It has two forms because a saturated orange is only
// ~3.3:1 against white, which passes for large text and fails for anything smaller:
//   - `accent`    — fills, large surfaces, the log-expense flood screen, active nav.
//                   Only pair it with text at 24px+ (or 18.66px+ bold).
//   - `accentInk` — accent-colored text and icons on `bg`, and the fill for buttons
//                   that carry a small `onAccent` label. Clears 4.5:1 in both schemes.
// The same split applies to `warn`/`warnInk`.

export interface ThemeTokens {
  bg: string
  text: string
  text2: string
  text3: string
  onAccent: string
  card: string
  cardSolid: string
  sidebarBox: string
  inputBg: string
  pillBg: string
  modalBg: string
  modalStrong: string
  tabbarBg: string
  headerBg: string
  heroA: string
  heroB: string
  border: string
  borderStrong: string
  chipActiveBg: string
  accent: string
  accentInk: string
  accentSoft: string
  accentHover: string
  mint: string
  mintSoft: string
  coral: string
  coralSoft: string
  range: string
  violet: string
  violetSoft: string
  blue: string
  blueSoft: string
  warn: string
  warnInk: string
  warnSoft: string
}

export const darkTokens: ThemeTokens = {
  bg: '#000000',
  text: '#f5f5f5',
  text2: '#8f8f8f',
  text3: '#5d5d5d',
  onAccent: '#1a0500',
  card: 'rgba(3, 3, 3, 0.7)',
  cardSolid: '#0e0e0e',
  sidebarBox: 'rgba(2, 2, 2, 0.6)',
  inputBg: '#020202',
  pillBg: 'rgba(6, 6, 6, 0.9)',
  modalBg: 'rgba(2, 2, 2, 0.98)',
  modalStrong: 'rgba(4, 4, 4, 0.95)',
  tabbarBg: 'rgba(1, 1, 1, 0.92)',
  headerBg: 'rgba(0, 0, 0, 0.9)',
  heroA: 'rgba(54, 26, 14, 0.5)',
  heroB: 'rgba(29, 22, 18, 0.6)',
  border: 'rgba(255, 255, 255, 0.1)',
  borderStrong: 'rgba(255, 255, 255, 0.16)',
  chipActiveBg: '#161616',
  accent: '#f4511e',
  accentInk: '#ff8f66',
  accentSoft: 'rgba(255, 112, 67, 0.22)',
  accentHover: '#ff855a',
  mint: '#26e085',
  mintSoft: 'rgba(38, 224, 133, 0.22)',
  coral: '#ff646f',
  coralSoft: 'rgba(255, 100, 111, 0.22)',
  range: 'rgba(255, 112, 67, 0.16)',
  violet: '#e76edf',
  violetSoft: 'rgba(231, 110, 223, 0.22)',
  blue: '#00c5df',
  blueSoft: 'rgba(0, 197, 223, 0.22)',
  warn: '#facc15',
  warnInk: '#fde047',
  warnSoft: 'rgba(250, 204, 21, 0.22)',
}

export const lightTokens: ThemeTokens = {
  bg: '#faf8f5',
  text: '#060606',
  text2: '#424242',
  text3: '#717171',
  onAccent: '#ffffff',
  card: '#ffffff',
  cardSolid: '#ffffff',
  sidebarBox: 'rgba(242, 238, 232, 0.7)',
  inputBg: '#f2eee8',
  pillBg: 'rgba(255, 255, 255, 0.9)',
  modalBg: 'rgba(250, 248, 245, 0.98)',
  modalStrong: 'rgba(250, 248, 245, 0.96)',
  tabbarBg: 'rgba(250, 248, 245, 0.92)',
  headerBg: 'rgba(250, 248, 245, 0.92)',
  heroA: 'rgba(255, 232, 220, 0.65)',
  heroB: 'rgba(245, 238, 234, 0.7)',
  border: 'rgba(60, 40, 20, 0.08)',
  borderStrong: 'rgba(60, 40, 20, 0.13)',
  chipActiveBg: '#ebe5dd',
  accent: '#f4511e',
  accentInk: '#c2410c',
  accentSoft: 'rgba(244, 81, 30, 0.18)',
  accentHover: '#dd4514',
  mint: '#1f7a4d',
  mintSoft: 'rgba(31, 122, 77, 0.18)',
  coral: '#d70e3a',
  coralSoft: 'rgba(215, 14, 58, 0.18)',
  range: 'rgba(244, 81, 30, 0.11)',
  violet: '#af25a9',
  violetSoft: 'rgba(175, 37, 169, 0.18)',
  blue: '#007d98',
  blueSoft: 'rgba(0, 125, 152, 0.18)',
  warn: '#eab308',
  warnInk: '#a16207',
  warnSoft: 'rgba(234, 179, 8, 0.18)',
}
