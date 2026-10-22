import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// vitest.config.ts leaves `globals` off, so @testing-library/react never
// registers its own auto-cleanup and rendered trees pile up across tests in a
// file — every query after the first then finds duplicates. Registering it
// here fixes that for every test file at once.
afterEach(cleanup)

// next/font only works inside the Next compiler. Content pages load the serif
// (src/components/content/serifFont.ts), so give tests a stand-in class name.
vi.mock('next/font/google', () => ({ Newsreader: () => ({ variable: 'font-serif', className: 'font-serif' }) }))

// jsdom has no IntersectionObserver, which motion's useInView needs
// (RollingAmount). One that never fires: nothing in a test is "on screen".
if (typeof globalThis.IntersectionObserver === 'undefined') {
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return [] }
  } as unknown as typeof IntersectionObserver
}
