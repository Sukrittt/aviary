/**
 * India (/, ₹) or everywhere else (/intl). The landing page reads Vercel's geo
 * header directly; static pages can't without rendering per request, so
 * middleware copies the same answer into MARKET_COOKIE for their footer.
 */
export const MARKET_COOKIE = 'aviary_market'

/** A visitor outside India. No header (local dev, unknown) counts as India, the default market. */
export const isIntlCountry = (country: string | null | undefined) => !!country && country !== 'IN'

/** Footer links an intl visitor shouldn't see: every tool is in rupees except the paycheck planner. */
export const rupeeOnly = (href: string) => href.startsWith('/tools/') && href !== '/tools/paycheck-budget-planner'
