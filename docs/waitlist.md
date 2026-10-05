# iPhone waitlist

`POST /api/waitlist` (the landing page's closing section) stores
`{ email, platform: 'ios', createdAt }` in the `waitlist` collection. The
privacy policy (`app/legal/privacy/page.tsx`) promises each address gets one
launch email and is then deleted. This is the procedure that keeps that promise.

## Removal requests before launch

Someone who asks to be removed through `/legal/contact`:

```js
db.waitlist.deleteOne({ email: '<their email, lowercased>', platform: 'ios' })
```

## On iPhone launch

Do these in order, in the same sitting.

1. Export the list (mongosh against prod):
   ```js
   db.waitlist.find({ platform: 'ios' }, { _id: 0, email: 1 }).toArray()
   ```
2. Send the launch email once to those addresses. Use BCC or a per-recipient
   send, never a visible `To:` list.
3. Delete the list:
   ```js
   db.waitlist.deleteMany({ platform: 'ios' })
   ```
4. Remove the form (`src/components/landing/IosWaitlist.tsx` and its use in
   `src/views/LandingPage.tsx`), the route (`app/api/waitlist/`), and update the
   privacy policy's waitlist section and the FAQ's iPhone answer.
