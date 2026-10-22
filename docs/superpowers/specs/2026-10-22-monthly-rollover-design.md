================ DESIGN: MONTHLY ROLLOVER ================

## Intent

Today every month is a clean slate: unspent envelope money vanishes on the 1st and Ready to assign is per month. That broke for people paid late in the month (we had to tell them to "add the income for next month"). From now on, money carries: unspent envelope money rolls into the same envelope, unassigned money rolls into next month's Ready to assign. Assign ₹100 to travel, spend ₹5, and November's travel shows ₹100 assigned + ₹95 carried = ₹195 available. Income added on Oct 30 sits in Ready to assign and is there on Nov 1.

The product bar: a user who has never heard of envelope budgeting must understand what happened without reading anything longer than one line. Low learning curve beats accounting purity.

## Decisions (made by Sukrit, not open)

1. Overspending rolls as a negative into the same envelope, shown plainly ("₹20 short from October"). It is never silently subtracted from Ready to assign. The user fixes it with the existing move-money flow.
2. Income model is unchanged: monthly recurring income still counts from day 1 of the month, the payday row is still just a record; one-off income counts in the month it's dated. Leftover Ready to assign rolls. No cash-basis switch. (A later feature, "my month starts on payday", is out of scope; don't build toward it, just don't make it harder.)
3. Every envelope rolls. No per-envelope on/off toggle. Sweeping a pile back to Ready to assign is the existing move-money flow.
4. Rollover starts from the month this ships. Months before the start month contribute nothing. One server-side constant `ROLLOVER_START = '2026-10'` (so the first carry is October → November 2026). No per-user setting, no migration of history.
5. Month-start moment: first time a user opens the budget in a new month with a non-zero carry, one card at the top of the budget screen says what rolled, dismissed with the shared check animation. No review-and-confirm step, no decision required.
6. Credit card envelope: its leftover cash rolls like any other envelope; its assigned target still does not carry (existing behaviour in carriedAssigned). It stays excluded from totalAssigned as today.
7. Insights "Saved per month" stays income minus that month's spending (`src/lib/monthly.ts` leftoverFor). Untouched. Wrapped keeps its assigned + rolled_over − spent formula, which now means "what's still in your envelopes".

## The math (single source of truth: the server)

R = ROLLOVER_START. For category c and viewed month M:

- assigned(c, m): the explicit row's `assigned` if one exists for m, else the latest prior month's row (existing carriedAssigned; credit card → 0 when no explicit row).
- spent(c, m): sum of expenses dated in m with category c.
- rolled_over(c, M) = Σ over m from R to M−1 of (assigned(c, m) − spent(c, m)). Negative allowed. Zero when M ≤ R.
- available(c, M) = assigned(c, M) + rolled_over(c, M) − spent(c, M).

Ready to assign:

- income(m) = incomeBase(m) + extra(m) (existing).
- totalAssigned(m) = Σ assigned(c, m) over real envelopes (excluding `__credit_card__` and `__income__`, as today).
- carried_rta(M) = Σ over m from R to M−1 of (income(m) − totalAssigned(m)). Negative allowed (over-assigned months carry their deficit).
- readyToAssign(M) = carried_rta(M) + income(M) − totalAssigned(M).

Invariant to test: for any M ≥ R, Σ available(c, M) over real envelopes + readyToAssign(M) = Σ over m from R to M of (income(m) − spent(m)). Money is conserved; it only moves.

Late edits must just work: an expense dated Oct 30 logged on Nov 3 changes November's rolled_over. So compute on read from full history, never freeze. (ponytail: computing from all rows + all expenses since R on each read is fine at current scale; materialise a per-month summary only if it measurably hurts.)

## Where it lives

Server, in `lib/budgetCarry.ts` (already holds carriedAssigned): one function `computeCarry(auth, month)` → `{ month, ready_to_assign: number, rolled_over: Record<category, number> }`, built from the scoped budgets and expenses collections (amounts are encrypted fields, so aggregate in app code after decrypt, not in Mongo). Expose it as `GET /api/budgets/carry?month=YYYY-MM`. Use the existing `lib/cache.ts` keys for budgets and expenses so every write that already invalidates them invalidates this. Reuse `computeCarry` wherever the server already reasons about available or Ready to assign: `lib/ai/expenseContext.ts`, `lib/notifications/instant.ts` threshold reconciliation, `app/api/budgets/transfer/route.ts`, `app/api/balance-checks/[id]/resolve/route.ts`, `app/api/incomes/route.ts`. Grep for carriedAssigned, rolled_over and readyToAssign on the server and route each through it.

