import { useSyncExternalStore } from 'react'
import { MARKET_COOKIE } from '@/lib/market'

const noSubscribe = () => () => {}
const intlCookie = () => document.cookie.split('; ').includes(`${MARKET_COOKIE}=intl`)

/** Middleware's market cookie, for static pages. The server render is India's, so an intl visitor's page settles on hydration. */
export const useIntlMarket = () => useSyncExternalStore(noSubscribe, intlCookie, () => false)
