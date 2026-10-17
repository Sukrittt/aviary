# Switch From Another Budgeting App: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new first web onboarding step that reads another budgeting app's export, shows the user what was read, and sets up groups, categories, accounts, salary, this month's budget and the full history.

**Architecture:** Pure parsing and proposal code lives in `lib/import/` (no DB, test-first). Two thin routes (`preview`, `commit`) store normalised rows on an encrypted `imports` doc and write structure through helpers lifted out of the existing routes. A leased, resumable backfill (`lib/import/backfill.ts`) writes every row through `createExpense`/`addIncome`, driven by `after()`, `/api/import/continue` and the hourly `evening-check` sweep.

**Tech Stack:** Next.js 15 route handlers, MongoDB through `lib/scoped.ts`, `exceljs` (xlsx only), Node `zlib` (zip), Vitest + `mongodb-memory-server`, React 19 + TanStack Query.

**Spec:** `docs/superpowers/specs/2026-10-17-app-import-design.md`

## Global Constraints

- No new dependencies. CSV is an in-repo RFC 4180 parser; zip is `zlib.inflateRawSync` over the central directory; xlsx is `exceljs`.
- No LLM reads row values. Jev sees header names plus three samples clipped to 40 characters, and category names only.
- Limits: 4 MB upload, 20,000 rows after parsing (newest kept), item clipped to 200, notes to 300, category names to 60.
- Transfers, opening balances, envelope fills, other-currency, zero, unparseable and future rows are skipped and counted, never booked.
- Copy: second person, sentence case, contractions, no em dashes, `·` separator, `…` glyph. Never render server or exception text; the server returns error codes and the client maps them to written copy.
- Success CTA ("Looks right, set me up") uses `SuccessButton` + `useButtonPhase` (`src/components/SuccessButton.tsx`).
- `npm run typecheck && npm run lint && npm test` before every commit.

## Review Focus

1. A semicolon-delimited, comma-decimal file with a title line above the header (European bank style). Expected: header found, amounts right. Pinned in Task 1 (`readTable`) and Task 2 (amount).
2. A retried commit after a lost response. Expected: same import, no second set of groups/accounts/salary schedule. Pinned in Task 6.
3. A backfill pass killed mid-chunk and resumed. Expected: no doubled rows, no doubled Credit Card bump. Pinned in Task 7.
4. Salary that stopped years ago in a ten-year file. Expected: no salary proposal (last payday must be within 62 days). Pinned in Task 4.
5. A file whose history is shorter than three complete months. Expected: the budget divides by the months the file actually covers, not by 3. Pinned in Task 4.

---

### Task 1: Reading files (csv, xlsx, zip, header row)

**Files:**
- Create: `lib/import/read.ts`, `lib/import/read.test.ts`, `lib/import/fixtures/*` (one per preset, Task 3)

**Interfaces:**
- Produces: `decodeText(buf: Buffer): string` (strip BOM, utf-8, fall back to windows-1252 on U+FFFD), `parseCsv(text: string): string[][]` (sniff `,` `;` `\t` from the header line, quoted fields with delimiters/newlines/`""`), `readZip(buf: Buffer): Map<string, Buffer>`, `readTable(buf: Buffer, filename: string): Promise<Table[]>` where `Table = { name: string; rows: string[][] }`; xlsx date cells become `YYYY-MM-DD`, numbers become `String(n)`. `findHeaderRow(rows: string[][], score: (cells: string[]) => number): number` scans the first 10 lines for the highest score.

- [ ] Test first: quoted delimiter + embedded newline + doubled quote; semicolon sniff; tab sniff; BOM stripped; windows-1252 `é` recovered; header on line 3 found; zip round-trip with a stored and a deflated entry (build the zip in the test with `zlib.deflateRawSync`); xlsx round-trip written with exceljs in the test, a Date cell reads as `2026-10-01`.
- [ ] Implement, run, commit `feat(import): read csv, xlsx and zip exports`.

### Task 2: Amounts, dates, direction (pure, TDD)

**Files:** Create `lib/import/parse.ts`, `lib/import/parse.test.ts`

