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
  // Extra category tints, only for a picked colour (never the name hash).
  pink: string
  pinkSoft: string
  indigo: string
  indigoSoft: string
  brown: string
  brownSoft: string
  slate: string
  slateSoft: string
  /** Home's "left" pills. Solid in light mode: an alpha tint of mint/warn/coral
   *  over white reads muddy grey. Dark keeps the alpha tints. */
  pillGood: string
  pillGoodBg: string
  pillLow: string
  pillLowBg: string
  pillOver: string
  pillOverBg: string
  /** Success-tick CTA flood. Light uses a soft pillGood-style chip pair. */
  successBg: string
  onSuccess: string
  /** How far chart fills (donut wedges, budget bars) mix toward white. Light's
   *  inks read loud as big wedges on a white card; dark's pass through. */
  chartSoften: string
}

export const darkTokens: ThemeTokens = {
  bg: '#0c0a09',
  text: '#f5f2ef',
  text2: '#aca59f',
  text3: '#8c857f',
  onAccent: '#1a0500',
  card: 'rgba(22, 20, 18, 0.85)',
  cardSolid: '#161412',
  sidebarBox: 'rgba(19, 17, 15, 0.7)',
  inputBg: '#1b1816',
  pillBg: 'rgba(30, 27, 25, 0.9)',
  modalBg: 'rgba(30, 27, 25, 0.98)',
  modalStrong: 'rgba(34, 31, 28, 0.95)',
  tabbarBg: 'rgba(12, 10, 9, 0.92)',
  headerBg: 'rgba(12, 10, 9, 0.9)',
  heroA: 'rgba(54, 26, 14, 0.5)',
  heroB: 'rgba(29, 22, 18, 0.6)',
  border: 'rgba(255, 240, 230, 0.1)',
  borderStrong: 'rgba(255, 240, 230, 0.18)',
  chipActiveBg: '#2a2623',
  accent: '#f4511e',
  accentInk: '#ff8f66',
  accentSoft: 'rgba(255, 112, 67, 0.22)',
  accentHover: '#ff855a',
  mint: '#3ed68a',
  mintSoft: 'rgba(62, 214, 138, 0.22)',
  coral: '#ff6b74',
  coralSoft: 'rgba(255, 107, 116, 0.22)',
  range: 'rgba(255, 112, 67, 0.16)',
  violet: '#df7ad8',
  violetSoft: 'rgba(223, 122, 216, 0.22)',
  blue: '#3cc4dc',
  blueSoft: 'rgba(60, 196, 220, 0.22)',
  warn: '#f2c94c',
  warnInk: '#f7d774',
  warnSoft: 'rgba(242, 201, 76, 0.22)',
  pink: '#ff7ab6',
  pinkSoft: 'rgba(255, 122, 182, 0.22)',
  indigo: '#8b8cff',
  indigoSoft: 'rgba(139, 140, 255, 0.22)',
  brown: '#c99c7a',
  brownSoft: 'rgba(201, 156, 122, 0.22)',
  slate: '#a6b0bf',
  slateSoft: 'rgba(166, 176, 191, 0.22)',
  pillGood: '#3ed68a',
  pillGoodBg: 'rgba(62, 214, 138, 0.16)',
  pillLow: '#f7d774',
  pillLowBg: 'rgba(242, 201, 76, 0.16)',
  pillOver: '#ff6b74',
  pillOverBg: 'rgba(255, 107, 116, 0.16)',
  successBg: '#3ed68a',
  onSuccess: '#1a0500',
  chartSoften: '0%',
}

export const lightTokens: ThemeTokens = {
  bg: '#ffffff',
  text: '#060606',
  text2: '#424242',
  text3: '#717171',
  onAccent: '#ffffff',
  card: '#ffffff',
  cardSolid: '#ffffff',
  sidebarBox: 'rgba(242, 238, 232, 0.7)',
  inputBg: '#f2eee8',
  pillBg: 'rgba(255, 255, 255, 0.9)',
  modalBg: 'rgba(255, 255, 255, 0.98)',
  modalStrong: 'rgba(255, 255, 255, 0.96)',
  tabbarBg: 'rgba(255, 255, 255, 0.92)',
  headerBg: 'rgba(255, 255, 255, 0.92)',
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
  pink: '#d6337f',
  pinkSoft: 'rgba(214, 51, 127, 0.18)',
  indigo: '#4f46e5',
  indigoSoft: 'rgba(79, 70, 229, 0.18)',
  brown: '#8a5a3b',
  brownSoft: 'rgba(138, 90, 59, 0.18)',
  slate: '#5b6575',
  slateSoft: 'rgba(91, 101, 117, 0.18)',
  pillGood: '#15803d',
  pillGoodBg: '#dcfce7',
  pillLow: '#b45309',
  pillLowBg: '#fef3c7',
  pillOver: '#b91c1c',
  pillOverBg: '#fee2e2',
  successBg: '#bbf7d0',
  onSuccess: '#166534',
  chartSoften: '15%',
}
