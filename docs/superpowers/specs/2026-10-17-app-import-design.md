# Switch from another budgeting app: import during onboarding

Status: approved for a web MVP, 2026-10-17. Mobile follows later and reuses the same API.

## Why

People who already budget in Money Manager, Monefy, Wallet, Spendee, YNAB, Goodbudget or axio don't want to start from scratch. Today the only way in is the manual onboarding, so a switcher arrives with years of history and an empty app. This feature lets them upload the export their old app already produces and continue where they left off: their categories, accounts, income, and history are all in place, and a budget is already assigned when they land on the envelopes screen.

## Goals

- A switcher finishes onboarding with one file upload and one review screen. No typing categories, no assigning amounts by hand.
- Works for the exports of the apps on the picker, and degrades to a generic column mapper for anything else that has a date, an amount and a description.
- Nothing is written until the user has seen what we read from the file and how we read it.
- Ten years of history can't make them wait. Structure is ready in seconds; transactions fill in behind them and we tell them when it's done.
- Every imported row goes through the existing write paths, so envelopes, the Credit Card envelope, the income ledger and the recurring scan all behave as if the user had logged the rows themselves.

## Non-goals (this MVP)

- Mobile UI. The mobile onboarding keeps its current flow. The API is built so mobile can call it later without changes.
- Importing into an account that's already set up. The entry point is onboarding only. A later version can expose the same flow under Account > Data.
- Investments, holdings, net worth, goals, historical budgets for past months.
- Cross-import duplicate detection. Running the same file twice during onboarding is prevented by one-import-per-account; a settings-page import later needs real dedupe.
- Bank statements. This reads budgeting-app exports, which carry the user's own categories. A bank CSV has none and belongs to a different feature.
- Undo of a finished import beyond the existing "clear transactions" tool.

## Anti-goals

- Never let an LLM read transaction rows. It maps column headers once per file and assigns source categories to groups once per file. Amounts, dates and item text never go to a model. Cost, privacy and a 20k-row file all rule it out.
- Never guess amount direction silently. A wrong sign turns a salary into spending for every month of history.
- Never book a transfer, an opening balance or an envelope fill as spending or income.
- No new dependencies. `exceljs` is installed and reads both xlsx and csv.

## The flow the user sees

1. **New first onboarding step: "Switching from another app?"** Two choices. "Yes, bring my data" opens the picker. "No, start fresh" continues into the current flow (currency, income, groups, categories, assign) untouched.
2. **Picker.** Money Manager, Monefy, Wallet, Spendee, YNAB, Goodbudget, axio, and "Another app or a spreadsheet". Each known app shows a two-line "how to export" hint and the file kind we expect (csv, xlsx, or zip for YNAB). The picker is a hint for detection and copy, not a hard commitment: a Money Manager file dropped under "Another app" still detects as Money Manager.
3. **Upload.** One file, 4 MB max. Vercel caps request bodies at 4.5 MB and the repo already codes to that (`app/api/expenses/scan/route.ts`, `app/api/bills/route.ts`); a ten-year Money Manager export is around 2 MB, so a plain multipart POST covers the MVP. Upgrade path if real files exceed it: client upload to the private Vercel Blob store `lib/expensePhoto.ts` already uses, with preview reading from the blob and deleting it. Spinner with the existing `LoadingCaption`.
4. **Review screen** (the only screen with work on it):
   - Headline counts: spends, income, the date range, and what we skipped with a reason per bucket ("312 transfers between your accounts", "2 opening balances", "14 rows in USD").
   - A direction line: "Read negative amounts as spends." with a flip. Three sample rows underneath so the user can sanity-check the read. Flipping re-runs the proposal step on the server (same import doc, no re-upload, one more Jev group call) and the review re-renders, so what the user approves is always what commit writes.
   - Currency: detected from the file when it has a currency column, otherwise the user's current `currencyCode` (`DEFAULT_CURRENCY`, as onboarding does today), with the existing `CurrencyPicker` to change it.
   - Envelopes: the source categories, each with the group we propose, editable per row (group dropdown, rename). Groups are the three onboarding starters (Essentials, Lifestyle, Savings) plus any the user adds here. Subcategories appear joined as "Food · Groceries".
   - Accounts: detected account names with a guessed type (bank, cash, credit card), editable.
   - Income: "We think your salary is ₹85,000 on about the 1st." when we found a monthly pattern, editable. Otherwise the existing income step's input.
   - Budget: one line, "We'll set each envelope to what you spent on it in a typical month. You can change any of them after."
   - CTA: "Looks right, set me up".
