/**
 * Which fields are encrypted, per collection (lib/scoped.ts) — and nothing
 * else, deliberately: this file has zero imports so scripts/encrypt-existing.mjs
 * can import it directly under plain Node (`node --experimental-strip-types`),
 * which — unlike Next's bundler-mode resolution — needs an explicit .ts
 * extension on every hop, including this file's own. Importing lib/scoped.ts
 * itself from the script would drag in its `./crypto` import, which lacks
 * that extension (correctly, since every other file in this codebase omits
 * it) and Node's loader can't resolve.
 *
 * `'messages.text'` means "the `text` field inside each element of the
 * `messages` array" — the one nested case, handled specially wherever this
 * map is consumed.
 *
 * Deliberately not encrypted, because each is a filter/sort/index key: on
 * `expenses` — date, category, payment_method, timestamp; on
 * `budgets` — month, category; `categories`/`groups`/`category_map_overrides`
 * entirely (name/word are unique-index filter keys, and `categories.alertPcts`
 * needs no encryption either — thresholds, not money); `subscriptions.service`,
 * `.next_due_date`, `.billing_cycle`, `.status` (also filter/sort keys);
 * on `recurring_expenses` — category, payment_method, frequency, the three
 * dates and status, all of which the nightly cron filters or sorts on;
 * `holdings.name` (a future re-key to `_id` could move it into this list);
 * `chat_sessions.updatedAt` (sort + index); on `bill_scans` — category, date,
 * expense_id, people_count, items.qty, items.divisor, image_url, image_status,
 * created_at (filter/sort/join keys, or not money/PII to begin with).
 */
export const ENCRYPTED_FIELDS: Record<string, string[]> = {
  expenses: ['item', 'notes', 'description', 'amount_inr', 'amount'],
  budgets: ['assigned', 'rolled_over', 'extra'],
  subscriptions: ['amount_inr', 'notes'],
  recurring_expenses: ['item', 'notes', 'amount_inr'],
  recurring_detection: ['snapshot'],
  holdings: ['value', 'recurring_amount'],
  holding_events: ['amount', 'previous_value', 'new_value'],
  chat_sessions: ['title', 'messages.text'],
  bill_scans: ['merchant', 'total', 'my_share', 'items.name', 'items.price'],
}

export function fieldsFor(collectionName: string): string[] {
  return ENCRYPTED_FIELDS[collectionName] ?? []
}

/** AAD for one field's encryption — binds the ciphertext to its owner, collection, and field name. */
export function fieldAad(userId: string, collectionName: string, field: string): string {
  return `${userId}:${collectionName}:${field}`
}
