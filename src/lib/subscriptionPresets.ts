// Twin of Mobile's src/lib/subscriptionPresets.ts, keep them in sync.
// Known subscription services: quick-pick suggestions in the add modal and brand
// colours in SubscriptionsPanel. `regions` are currency codes (the closest thing to a
// user's country we store); no `regions` means it's sold everywhere. `aliases` are
// extra lowercase substrings that should still pick up the brand colour. `popular`
// ones lead the suggestion list before the user types anything.
interface Preset {
  name: string
  color: string
  popular?: boolean
  regions?: readonly string[]
  aliases?: readonly string[]
}

const IN = ['INR']
const US = ['USD']
const UK = ['GBP']
const US_CA = ['USD', 'CAD']
const EU = ['EUR']

export const SUBSCRIPTION_PRESETS: readonly Preset[] = [
  // Video
  { name: 'Netflix', color: '#E50914', popular: true },
  { name: 'Amazon Prime', color: '#00A8E1', popular: true, aliases: ['prime'] },
  { name: 'YouTube Premium', color: '#FF0000', popular: true, aliases: ['youtube'] },
  { name: 'Disney+', color: '#113CCF', popular: true },
  { name: 'Apple TV+', color: '#A2AAAD', aliases: ['apple tv'] },
  { name: 'JioHotstar', color: '#0C3B7C', popular: true, regions: IN, aliases: ['hotstar', 'jiocinema'] },
  { name: 'SonyLIV', color: '#0066CC', regions: IN },
  { name: 'ZEE5', color: '#8B2FC9', regions: IN },
  { name: 'Aha', color: '#FF6A00', regions: IN },
  { name: 'Sun NXT', color: '#F7A600', regions: IN },
  { name: 'MX Player', color: '#1B63F5', regions: IN },
  { name: 'Hulu', color: '#1CE783', popular: true, regions: US },
  { name: 'Max', color: '#002BE7', popular: true, regions: [...US, ...EU], aliases: ['hbo'] },
  { name: 'Peacock', color: '#000000', regions: US },
  { name: 'Paramount+', color: '#0064FF', regions: [...US_CA, ...UK, 'AUD'] },
  { name: 'ESPN+', color: '#D00000', regions: US },
  { name: 'Crave', color: '#00A0E0', regions: ['CAD'] },
  { name: 'Stan', color: '#0072CE', regions: ['AUD'] },
  { name: 'Binge', color: '#2DCC70', regions: ['AUD'] },
  { name: 'NOW', color: '#00C8A0', regions: UK },
  { name: 'BritBox', color: '#E5007E', regions: [...UK, ...US_CA] },
  { name: 'DAZN', color: '#F8FC00', regions: [...EU, ...UK, ...US_CA] },
  { name: 'Crunchyroll', color: '#F47521' },
  { name: 'Twitch', color: '#9146FF' },
  // Music and audio
  { name: 'Spotify', color: '#1DB954', popular: true },
  { name: 'Apple Music', color: '#FA2D48', popular: true },
  { name: 'YouTube Music', color: '#FF0000' },
  { name: 'Amazon Music', color: '#25D1DA' },
  { name: 'JioSaavn', color: '#2BC5B4', regions: IN },
  { name: 'Gaana', color: '#E72C30', regions: IN },
  { name: 'Tidal', color: '#000000', regions: [...US, ...EU, ...UK] },
  { name: 'Deezer', color: '#A238FF', regions: [...EU, ...UK] },
  { name: 'Audible', color: '#F8991C' },
  { name: 'Kindle Unlimited', color: '#FF9900' },
  { name: 'SiriusXM', color: '#0000EB', regions: US_CA },
  // Cloud, productivity and AI
  { name: 'iCloud+', color: '#3693F3', popular: true, aliases: ['icloud'] },
  { name: 'Google One', color: '#4285F4', popular: true, aliases: ['google'] },
  { name: 'Microsoft 365', color: '#D83B01', popular: true, aliases: ['office', 'microsoft'] },
  { name: 'Dropbox', color: '#0061FF' },
  { name: 'Notion', color: '#787774' },
  { name: 'ChatGPT Plus', color: '#10A37F', popular: true, aliases: ['chatgpt', 'openai'] },
  { name: 'Claude Pro', color: '#D97757', aliases: ['claude', 'anthropic'] },
  { name: 'Gemini Advanced', color: '#8E75B2', aliases: ['gemini'] },
  { name: 'Perplexity Pro', color: '#20808D', aliases: ['perplexity'] },
  { name: 'GitHub Copilot', color: '#6E40C9', aliases: ['github', 'copilot'] },
  { name: 'Canva Pro', color: '#00C4CC', aliases: ['canva'] },
  { name: 'Adobe Creative Cloud', color: '#FF0000', aliases: ['adobe'] },
  { name: 'Figma', color: '#A259FF' },
  { name: 'Slack', color: '#4A154B' },
  { name: 'Zoom', color: '#0B5CFF' },
  { name: 'Grammarly', color: '#15C39A' },
  { name: '1Password', color: '#0572EC' },
  { name: 'NordVPN', color: '#4687FF' },
  { name: 'LinkedIn Premium', color: '#0A66C2', aliases: ['linkedin'] },
  { name: 'Duolingo Super', color: '#58CC02', aliases: ['duolingo'] },
  // Gaming
  { name: 'Xbox Game Pass', color: '#107C10', aliases: ['xbox', 'game pass'] },
  { name: 'PlayStation Plus', color: '#003791', aliases: ['playstation', 'ps plus'] },
  { name: 'Nintendo Switch Online', color: '#E60012', aliases: ['nintendo'] },
  { name: 'Discord Nitro', color: '#5865F2', aliases: ['discord'] },
  // Shopping, food and delivery
  { name: 'Swiggy One', color: '#FC8019', popular: true, regions: IN, aliases: ['swiggy'] },
  { name: 'Zomato Gold', color: '#E23744', regions: IN, aliases: ['zomato'] },
  { name: 'Flipkart VIP', color: '#2874F0', regions: IN, aliases: ['flipkart'] },
  { name: 'Blinkit', color: '#F8CB46', regions: IN },
  { name: 'DashPass', color: '#FF3008', regions: [...US_CA, 'AUD'], aliases: ['doordash'] },
  { name: 'Uber One', color: '#000000', aliases: ['uber'] },
  { name: 'Instacart+', color: '#43B02A', regions: US_CA, aliases: ['instacart'] },
  { name: 'Walmart+', color: '#0071DC', regions: US, aliases: ['walmart'] },
  { name: 'Costco', color: '#E31837', regions: [...US_CA, ...UK, 'AUD'] },
  { name: 'Deliveroo Plus', color: '#00CCBC', regions: [...UK, ...EU], aliases: ['deliveroo'] },
  // News and fitness
  { name: 'The Hindu', color: '#1A1A1A', regions: IN },
  { name: 'Times Prime', color: '#E21B22', regions: IN },
  { name: 'New York Times', color: '#000000', regions: US, aliases: ['nyt'] },
  { name: 'Medium', color: '#000000' },
  { name: 'Cult.fit', color: '#FF3278', regions: IN, aliases: ['cult'] },
  { name: 'Strava', color: '#FC4C02' },
  { name: 'Peloton', color: '#DF1C2F', regions: [...US_CA, ...UK, 'AUD'] },
  { name: 'Headspace', color: '#F47D31' },
  { name: 'Calm', color: '#4A90E2' },
  // Phone and internet
  { name: 'Jio', color: '#0A2F8F', regions: IN },
  { name: 'Airtel', color: '#ED1C24', regions: IN },
  { name: 'Vi', color: '#EE1C25', regions: IN },
]

