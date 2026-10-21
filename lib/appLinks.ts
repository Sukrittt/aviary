/**
 * https App Links for invite links (`/join/<code>`): the files Android and
 * iOS fetch to trust that this domain may open the app. The signing
 * fingerprints and team id come from the environment, so a key rotation is
 * a config change, not a deploy.
 */
export const APP_ID = 'com.sukrit04.envelope'

/** `ANDROID_CERT_SHA256`: comma-separated SHA-256 fingerprints (Play App Signing key, and the upload key for internal builds). */
export function assetLinks(fingerprints = process.env.ANDROID_CERT_SHA256 ?? '') {
  const certs = fingerprints.split(',').map((f) => f.trim().toUpperCase()).filter(Boolean)
  if (!certs.length) return []
  return [{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: APP_ID, sha256_cert_fingerprints: certs } }]
}

/** `APPLE_TEAM_ID`: the Apple developer team that signs the iOS app. */
export function appleAppSiteAssociation(teamId = process.env.APPLE_TEAM_ID ?? '') {
  return { applinks: { details: teamId ? [{ appIDs: [`${teamId}.${APP_ID}`], components: [{ '/': '/join/*' }] }] : [] } }
}
