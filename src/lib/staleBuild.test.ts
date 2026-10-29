import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reloadIfStaleBuild } from './staleBuild'

const reload = vi.fn()

beforeEach(() => {
  sessionStorage.clear()
  reload.mockClear()
  vi.stubGlobal('location', { ...window.location, reload })
})
afterEach(() => vi.unstubAllGlobals())

const chunkError = () => Object.assign(new Error('Loading chunk 6553 failed.\n(error: https://www.useaviary.com/_next/static/chunks/6553-0a1b.js)'), { name: 'ChunkLoadError' })

describe('reloadIfStaleBuild', () => {
  it('reloads once when a deploy left this tab asking for chunks that are gone', () => {
    expect(reloadIfStaleBuild(chunkError())).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it("loads the route that failed when the address bar hasn't moved to it yet", () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, pathname: '/expense', reload, assign })
    reloadIfStaleBuild(chunkError(), '/insights')
    expect(assign).toHaveBeenCalledWith('/insights')
    expect(reload).not.toHaveBeenCalled()
  })

  it.each([
    'Loading CSS chunk 812 failed.',
    'Failed to fetch dynamically imported module: https://www.useaviary.com/_next/static/chunks/a.js',
    'Failed to load chunk /_next/static/chunks/a.js',
  ])('treats "%s" as a stale build', (message) => {
    expect(reloadIfStaleBuild(new Error(message))).toBe(true)
  })

  it('leaves ordinary render errors to the error screen', () => {
    expect(reloadIfStaleBuild(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it("doesn't loop when the reload didn't help", () => {
    reloadIfStaleBuild(chunkError())
    expect(reloadIfStaleBuild(chunkError())).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