**Interfaces:**
- `detectDecimalComma(samples: string[]): boolean`: true when every sample with a separator ends in a comma, and at least one has 1-2 digits after it.
- `parseAmount(raw: string, decimalComma: boolean): number | null`: signed, 2 dp. Handles `1,250.00`, `1.250,00`, `₹1,250`, `$ 10`, `(1,250.00)` → -1250, `1 250,00`, `10 DR` → -10, `10 CR` → 10.
- `detectDateOrder(samples: string[]): 'dmy' | 'mdy'`: first field > 12 → dmy, second > 12 → mdy, else dmy.
- `parseDate(raw: string, order: 'dmy' | 'mdy'): string | null`: ISO with time/offset, `dd/MM/yyyy HH:mm:ss`, `.`/`-` separators, two-digit years (≤ 69 → 20xx), English month names incl. `Sept`, Excel serials (20000-80000), anything else null.
- `defaultDirection(signs: number[], hasDirectionColumn: boolean): 'negative_spend' | 'positive_spend'`: positive_spend when > 80% positive and no direction column.

- [ ] Write every case above as a failing test, run (FAIL), implement, run (PASS), commit `feat(import): parse amounts, dates and amount direction`.

### Task 3: Presets, generic mapping, normalisation (TDD, one fixture per preset)

**Files:** Create `lib/import/presets.ts`, `lib/import/normalize.ts`, `lib/import/normalize.test.ts`, `lib/import/fixtures/{money-manager.csv, monefy.csv, wallet.csv, spendee.csv, ynab-register.csv, ynab-plan.csv, goodbudget.csv, generic.csv}`

**Interfaces:**
- `type Role = 'date'|'amount'|'outflow'|'inflow'|'type'|'category'|'subcategory'|'account'|'note'|'text'|'currency'|'transfer'`
- `type Mapping = Partial<Record<Role, number>>` (column index)
- `PRESETS: Preset[]`, `Preset = { id: AppId; aliases: Partial<Record<Role, string[]>>; signature: (headers: string[]) => boolean; classify(row: Cells): Classified }` where `classify` applies the preset's direction vocabulary and bookkeeping tells.
- `type AppId = 'moneymanager'|'monefy'|'wallet'|'spendee'|'ynab'|'goodbudget'|'generic'`
- `detectPreset(headers: string[]): Preset | null`, `aliasMapping(headers: string[]): Mapping` (generic aliases), `unresolvedHeaders(headers, mapping): number[]`.
- `type SkipReason = 'transfer'|'opening_balance'|'fill'|'other_currency'|'unparseable'|'zero'|'future'`
- `type StoredRow = { kind: 'expense'|'income'|'skipped'; date: string; amount: number; item: string; category: string; subcategory: string; account: string; notes: string; currency: string; skipReason?: SkipReason }` (kind as read under `negative_spend`; Task 4 flips).
- `normalizeTable(table: Table, preset: Preset | null, mapping: Mapping, today: string): Normalized` → `{ rows: StoredRow[] (oldest first, capped), droppedOverCap: number, defaultDirection, directionSource: 'column'|'sign', hasCurrency: boolean, plan: Record<string, number> }`. Throws `ImportError('no_columns')` when date or amount is unmapped, `ImportError('unreadable')` when nothing parses.

- [ ] Hand-write each fixture (a dozen rows: a transfer, an opening balance, a second currency, a split) from the spec's header tables.
- [ ] Failing tests per fixture: detected preset id, counts per kind, skip counts per reason, one expense and one income row's exact fields. Plus generic: debit/credit columns, a type column with `Dr`/`Cr`, a sign-only spend tracker (defaults to positive_spend), a future row → `future`, a 1999 row → `unparseable`, zero → `zero`, 20,001 rows → 20,000 kept, newest.
- [ ] Implement, run, commit `feat(import): detect app presets and normalise rows`.

### Task 4: Proposals (TDD, budget math)

**Files:** Create `lib/import/propose.ts`, `lib/import/propose.test.ts`

