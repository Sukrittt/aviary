# task tracking

Tasks tracked in Notion board "Aviary".

# tests are the norm

Every new feature gets a test; run `npm run typecheck && npm run lint && npm test`
before every commit. Jest (`jest-expo` preset) + React Native Testing Library,
config in `jest.config.js`/`jest.setup.js`. Tests are co-located as `*.test.ts(x)`
next to their source, matching `Web/`'s Vitest convention. CI runs `npm test` on
every push/PR via `.github/workflows/test.yml`.

# success animation

App uses one shared success-tech animation (`src/components/shared/CheckIcon.tsx`: checkmark draw-on + haptic, swaps button label, background goes `tokens.mint`, auto-dismiss ~1100ms). Every synchronous success CTA (save/confirm button that resolves in-place) must reuse this pattern instead of a new toast/animation.

# voice and copy

The app is playful (Fredoka display font, Nunito body, `LoadingCaption.tsx`'s rotating
captions, Wrapped's persona cards), not corporate. Match that register in every string
a user reads: second person, sentence case, short.

- No em dashes in user-facing copy. They're the single most recognizable AI-generated
  tell, and a reader notices before they read a word. Split the sentence instead: two
  short sentences beat one long clause joined by a dash. Enforced by an eslint rule in
  `eslint.config.js`, so a stray em dash in a string fails `npm run lint`.
- Use contractions: "you're", "there's", "don't", "can't". Expanded forms ("you are not",
  "there is no", "you have assigned") are the second-loudest AI tell after the em dash, and
  every other screen already contracts, so a formal string sticks out. No lint rule catches
  this, so it's a review item.
- Never show raw server or exception text (`e.message`, `String(e)`) in an alert or
  inline error. "Failed to add expense: 503" gives the user nothing to act on. Write
  the message instead; match a known, already-written error case if there is one (see
  `app/(tabs)/envelopes.tsx`'s "already exists" check) and otherwise fall back to
  something generic like "Check your connection and try again."
- Reuse the app's existing typographic choices instead of improvising new ones: `·` as
  a separator (not `—` or `|`), the single `…` glyph for ellipsis (not three periods),
  and a standalone `—` only as the established placeholder glyph for a missing value
  (`EnvelopeRow.tsx`, `DatePicker.tsx`) rather than in a sentence.

# when to write tests first (TDD)

Default: build feature, then write tests after.

Write test first (red-green-refactor) when touching:

- budget/envelope math, balance calculations, rollover logic
- transaction categorization/matching rules
- import/parsing of bank/CSV data
- any bug fix (failing test reproducing bug, then fix)

Everything else (UI, screens, navigation, styling, CRUD scaffolding): feature first, tests after, or skip if trivial.

When a step doesn't need my input, keep going. Put status notes in the same message as the next action. Stop and ask only when you can't continue without me, before anything destructive (deleting data, force pushing, or changing anything outside this repository).