5. **Setup done.** Immediate. Groups, categories, accounts, income schedule and this month's budget exist. The existing `SetupDone` celebration runs. A line under it: "Your history is still coming in. Close the app if you like, we'll let you know when it's done."
6. **While the backfill runs**, the envelopes screen shows a slim banner: "Bringing in your history · 4,210 of 11,240". When it finishes, the banner becomes a one-tap nudge: "All in. Want us to find your repeat payments?" which opens the existing recurring suggestions scan. A push notification goes out if the account has a token, and an email either way.

## How it works

### Parsing, server side

`POST /api/import/preview` takes the file as multipart, parses it, detects a preset, normalises rows, and stores the normalised result on an `imports` document with status `previewed`. The response is the review payload. Nothing touches the user's collections yet. The same route accepts `{ importId, direction, currency }` without a file to recompute the proposal from stored rows after a flip or a currency change.

Normalised row shape, every value already validated:

```
{ kind: 'expense' | 'income' | 'skipped', date: 'YYYY-MM-DD', amount: number (major units, positive),
  item: string, category: string, account: string, notes: string, currency: string,
  skipReason?: 'transfer' | 'opening_balance' | 'fill' | 'other_currency' | 'unparseable' | 'zero' }
```

Parsing steps:

1. Read csv (any of comma, semicolon, tab; sniff from the header line; strip a BOM; fall back from utf-8 to windows-1252 if the text has replacement characters) or xlsx (first sheet with a header row we recognise) or zip (YNAB: look for `*Register.csv` and `*Plan.csv`).
2. Detect a preset by header signature. Presets are alias tables, never exact matches. Each preset declares which header names, lowercased and trimmed, play each role: date, amount (or outflow and inflow), direction column and its vocabulary, category, subcategory, account, note, description, currency, transfer flag, plus its bookkeeping-row tells. Known signatures, from parser code and help docs found 2026-10-17; none is from an official schema, so every alias table takes several spellings:
   - Money Manager (Realbyte): `Date|Period`, `Account|Accounts`, `Category`, `Subcategory`, `Note`, `Amount`, `Income/Expense`, `Description`, `Currency`, `Account Type`. Amounts unsigned; direction values `Income`, `Expense`, `Transfer-Out`, `Transfer-In`, `Transfer`. Date `dd/MM/yyyy HH:mm:ss`.
   - Monefy: `date, account, category, amount, currency, converted amount, currency, description`. Two `currency` columns is the signature; take the first. Signed, negative is spend. Bookkeeping categories match `^(To|From|Initial balance) '.*'$`.
   - Wallet (BudgetBakers): `account, category, currency, amount, refCurrency|ref_currency, refAmount|ref_currency_amount, type, paymentType|payment_type, note, date, transfer, payee, labels`. `type` is the direction. `transfer` true means skip. Keep `amount`/`currency`, not the ref pair.
   - Spendee: `Date, Wallet, Type, Category name, Amount, Currency, Note, Labels, Author`. `Type` is Income, Expense or Transfer. ISO dates with offset.
   - YNAB: Register `Account, Flag, Date, Payee, Category Group/Category, Category Group, Category, Memo, Outflow, Inflow, Cleared`. Payee starting `Transfer : ` is a transfer. Inflow with category `Inflow: Ready to Assign` is income. Plan `Category Group, Category, Month, Assigned, Activity, Available` gives this month's assigned amounts when present.
   - Goodbudget: `Date, Envelope, Account, Name, Notes, Amount, Status, Details`. Signed, convention unconfirmed, so this preset leans on the direction heuristic below and the flip. Envelope `[Unallocated]` with a positive amount is income; blank envelope with `Details` mentioning a fill or transfer is bookkeeping.
   - axio: undocumented. No preset. Falls through to generic, and the picker hint says "the CSV from the email, not the PDF".