Clients: `src/lib/envelope.ts` (web) and the twin in aviary-mobile already have `rolledOver` on Envelope and `available = assigned + computedRollover − spent` with `computedRollover = 0`. Replace the hardcoded 0 with the carry endpoint's value, and add `carried_rta` into readyToAssign. Add a hook next to `useBudgets` that fetches `/api/budgets/carry` for the viewed month; invalidate it with budgets and expenses. Keep computeEnvelopeState pure: pass the carry in as an argument so its tests stay synchronous. Keep web and mobile formulas identical (the file headers say so).

## UX

All copy: second person, sentence case, short, contractions, no em dashes, `·` as separator. Reuse existing components and tokens; nothing new unless nothing fits.

- Envelope row: when rolledOver ≠ 0, one sub-line: "+₹95 from October" or "₹20 short from October". Available already includes it.
- Ready to assign: when carried_rta ≠ 0, one sub-line: "includes ₹5,000 from October" / "₹1,200 short from October".
- Assign / edit sheet: where a breakdown already exists, show four lines: assigned this month, carried from last month, spent, available.
- Month-start card (the peak-end moment): on the budget screen, shown once per (space, month) when month > R and the carry is non-zero. Title "October rolled into November". Body lists only the non-zero parts: "₹2,300 carried across 5 envelopes · ₹5,000 to Ready to assign", and when there are shortfalls "₹120 short in 2 envelopes" (the move-money flow fixes it; no new flow). Dismiss button uses the shared success animation (web: the SuccessButton/CheckIcon pattern, mobile: `src/components/shared/CheckIcon.tsx`). Persist the dismissal with the existing `useDismissedRolloverBanner(monthKey)` hook in both repos (web `src/hooks/useDismissedRolloverBanner.ts`, mobile twin). No server state.
- Copy that teaches the old behaviour must change, it's now wrong: the guided tour's rollover demo (`src/components/tour/content.ts` ROLLOVER_ROWS and the "Clean slate on the 1st" line, `src/components/tour/demos/RolloverDemo.tsx` with its "LEFTOVER GONE" / "FRESH START" labels, and the mobile twins), the landing FAQ `src/components/landing/faqs.ts` HOW_CATEGORIES_WORK ("Unspent money doesn't carry over inside a category: each month starts fresh"), the comment in `src/lib/monthly.ts` near savingsTrend, and anything else `grep -ri "clean slate\|starts fresh\|resets each month"` finds in user-facing strings, help content and blog MDX under `content/`. The tour demo should now show the leftover carrying.
- Onboarding: no change. Insights: no change.

## Tests (red-green, math first)

- `lib/budgetCarry.test.ts`: positive roll; negative roll; Ready to assign roll; income dated the last day rolls; late-logged prior-month expense changes this month's carry; credit card envelope rolls its cash but not its target; months before R contribute nothing; target carry + rollover compose (₹100 target + ₹95 = ₹195 available); the conservation invariant above; rounding to paise.
- Client: computeEnvelopeState with carry input (web and mobile), and the show-once logic of the month-start card.
- Run each repo's `npm run typecheck && npm run lint && npm test` before every commit.

## End-to-end, with screenshots for Sukrit

He will review screenshots before deciding whether to merge. Save them to `/Users/user-465/Projects/aviary/.claude/worktrees/` sibling dir `rollover-screenshots/` (or any stable absolute path outside both repos' tracked files) and embed every one in your final report with its absolute path in markdown so they render.

Scenario to drive, on both platforms, against a local dev backend (check the `switch-backend` skill and `.env` for the dev API; if you need a seeded test space, create one, never use real user data): assign ₹100 to a travel envelope in the current month, log a ₹5 expense; assign ₹300 to a food envelope, log ₹320 (overspend); add a one-off income dated the last day of the month and leave it unassigned. Then view next month (use the app's existing month navigation if it has one; otherwise set the device/system clock forward on the emulator and the browser context clock in Playwright) and capture: (1) travel row showing +₹95 carried and ₹195 available, (2) food row showing ₹20 short, (3) Ready to assign with the "includes … from <month>" line, (4) the month-start card before dismissing, (5) the dismiss check animation mid-way or just after, (6) the assign sheet breakdown. Then log a backdated expense into the previous month and screenshot that the carry updated (7).

Web: the `playwright-skill`. Mobile: iOS simulator via `npm run ios` in the mobile worktree (Android emulator is an acceptable fallback); the T3 `device_open` / `device_screenshot` tools can capture the simulator. Also run the guided tour's updated rollover demo once on each platform and screenshot it (8).

## Reporting

Final message to Sukrit: both PR URLs, head SHAs, CI state, the screenshots embedded, and anything you had to decide that the spec left open. Then stop. Do not merge.