/** Services worth suggesting for a currency: the global ones plus that region's own. */
export function presetsFor(currencyCode: string): Preset[] {
  return SUBSCRIPTION_PRESETS.filter((p) => !p.regions || p.regions.includes(currencyCode))
}

/** Up to `limit` suggestions for the typed text: exact match, then prefix, then substring. */
export function suggestPresets(currencyCode: string, query: string, limit = 12): string[] {
  const typed = query.trim()
  const q = typed.toLowerCase()
  const presets = presetsFor(currencyCode)
  if (!q) return [...presets.filter((p) => p.popular), ...presets.filter((p) => !p.popular)].map((p) => p.name).slice(0, limit)
  const rank = (n: string) => {
    const l = n.toLowerCase()
    return l === q ? 0 : l.startsWith(q) ? 1 : l.includes(q) ? 2 : 3
  }
  // Only the chip the field already spells out exactly goes away, so "Jio" still offers JioHotstar.
  return presets
    .map((p) => p.name)
    .filter((n) => n !== typed && rank(n) < 3)
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, limit)
}

// Every lowercase key that maps to a colour, longest first so "apple music" beats "apple".
const COLOR_KEYS = SUBSCRIPTION_PRESETS.flatMap((p) =>
  [p.name.toLowerCase(), ...(p.aliases ?? [])].map((key) => [key, p.color] as const),
).sort((a, b) => b[0].length - a[0].length)

// Whole-word match, so short names like "Vi" or "Now" don't light up "Movies" or "Snowflake".
function hasWord(text: string, key: string): boolean {
  for (let i = text.indexOf(key); i !== -1; i = text.indexOf(key, i + 1)) {
    const before = text[i - 1] ?? ' '
    const after = text[i + key.length] ?? ' '
    if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) return true
  }
  return false
}

/** Brand colour for a free-text service name, or null when it isn't a known service. */
export function brandColor(service: string): { solid: string; soft: string } | null {
  const lower = service.toLowerCase()
  const hit = COLOR_KEYS.find(([key]) => hasWord(lower, key))
  if (!hit) return null
  const solid = hit[1]
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(solid.slice(i, i + 2), 16))
  return { solid, soft: `rgba(${r}, ${g}, ${b}, 0.22)` }
}