3. Generic mapping when no preset matches: first by header aliases (date, amount, debit, credit, withdrawal, deposit, description, narration, particulars, payee, merchant, category, account, note, type, currency, and the same in title case). If date, amount and some text column are still unresolved, ask Jev once: one `choice` question per unresolved header with the roles as criteria, state is the header plus three sample values clipped to 40 characters. Below the existing confidence floor the column stays unmapped. If date or amount is still missing, the preview returns a clear error: "We couldn't find a date and an amount column. Check the file is the transactions export, not a report."
4. Date order is decided once per file from the data: a first field above 12 means day-first, a second field above 12 means month-first, otherwise day-first. ISO dates and xlsx date cells skip this. The review screen shows the resulting date range so a wrong order is visible as a nonsense range.
5. Direction. Preset rule first. For generic files: a direction column if one exists (income/expense/credit/debit/cr/dr vocab), else two amount columns (debit/credit), else the sign. The sign default is "negative is spend"; if more than 80% of rows are positive and the file has no direction column, flip the default to "positive is spend" since single-sign files are almost always spend-only trackers. Whatever was decided is shown and flippable on review. Refunds: once direction is settled, money in whose direction came from the amount (sign or column, not a type column) on a category the file spends from, and not an income-ish one (Salary, Income, Inflow: Ready to Assign), is a refund: booked as a negative spend on that envelope, the shape the app's read paths already treat as a refund, so it nets out of the budget averages and never feeds salary detection. The review counts them.
6. Currency. Rows carry a code when the file has a currency column; the file's currency is the most common code. Rows in another code are skipped as `other_currency` and counted. Files without a currency column take the currency the user confirms on review.
7. Limits. 4 MB upload (a bigger export is gzipped in the browser first, and the server gunzips it), 32 MB inflated, and no row cap: history comes in whole or the file is refused as too big, never trimmed. Rows are stored gzipped, so fifty thousand fit in about 1 MB of the encrypted `rows` blob, far under Mongo's 16 MB cap; past that, moving rows to their own chunked collection is the upgrade path. Item text clipped to 200 characters, notes to 300, matching the recurring scan.

### What the review payload proposes

