// One-time migration: moves every account from the staging WorkOS environment
// to the production one, in the SAME Mongo database.
//
// WorkOS assigns user ids itself, so a production user can never keep its
// staging id. For each staging user in `users`, this finds (by email) or
// creates the production WorkOS user, then rewrites the old id to the new one
// everywhere it appears: `user_id` / `userId` fields, `_id`s that ARE the user
// id (users, billing_accounts), and ids embedded in strings (rate-limit keys).
// Encrypted fields are bound to their owner's id through the AAD
// (lib/encryptedFields.ts), so they're decrypted under the old id and
// re-encrypted under the new one — a plain id rename would make them
// undecryptable.
//
// Rerunnable: a user whose production WorkOS id already equals its `users._id`
// is done and skipped, and `users` is rewritten last, so a run that dies
// halfway picks up where it stopped.
//
// Env (pass on the command line — .env.local points at dev and staging):
//   MONGODB_URI           the database to migrate
//   FIELD_KEY_V1          that database's field-encryption key
//   WORKOS_PROD_API_KEY   production WorkOS API key (separate name, so the
//                         staging WORKOS_API_KEY in .env.local is never used)
//
// Usage:
//   node --experimental-strip-types scripts/migrate-workos-ids.mjs
//   node --experimental-strip-types scripts/migrate-workos-ids.mjs --apply --db <database name>
//   node --experimental-strip-types scripts/encrypt-existing.mjs --verify
import { pathToFileURL } from 'node:url'
import { MongoClient } from 'mongodb'
import { WorkOS } from '@workos-inc/node'
import { loadEnv, args } from './lib/env.mjs'
import { encrypt, decrypt, isEncrypted } from '../lib/crypto.ts'
import { ENCRYPTED_FIELDS, fieldAad as aad } from '../lib/encryptedFields.ts'

loadEnv()

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype
}

/** Deep copy of `value` with every old id inside any string swapped for its new id. Dates, ObjectIds etc. pass through. */
function replaceIds(value, idMap) {
  if (typeof value === 'string') {
    if (!value.includes('user_')) return value
    let out = value
    for (const [oldId, newId] of idMap) out = out.replaceAll(oldId, newId)
    return out
  }
  if (Array.isArray(value)) return value.map(v => replaceIds(v, idMap))
  if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, replaceIds(v, idMap)]))
  return value
}

/** Re-encrypts one value from the old owner's AAD to the new owner's. Plaintext passes through. */
function reKeyValue(value, oldId, newId, collectionName, field) {
  if (!isEncrypted(value)) return value
  const plain = decrypt(value, aad(oldId, collectionName, field))
  return encrypt(String(plain), aad(newId, collectionName, field))
}

/** The rewritten document, or null when it references no migrating user. */
function rewriteDoc(doc, collectionName, idMap) {
  const next = replaceIds(doc, idMap)
  if (JSON.stringify(next) === JSON.stringify(doc)) return null

  const oldOwner = doc.user_id
  const newOwner = idMap.get(oldOwner)
  if (newOwner) {
    for (const field of ENCRYPTED_FIELDS[collectionName] ?? []) {
      if (field.includes('.')) {
        const [arrayKey, subField] = field.split('.')
        if (Array.isArray(next[arrayKey])) {
          next[arrayKey] = next[arrayKey].map(item =>
            isPlainObject(item) && subField in item
              ? { ...item, [subField]: reKeyValue(item[subField], oldOwner, newOwner, collectionName, field) }
              : item,
          )
        }
      } else if (field in next) {
        next[field] = reKeyValue(next[field], oldOwner, newOwner, collectionName, field)
      }
    }
  }
  return next
}

async function writeDoc(coll, oldDoc, newDoc) {
  if (oldDoc._id === newDoc._id || String(oldDoc._id) === String(newDoc._id)) {
    await coll.replaceOne({ _id: oldDoc._id }, newDoc)
    return
  }
  // _id changed (users, billing_accounts): Mongo can't update _id in place.
  try {
    await coll.insertOne(newDoc)
  } catch (err) {
    if (err?.code !== 11000) throw err // already inserted by an interrupted earlier run
  }
  await coll.deleteOne({ _id: oldDoc._id })
}

function splitName(name) {
  if (!name) return {}
  const [firstName, ...rest] = name.trim().split(/\s+/)
  return { firstName, lastName: rest.join(' ') || undefined }
}

/** Old (staging) id → new (production) id, for every user not yet migrated. */
async function buildIdMap(db, workos, apply) {
  const idMap = new Map()
  const users = await db.collection('users').find({ _id: /^user_/ }).toArray()
  let dryCounter = 0

  for (const user of users) {
    const { data } = await workos.userManagement.listUsers({ email: user.email })
    let prodUser = data[0]
    if (prodUser?.id === user._id) continue // already migrated

    if (!prodUser && apply) {
      prodUser = await workos.userManagement.createUser({
        email: user.email,
        emailVerified: user.emailVerified ?? true,
        ...splitName(user.name || [user.firstName, user.lastName].filter(Boolean).join(' ')),
        externalId: user._id,
      })
    }
    const newId = prodUser?.id ?? `user_DRYRUN_${++dryCounter}`

    // The person signed in on production before this ran, so an empty account
    // already exists under the new id. Merging is a judgment call — stop and
    // let a human decide rather than overwrite either one.
    if (prodUser && (await db.collection('users').findOne({ _id: newId }, { projection: { _id: 1 } }))) {
      console.warn(`SKIP ${user.email}: a users doc for production id ${newId} already exists`)
      continue
    }

    idMap.set(user._id, newId)
    console.log(`${user.email.padEnd(40)} ${user._id} -> ${newId}${prodUser ? '' : ' (would create)'}`)
  }
  return idMap
}

async function main() {
  for (const name of ['MONGODB_URI', 'FIELD_KEY_V1', 'WORKOS_PROD_API_KEY']) {
    if (!process.env[name]) throw new Error(`${name} not set`)
  }
  const flags = args()
  const apply = Boolean(flags.apply)

  const client = new MongoClient(process.env.MONGODB_URI)
  await client.connect()
  try {
    const db = client.db()
    console.log(`Database: ${db.databaseName}${apply ? '' : ' (dry run — nothing is written or created)'}\n`)
    if (apply && flags.db !== db.databaseName) {
      throw new Error(`--apply needs --db ${db.databaseName} to confirm the target database`)
    }

    const workos = new WorkOS(process.env.WORKOS_PROD_API_KEY)
    const idMap = await buildIdMap(db, workos, apply)
    if (idMap.size === 0) {
      console.log('Nothing to migrate.')
      return
    }

    const names = (await db.listCollections().toArray())
      .map(c => c.name)
      .filter(n => !n.startsWith('system.') && n !== 'users')
    names.push('users') // last: it's what marks a user as done

    console.log('')
    for (const name of names) {
      const coll = db.collection(name)
      let changed = 0
      for await (const doc of coll.find({})) {
        const next = rewriteDoc(doc, name, idMap) // throws on a value that won't decrypt — before anything for it is written
        if (!next) continue
        changed++
        if (apply) await writeDoc(coll, doc, next)
      }
      if (changed) console.log(`${name.padEnd(32)} ${apply ? 'rewrote' : 'would rewrite'} ${changed}`)
    }

    console.log(apply
      ? '\nDone. Now run: node --experimental-strip-types scripts/encrypt-existing.mjs --verify'
      : `\nRe-run with --apply --db ${db.databaseName} to write.`)
  } finally {
    await client.close()
  }
}

export { rewriteDoc }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
}