**Interfaces:**
- `resolveRows(rows: StoredRow[], o: { direction, currency, hasCurrency }): StoredRow[]`: flips expense/income for `positive_spend`, skips `other_currency`.
- `categoryKey(row, joinSub: boolean): string` (`"Food · Groceries"`, empty → `Uncategorised`, clipped to 60), `proposeCategories(rows): { source: string; spent: number }[]` (drops sub level above 40, merges by `normalizeItem`).
- `proposeAccounts(rows): { accounts: { source, name, type }[]; dropped: string[] }`: by row count, `MAX_ACCOUNTS` and `MAX_BANK_ACCOUNTS`, type from name (credit|card → credit_card, cash|wallet → cash).
- `detectSalary(rows, today): { key: string; label: string; amount: number; day: number } | null`: groups by `normalizeItem(item || category)`, `analyzeCadence` monthly, largest median, most recent amount, last date within 62 days of today.
- `budgetStep(currency): 10 | 100` (10 for `SMALL_AMOUNT_CURRENCIES`: USD EUR GBP CHF CAD AUD NZD SGD KWD BHD OMR JOD).
- `proposeBudgets(rows, categoryOf: (r) => string, today, currency, plan): Record<string, number>`: the last three complete months, divided by how many of them the file covers (min 1), rounded up to the step; a plan amount wins.
- `incomeCounted(row, salaryKey: string | null, currentMonth: string): 'monthly' | 'extra'`.

- [ ] Failing tests: flip, currency skip, sub-join and the 40 cap, case/space merge, account caps and types, salary found / none / stale (> 62 days) / most-recent amount, budget average with a 3-month window and with a 1-month history, step 10 vs 100, plan override, `incomeCounted` current-month salary vs past salary vs other income.
- [ ] Implement, run, commit `feat(import): propose categories, accounts, salary and budgets`.

### Task 5: Lift shared write helpers out of routes

**Files:** Create `lib/groups.ts`, `lib/categories.ts`, `lib/budgets.ts`; modify `lib/accounts.ts`, `lib/income.ts`, `lib/createExpense.ts`, and the five routes (`groups`, `categories`, `budgets`, `accounts`, `recurring-incomes`).

**Interfaces:**
- `createGroup(auth, name): Promise<'created' | 'exists'>`
- `createCategory(auth, { name, group, icon? }): Promise<'created' | 'exists'>` (unique-index race → `'exists'`)
- `createBudgetRow(auth, { month, category, assigned, rolled_over? }): Promise<'created' | 'exists'>` (keeps invalidate + `reconcileThresholdLevels`)
- `createAccount(auth, { name, type }): Promise<string>` throws `AccountWriteError(409, message)` for a duplicate name or a cap.
- `createRecurringIncome(auth, { label, amount, frequency, start_date, end_date?, account_id?, client_id? }): Promise<string>` (`ensureIncomeMigrated`, insert, `settleRecurringIncomes`; a duplicate `client_id` returns the existing id). `settleRecurringIncomes(auth)` moves out of the route.
- `CreateExpenseInput.import_id?: string`, `AddIncomeInput.import_id?: string`, `INCOME_SOURCES` gains `'import'`, `addIncome` rejects an unknown source with 400.

- [ ] Existing route tests must stay green; add a test each for `createCategory` duplicate → `'exists'` and `addIncome` unknown source → 400, and `import_id` landing on both inserts. Commit `refactor: lift group, category, budget, account and recurring income creation into lib`.

### Task 6: `imports` collection, preview and commit

**Files:** Create `lib/import/store.ts`, `lib/import/ai.ts`, `lib/import/commit.ts`, `app/api/import/preview/route.ts`, `app/api/import/commit/route.ts` + tests; modify `lib/models.ts` (`imports`), `lib/encryptedFields.ts` (`imports: ['rows']`), `lib/ai/usage.ts` (`'import'`), `scripts/ensure-indexes.mjs`.