- **Categories.** Distinct non-empty source categories among expense rows, subcategory joined with " · ". If there are more than 40, drop the subcategory level and recount. Empty category becomes "Uncategorised". Each gets a proposed group from one Jev call per file: a `choice` question per category over the group names (Essentials, Lifestyle, Savings), state is the category names only. Below the confidence floor, Lifestyle. Same gating as `app/api/onboarding/split-buckets`: rate limit, allowance, AI kill switch; when AI is off every category lands in Essentials and the user regroups by hand.
- **Accounts.** Distinct account names across all rows, capped at `MAX_ACCOUNTS`. Type guess: name contains credit or card means credit_card; cash or wallet means cash; else bank. `MAX_BANK_ACCOUNTS` applies; overflow accounts beyond the caps are dropped and their rows import with no account (payment method bank).
- **Income.** Group income rows by `normalizeItem` of the label (falling back to category), run `analyzeCadence` from `lib/recurringDetection.ts` on each group with two or more dates. The group with monthly cadence and the largest typical amount is the salary proposal: amount is the most recent occurrence, day is its billing day. No monthly group means no proposal and the field is blank.
- **Budget.** Per category: the average of the last three complete calendar months of expense rows in that category, rounded up to the nearest 100 (or 10 for currencies with small units; use the currency's existing formatting rules to pick). Zero when the category has no spend in that window. YNAB with a Plan.csv row for the current month uses that Assigned amount instead. The review shows the total proposed against the proposed income so a mismatch is visible, but assigning is not editable on this screen; the envelopes screen is where that lives already.

### Commit

`POST /api/import/commit` with the import id and the user's edits (per-category group and name, per-account type and name, salary amount and day, currency, direction flip). It must be idempotent on retry.

Synchronous, in this order, without going over HTTP. Only `createExpense` and `addIncome` exist as library functions today; groups, categories, budgets, accounts and recurring incomes are created inline in their route handlers (`app/api/groups/route.ts`, `app/api/categories/route.ts`, `app/api/budgets/route.ts`, `app/api/accounts/route.ts`, `app/api/recurring-incomes/route.ts`). Lift the insert logic of each into a small shared helper that the route and the commit both call, the way `createExpense` was lifted out of its route. Do not fork the logic.

1. Set the user's currency.
2. Create groups, then categories.
3. Create accounts.
4. Income: call `ensureIncomeMigrated` first (the recurring-incomes route does, and skipping it lets a later migration mint a second salary schedule). If a salary was confirmed, create the recurring income and sync the current month's `__income__` assigned amount via `syncMonthlyIncome`. Income rows are `counted: 'monthly'` only when they match the salary pattern and fall in the current month, since that month's `assigned` already counts the salary. Every other income row, including past months' salary, is `counted: 'extra'`, so a past month shows its real income when browsed. This is budget math: write the test first.
5. Budgets for the current month from the proposal.
6. Flip the import to status `importing` with `done: 0`, `total: n`.
7. Call the existing `completeOnboarding` so the trial starts and `onboardedAt` is set. The 409 guard there needs an `__income__` budget row and at least one category, which steps 2 and 4 provide.
8. Kick the backfill (below) and return.

The client then shows `SetupDone` and routes into the app.

### Backfill

Transactions are written in chunks, oldest first, each row through `createExpense` (with `notify: false`) or `addIncome`, with `source: 'import'`, an `import_id`, and `client_id` derived from the import id and row index so a retried chunk can't double a row. Both functions need small signature changes: `import_id` as a passthrough field on each insert, and `'import'` added to `INCOME_SOURCES` and its validation (`source` is an unencrypted filter key there). After each chunk the import doc's `done` counter advances. The Credit Card envelope and the per-month `__income__` extra rows update as a side effect of the existing paths, which is the point of using them.

Execution model, chosen for Vercel's per-request ceiling rather than for elegance:

- The commit route starts the first pass inside `after()` and processes chunks until it is 10 seconds from `maxDuration` (set 60), then stops cleanly.
- `POST /api/import/continue` runs another pass with the same budget. The in-app banner's poll calls it whenever the import is still `importing` and no pass is currently leased. The lease is a `lockedUntil` field on the import doc, same shape as the recurring scan's lock.
- The hourly `evening-check` route also sweeps for `importing` docs with an expired lease and runs a pass, so a user who closed the tab still finishes within the hour. The sweep is its own query over `imports`, called from the route alongside `runEveningCheck`, not inside it: that function only iterates users with push tokens, and a web-only importer has none. Set `maxDuration` on that route. This avoids a `vercel.json` change.
- A chunk that throws marks the rows failed with the error, increments `failed`, and continues. Three consecutive failing chunks set status `failed` and notify the user with the generic connection copy; the error text is stored on the import doc and logged with `console.error` (the admin audit helper is for admin writes, not a system error sink).
- On `done === total`, set status `done`, write the completion notification once (a `notified_at` guard): push via `sendPushNotification` when a token exists, email via `sendEmail` with `transactionalTemplate`, idempotency key `import-done:<importId>`.

Expected speed: a few hundred rows per second is not needed. At 20 rows a second a 12,000-row file finishes in ten minutes, well inside the hourly sweep, and the user already has a working app.

### Status and banner

`GET /api/import/status` returns `{ status, done, total, failed, skipped: {reason: count}, finishedAt }` or `{ status: 'none' }`. The envelopes screen polls every 5 seconds while `importing`, stops otherwise. The done state renders the recurring nudge; dismissing it stores a flag in the existing local preference helper so it doesn't return.

### Data model

New collection `imports`, user-scoped like the rest, added to `COLLECTIONS`:

```
{ _id, user_id, status: 'previewed' | 'importing' | 'done' | 'failed' | 'cancelled',
  app: string, filename: string, currency: string, direction: 'negative_spend' | 'positive_spend',
  rows: encrypted JSON string of normalised rows, total, done, failed,
  skipped: Record<reason, number>, lockedUntil, token, created_at, finished_at, notified_at }
```

`rows` goes in `ENCRYPTED_FIELDS` because it holds item text and amounts, like `recurring_detection.snapshot`. Only one non-terminal import per user: preview replaces a previous `previewed` doc; a second commit while one is `importing` is a 409.

Expenses and incomes written by the backfill carry `import_id` so a later "remove this import" has something to key on. It's not in `EXPENSE_HEADERS`, same reasoning as `client_id`.

### AI usage

Two call sites, both through `runJev`, both logged under a new `AiFeature` value `'import'`, both inside the monthly allowance:

- Column roles, only when alias matching leaves date, amount or text unresolved.
- Category to group assignment, once per preview.

Neither sees row values beyond the three clipped samples per unresolved header. If AI is disabled by the kill switch, both degrade: unresolved columns stay unresolved, categories land in Essentials.

### Analytics

Track like the other onboarding steps: `import_started` with the picked app, `import_previewed` with detected preset, row counts and skip counts, `import_direction_flipped`, `import_committed`, `import_done` with duration, `import_failed` with the stage.

## Edge cases the builder must cover

- Header row not on line 1 (a title line above it, common in emailed statements): scan the first 10 lines for the line with the most recognisable aliases.
- Quoted fields containing the delimiter and newlines. Use a real csv parser, not `split(',')`. `exceljs` has one for csv; if it proves awkward for delimiter sniffing, a small RFC 4180 state machine is acceptable, with tests.
- Amount strings: `1,250.00`, `1.250,00`, `₹1,250`, `$ 10`, `(1,250.00)` for negative, `1 250,00`, trailing `CR`/`DR`. Decimal separator decided per file: if every amount's last separator is a comma, comma is decimal.
- Two-decimal currencies versus zero-decimal ones: store major units as the app already does.
- Dates with time, dates as Excel serials, two-digit years, `Sept` versus `Sep`, Hindi or other locale month names fall to unparseable and are counted.
- Future-dated rows (scheduled transactions some apps export): skip as `unparseable` with its own count, "17 rows dated in the future".
- Rows dated before 2000: likely bad parses, counted the same way.
- Zero amounts: skipped and counted.
- A file that is all income or all spends: direction heuristic handles it; review still shows the flip.
- Duplicate category names that differ only in case or whitespace: merged by `normalizeItem`.
- Category names longer than the app's limit: clipped, user sees the clipped name on review.
- More accounts than `MAX_ACCOUNTS`: the review says which ones we kept and that the rest import without an account.
- The same file uploaded twice before commit: second preview replaces the first.
- Commit retried after a network blip: idempotent, returns the same import.
- User abandons after preview: add an age sweep to the gc cron that deletes `previewed` imports older than 24 hours. The gc route today only clears `deleted_at` rows, so this is a new step there.
- User's currency differs from the file's: the file's wins at commit since it describes the money; the user confirmed it on review.
- Imported months where the user had no budget: that is fine, history shows spend against no assignment and the carry logic ignores months with no budget rows. Confirm with a test rather than assuming.
- The recurring scan window is 12 months at most, so a ten-year import still only scans the recent year. That is correct behaviour; mention it nowhere in copy.
- Push token absent (web onboarding, no mobile install): email only.
- `completeOnboarding` already called (user refreshed mid-commit): idempotent by design, no special handling.

## Copy

Second person, sentence case, contractions, no em dashes, `·` as the separator. Strings to start from:

- Step title: "Switching from another app?"
- Choices: "Yes, bring my data" · "No, start fresh"
- Upload: "Drop your export here" · "csv, xlsx or the YNAB zip · up to 10 MB"
- Preview headline: "Here's what we found"
- Counts: "1,240 spends · 36 paydays · Mar 2019 to Oct 2026"
- Skipped: "We left out 312 transfers between your accounts, 2 opening balances and 14 rows in USD. They aren't spending."
- Direction: "We're reading negative amounts as spends." with "That's backwards" as the flip.
- Budget line: "We'll set each envelope to what you spent on it in a typical month. Change any of them later."
- CTA: "Looks right, set me up"
- Done: "Your history is still coming in. Close the app if you like, we'll let you know when it's done."
- Banner: "Bringing in your history · 4,210 of 11,240"
- Finished banner: "All in. Want us to find your repeat payments?"
- Email subject: "Your history's in" · body: "All 11,240 spends and paydays from Money Manager are in Aviary. Open the app to pick up where you left off."
- Errors: "We couldn't read that file. Check it's the transactions export, not a report." · "That file's too big. Export a shorter date range and try again." · generic: "Check your connection and try again."

## Tests

Parsing is on the TDD list in CLAUDE.md, so parsers, direction, date order, amount parsing, currency pick, budget averaging and salary detection are written test-first, with one fixture file per preset checked into the test folder (hand-written from the header tables above, a dozen rows each, including a transfer, an opening balance, a second currency and a split). Route tests follow the existing pattern in `app/api/*/route.test.ts`. The backfill gets a test that a retried chunk doesn't double a row and that a thrown chunk doesn't stop the import.

## Calls made without the user (check these)

- Groups come from the three onboarding starters plus whatever the user adds on review; source apps' own group concepts (YNAB category groups) are not imported as groups in the MVP. YNAB users will regroup by hand. Upgrade: use `Category Group` as the group when present.
- Budget prefill rounds up to the nearest 100. A user with a small-unit currency gets 10.
- Salary proposal takes the most recent amount, not the average.
- Income rows outside the salary pattern are `extra` for their month, which creates `__income__` rows for past months. That matches what manual logging would have produced.
- No per-category merge on review. Rename and regroup only. Merge is the first thing to add if review screens get long.
- Hourly cron sweep rides on `evening-check` rather than a new cron entry.
- The recurring scan is nudged, not auto-run, after the backfill. Auto-running would spend AI allowance without the user asking.
- The settings-page entry point and mobile are explicitly next, not now.
- Upload is a 4 MB multipart POST, not a Blob upload. Covers typical exports; Blob is the upgrade.
- Rows live gzipped on a single encrypted document. A chunked rows collection is the upgrade.
- A direction flip re-runs the proposal (one more Jev call) rather than committing blind.
- Past-month salary rows are `extra`; only current-month salary rows are `monthly`.

## Left to the builder

- File and module layout under `lib/import/` and `app/api/import/`.
- Chunk size and the exact pass budget.
- Whether the csv reader is `exceljs` or a small in-repo parser.
- The review screen's component structure, as long as it reuses onboarding's existing pieces (`CurrencyPicker`, `LoadingCaption`, `Toast`, the step dots, and `SetupDone`, which is local to `app/onboarding/page.tsx` so the import steps live in that page or lift it) and the success CTA uses the shared check animation per CLAUDE.md.
- Test fixtures.
