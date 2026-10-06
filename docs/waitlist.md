# iPhone waitlist

`POST /api/waitlist` (the landing page's closing section) stores
`{ email, platform: 'ios', createdAt }` in the `waitlist` collection. The
privacy policy (`app/legal/privacy/page.tsx`) promises each address gets one
launch email and is then deleted. This is the procedure that keeps that promise.

## Before enabling signup in production

Run `npm run db:indexes` against the production database, using the existing
production environment. This command logs individual index failures, so its
exit code alone is not proof of success. Verify `db.waitlist.getIndexes()`
contains a unique `{ email: 1, platform: 1 }` index before enabling the form.
It prevents simultaneous requests for the same address from creating two rows.
If the index fails because duplicates already exist, stop and investigate;
do not delete addresses just to make deployment pass.

## Removal requests before launch

Someone who asks to be removed through `/legal/contact`:

```js
db.waitlist.deleteOne({ email: '<their email, lowercased>', platform: 'ios' })
```

## On iPhone launch

Close signup before exporting or deleting addresses. Follow these steps in
order; keep the cutoff in place throughout sending and cleanup.

1. First deploy the form removal and make `POST /api/waitlist` return `410`
   before any database write. Verify the production aliases return `410`.
   Protect or retire old deployment URLs that could still accept signups
   against the production database; do not leave a rollback accepting them.
2. Drain requests that began before the cutoff. Check deployment request logs
   and wait for those requests to finish, allowing the configured maximum
   request duration after the last possible pre-cutoff invocation. Do not
   export while an old worker can still write a signup.
3. Export the final list, including each row's `_id`, with authenticated
   production database tooling:
   ```js
   db.waitlist.find({ platform: 'ios' }, { email: 1 }).toArray()
   ```
4. Send the launch email once per address. Use BCC or a per-recipient send,
   never a visible `To:` list. Record which exported IDs were successfully
   emailed; retry failed deliveries without resending successful ones.
5. Delete only successfully emailed IDs, rather than the entire collection:
   ```js
   db.waitlist.deleteMany({ platform: 'ios', _id: { $in: emailedIds } })
   ```
   Keep unemailed rows for delivery retries. Investigate any rows not in the
   final export before deleting them. After all deliveries, verify no iOS
   rows remain and delete the temporary export and delivery records too.
6. Remove the obsolete route and update the privacy policy's waitlist section
   and the FAQ's iPhone answer. Keep obsolete production deployment URLs
   unable to accept writes.
