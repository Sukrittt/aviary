// One-time migration: encrypts the plaintext values of every field listed in
// lib/scoped.ts's ENCRYPTED_FIELDS, across every document in every collection
// that has any (see lib/crypto.ts for the "why" and the threat model).
//
// Idempotent by construction: a value already prefixed `enc:` is left alone,
// so re-running (an interrupted run, or running again after new data arrives
// pre-deploy) is always safe and only touches what's still plaintext.
//
// --dry-run (default): reports what WOULD change, writes nothing.
// --apply: actually writes.
// --verify: decrypts every enc: value in the DB and asserts a clean
//   round-trip; exits non-zero on any failure. Run this right after --apply.
//
// Prerequisite: the app must already be deployed with the encryption code
// (mixed plaintext/ciphertext is the safe steady state, reads handle both) —
// running --apply before that deploy is live would show ciphertext to users.
//
// Usage:
//   node --experimental-strip-types scripts/encrypt-existing.mjs
//   node --experimental-strip-types scripts/encrypt-existing.mjs --apply
//   node --experimental-strip-types scripts/encrypt-existing.mjs --verify
import { pathToFileURL } from 'node:url'
import { MongoClient } from 'mongodb'
import { loadEnv, args } from './lib/env.mjs'
import { encrypt, decrypt, isEncrypted } from '../lib/crypto.ts'
import { ENCRYPTED_FIELDS, fieldAad as aad } from '../lib/encryptedFields.ts'

loadEnv()

/** The $set for one document — only plaintext values in its encrypted fields, or null if nothing to do. */
function buildUpdate(doc, fields, collectionName) {
  const userId = doc.user_id
  const set = {}
  let changed = false

  for (const field of fields) {
    if (field.includes('.')) {
      const [arrayKey, subField] = field.split('.')
      const source = set[arrayKey] ?? doc[arrayKey]
      if (Array.isArray(source)) {
        const next = source.map(item => {
          const value = item?.[subField]
          return (typeof value === 'string' || typeof value === 'number') && !isEncrypted(value)
            ? { ...item, [subField]: encrypt(String(value), aad(userId, collectionName, field)) }
            : item
        })
        if (next.some((item, i) => item !== source[i])) { set[arrayKey] = next; changed = true }
      }
      continue
    }
    const value = doc[field]
    if (typeof value === 'string' && value && !isEncrypted(value)) {
      set[field] = encrypt(value, aad(userId, collectionName, field))
      changed = true
    }
  }

  return changed ? set : null
}

async function migrateCollection(db, collectionName, fields, apply) {
  const coll = db.collection(collectionName)
  let scanned = 0
  let toEncrypt = 0
  let skippedNoUser = 0
  const bulkOps = []

  for await (const doc of coll.find({})) {
    scanned++
    if (!doc.user_id) {
      skippedNoUser++
      continue
    }
    const set = buildUpdate(doc, fields, collectionName)
    if (!set) continue
    toEncrypt++
    if (apply) bulkOps.push({ updateOne: { filter: { _id: doc._id }, update: { $set: set } } })
  }

  if (apply) {
    for (let i = 0; i < bulkOps.length; i += 500) {
      await coll.bulkWrite(bulkOps.slice(i, i + 500))
    }
  }

  const verb = apply ? 'encrypted' : 'would encrypt'
  console.log(
    `${collectionName.padEnd(24)} scanned ${scanned}, ${verb} ${toEncrypt}` +
      (skippedNoUser ? `, SKIPPED ${skippedNoUser} (no user_id — never encrypted under a wrong AAD)` : ''),
  )
  return toEncrypt
}

async function verifyCollection(db, collectionName, fields) {
  let checked = 0
  let failed = 0

  // `aadField` must exactly match what encryption used (from ENCRYPTED_FIELDS)
  // — `label` is only for the error message and can read however's clearest.
  const checkValue = (value, docId, aadField, label, userId) => {
    if (typeof value !== 'string' || !isEncrypted(value)) return
    checked++
    try {
      decrypt(value, aad(userId, collectionName, aadField))
    } catch (err) {
      failed++
      console.error(`  FAIL ${collectionName}/${docId} ${label}: ${err.message}`)
    }
  }

  for await (const doc of db.collection(collectionName).find({})) {
    for (const field of fields) {
      if (field.includes('.')) {
        const [arrayKey, subField] = field.split('.')
        if (Array.isArray(doc[arrayKey])) {
          for (const item of doc[arrayKey]) checkValue(item?.[subField], doc._id, field, field, doc.user_id)
        }
        continue
      }
      checkValue(doc[field], doc._id, field, field, doc.user_id)
    }
  }

  console.log(`${collectionName.padEnd(24)} verified ${checked} encrypted value(s), ${failed} failed`)
  return failed
}

async function main() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI not set')
  if (!process.env.FIELD_KEY_V1) throw new Error('FIELD_KEY_V1 not set')

  const flags = args()
  const apply = Boolean(flags.apply)
  const verify = Boolean(flags.verify)

  const client = new MongoClient(uri)
  await client.connect()
  try {
    const db = client.db()

    if (verify) {
      console.log('Verifying every encrypted value round-trips...\n')
      let totalFailed = 0
      for (const [collectionName, fields] of Object.entries(ENCRYPTED_FIELDS)) {
        totalFailed += await verifyCollection(db, collectionName, fields)
      }
      if (totalFailed > 0) {
        console.error(`\n${totalFailed} value(s) failed to decrypt.`)
        process.exitCode = 1
        return
      }
      console.log('\nAll encrypted values verified.')
      return
    }

    console.log(apply ? 'Applying encryption...\n' : 'Dry run — nothing will be written. Pass --apply to write.\n')
    let total = 0
    for (const [collectionName, fields] of Object.entries(ENCRYPTED_FIELDS)) {
      total += await migrateCollection(db, collectionName, fields, apply)
    }
    console.log(`\n${apply ? 'Encrypted' : 'Would encrypt'} ${total} document(s) total.`)
    if (!apply && total > 0) console.log('Re-run with --apply to write, then --verify to confirm.')
  } finally {
    await client.close()
  }
}

export { buildUpdate, verifyCollection }

// Only auto-run when executed directly (`node encrypt-existing.mjs`), not when
// imported for its exports (scripts/encrypt-existing.test.mjs unit-tests
// buildUpdate without connecting to Mongo). Compared as file:// URLs, not raw
// strings — a plain `file://${process.argv[1]}` breaks on any path containing
// spaces or other characters import.meta.url percent-encodes but argv[1] doesn't.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
}