**Interfaces:**
- `ImportDoc` per spec plus `plan`, `hasCurrency`, `defaultDirection`, `directionSource`, `droppedOverCap`, `cursor`, `streak`, `streak_start`, `last_error`.
- `pickColumnRoles(headers: { name, samples }[], caller): Promise<Record<number, Role>>`, `pickCategoryGroups(names: string[], groups: string[], caller): Promise<Record<string, string>>` in `lib/import/ai.ts`, both via `runJev`, `MIN_CONFIDENCE` floor.
- `buildReview(doc, auth): Promise<Review>`; `Review = { importId, app, filename, direction, directionSource, currency, hasCurrency, counts: { expense, income, from, to }, skipped, droppedOverCap, samples, categories: { source, name, group, monthly }[], groups, accounts, droppedAccounts, salary, budgetTotal }`.
- `CommitEdits = { currency, direction, groups: string[], categories: { source, name, group }[], accounts: { source, name, type }[], salary: { amount, day } | null }`; `commitImport(auth, importId, edits): Promise<{ importId, total, categoryCount, groupCount, income }>` throws `ImportError` codes `not_found`, `already_importing`, `invalid`.
- Error codes over the wire: `too_big`, `unreadable`, `no_columns`, `not_found`, `already_importing`, `invalid`.

- [ ] Tests (memory replset): commit writes currency, groups, categories, accounts, salary schedule + `__income__` assigned, budgets, flips to `importing`, onboards; a second identical commit returns the same import and writes nothing twice; a second import while one is `importing` → `already_importing`. Route tests with mocks: preview 413 code `too_big` above 4 MB, `no_columns` copyable code, flip recompute without a file.
- [ ] Commit `feat(import): preview and commit an export during onboarding`.

### Task 7: Backfill, continue, status, sweeps, notifications

**Files:** Create `lib/import/backfill.ts` + test, `app/api/import/continue/route.ts`, `app/api/import/status/route.ts`; modify `app/api/cron/evening-check/route.ts` (sweep + `maxDuration = 60`), `app/api/cron/gc/route.ts` (24 h previewed sweep).

**Interfaces:**
- `runImportPass(auth, importId, deadlineMs: number): Promise<'leased' | 'progress' | 'done' | 'failed'>`: lease via `lockedUntil`/`token` (conditional update, 70 s TTL), chunks of 50 from `cursor`, per-row try/catch counts `failed`, an all-failed chunk extends `streak`, three → `failed` + notify; `done === total` → `done` + one notification guarded by `notified_at`.
- `sweepImports(deadlineMs): Promise<number>` (cross-tenant, expired leases, `importing`).
- `notifyImport(userId, doc, outcome)`: `sendPushNotification` + `sendEmail(transactionalTemplate)` key `import-done:<id>`.
- Status payload `{ status, done, total, failed, skipped, finishedAt, leased, importId }` or `{ status: 'none' }`. Continue `{ retry?: true }` rewinds a failed import to `streak_start`.

- [ ] Tests: a pass writes rows through the real `createExpense`/`addIncome`; rerunning from a rewound cursor doubles nothing; a chunk whose rows all throw doesn't stop the import; three bad chunks → `failed`; finish sends one email; a held lease returns `'leased'`.
- [ ] Commit `feat(import): backfill history in leased passes with a cron sweep`.

### Task 8: Web UI

**Files:** Create `src/api/imports.ts`, `src/components/onboarding/ImportFlow.tsx` (+ test), `src/components/ImportBanner.tsx` (+ test), styles in `src/expense-redesign.css`; modify `app/onboarding/page.tsx` (entry step, `SetupDone` history line), `src/views/ExpensePage.tsx` (banner), `src/lib/analytics.ts` (events).

- [ ] Entry step → picker → upload → review → commit (SuccessButton) → `SetupDone` with the history line. Banner polls status every 5 s while importing, calls continue when not leased, shows done nudge (dismiss stored with `writePref`) linking to `/account/recurring`.
- [ ] Tests: entry "No, start fresh" lands on the currency step untouched; review renders counts/skips copy and flip calls preview with the other direction; error codes map to written copy; banner progress text and done nudge.
- [ ] Commit `feat(onboarding): switch from another app on web`.
