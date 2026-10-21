import { describe, it, expect } from 'vitest'
import { appleAppSiteAssociation, assetLinks } from './appLinks'

describe('app links', () => {
  it('lists every configured Android signing key for the app, and nothing when unset', () => {
    expect(assetLinks(' ab:cd , EF:01')).toEqual([expect.objectContaining({ target: { namespace: 'android_app', package_name: 'com.sukrit04.envelope', sha256_cert_fingerprints: ['AB:CD', 'EF:01'] } })])
    expect(assetLinks('')).toEqual([])
  })

  it('opens only invite links in the iOS app', () => {
    expect(appleAppSiteAssociation('TEAM123').applinks.details).toEqual([{ appIDs: ['TEAM123.com.sukrit04.envelope'], components: [{ '/': '/join/*' }] }])
    expect(appleAppSiteAssociation('').applinks.details).toEqual([])
  })
})
