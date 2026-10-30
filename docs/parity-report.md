# Web and Mobile parity report

Where the two Aviary apps disagree, sorted by user impact. Snapshot of 2026-10-30:
Web `staging` at `a0d2e238`, Mobile `staging` at `fd89bb37`. Line numbers are for those
commits and will go stale; the file and the described behaviour are the durable part.

**Classes:** **bug** means one side is wrong. **gap** means one side lacks something it
should have, or the right answer is a product call. **intentional** means it suits the
platform.

**How this was checked:** by reading the code, not by running either app. Numbers in
examples come from reading the code or from node snippets, unless the item says it has a
test. These items were re-read a second time against the code: 1, 2, 3, 4, 5, 6, 7, 8, 9,
and fixes F1 to F6. The rest have one reading behind them, so check the code before acting.

"Port in progress" means a one-sided commit from the last few days, so the other side may
simply not have caught up yet.

## Decisions from Sukrit (2026-10-30)

These override the "needs a decision" notes on the items below.

| Item | Decision | Status |
| --- | --- | --- |
| 8 | Transactions open on this month on both sides. Web gets no "all" period for now, so search there stays inside the selected period. | Default changed on Web. The search gap remains. |
| 10 | No Ready to Assign cap on Mobile. It keeps its "₹X over" warning. | No change needed. The different stored data in item 10 is still open. |
| 13, 14 | Mobile doesn't get "return all money" or expense splitting. | Closed |
| 20 | One category rule on both sides: most matching words wins, first seen on a tie, and a dictionary name also matches a category that contains it. | Shipped as `src/lib/matchCategory.ts` in both repos |
| 27 | Leave Wrapped as it is on Web. | Closed |
| 57 | The settings screen and its tab are called Account everywhere. | Renamed on both sides, including the Ask Aviary guide and public pages |

## Fixed in this pass

| # | Side | What was wrong | PR |
| --- | --- | --- | --- |
| F1 | Web | "Log several at once" didn't send `capture: true`, so a list could come back as prose instead of a review card. `Web/src/api/ai.ts`, `Web/src/components/MoneyBrainDrawer.tsx`; Mobile: `Mobile/src/api/ai.ts:165` | [aviary#315](https://github.com/Sukrittt/aviary/pull/315) |
| F2 | Web | Sign-out left the `aviary-budget` cookie and active budget key, so the next account hit `NOT_A_MEMBER` and a forced reload. `Web/src/services/accessMode.ts`; Mobile: `Mobile/app/_layout.tsx:174` | aviary#315 |
| F3 | Web | `formatDate` showed the previous day for date-only strings west of UTC. `Web/src/lib/format.ts`; Mobile: `Mobile/src/lib/format.ts:47` | aviary#315 |
| F4 | Mobile | Retrying a failed expense with a blank description sent an empty item, which the server rejects. `Mobile/app/modals/expense-failed.tsx`; Web: `Web/src/components/LogExpenseModal.tsx:339,344` | [aviary-mobile#339](https://github.com/Sukrittt/aviary-mobile/pull/339) |
| F5 | Mobile | A blank "Add item" row silently lost the past-scan record. `Mobile/src/features/scan-bill/useScanBillController.ts`; Web: `Web/src/features/scan-bill/useScanBillController.ts:156-160` | aviary-mobile#339 |
| F6 | Mobile | Delete-budget confirm was case-sensitive; Web and the server aren't. `Mobile/app/budget-members.tsx`; Web: `Web/src/components/BudgetMembers.tsx:380` | aviary-mobile#339 |

## High impact

Money and import items are report-only here, since other work is covering those areas. Check
whether it already landed before picking one up.

1. **Web rounds every logged expense to a whole number.** 99.50 saves as 100. 0.4 rounds to 0, gets a 400 and shows "Couldn't save". **bug**, Mobile is right, small, money.
   - Web: `Web/src/components/LogExpenseModal.tsx:345` (also `:135`, `:365`); zero rejected at `Web/lib/inputValidation.ts:25`
   - Mobile: `Mobile/app/modals/log-expense.tsx:499`, 2-decimal cap at `Mobile/src/lib/calcAmount.ts:44`
2. **Ready exports can't be downloaded on Web.** The row reads a field the API stopped sending on 2026-09-02, so it shows a raw timestamp with no link, and failed rows give no reason. **bug**, Mobile is right, small. Not fixed here: it's a visible change and needs a logged-in browser run.
   - Web: `Web/app/account/data/page.tsx:181,183`, `Web/app/api/data/exports/route.ts:18-23`; unused helper at `Web/src/api/account.ts:164`
   - Mobile: `Mobile/app/account/data.tsx:186-190,197-199,399`
3. **Subscriptions on the 29th to 31st get a different next date on each side, and auto-logging follows Web's.** 2026-01-31 monthly, on 02-10: Web says 03-03, Mobile says 02-28. Mobile can promise a date the cron won't post on. **bug**, Mobile's clamping is right, small, money.
   - Web: `Web/lib/subscriptions.ts:40-47`, used by the cron at `Web/app/api/notifications/run/route.ts:191`; `Web/lib/recurringExpense.ts:13-17` already calls this overflow a bug
   - Mobile: `Mobile/src/components/subscriptions/SubscriptionsPanel.tsx:97-109,113-122`
4. **Mobile saves subscriptions with a 0 amount or no due date, and a blank date never auto-logs,** while the same form promises "We'll auto-add an expense". **bug**, Web is right, small, money. The server should enforce it too.
   - Web: `Web/src/components/SubscriptionModal.tsx:115-116`; server gap at `Web/app/api/subscriptions/route.ts:30`, blank-date path at `Web/lib/subscriptions.ts:89-95`
   - Mobile: `Mobile/app/modals/subscription.tsx:90,280-281`
5. **Web never tells the server the user's timezone,** so a Web-only user outside India gets IST server dates on forecast, incomes, recurring and subscriptions. **bug**, Mobile is right, small, money (effect on each route not traced).
   - Web: no client write (grepped `timezone|timeZone|resolvedOptions`); accepted at `Web/app/api/user/route.ts:98-100`; fallback at `Web/lib/userCurrency.ts:42-44`
   - Mobile: `Mobile/app/_layout.tsx:221`, `Mobile/src/api/account.ts:97-105`
6. **Mobile's "Cover overspend" rounds to whole rupees.** ₹20.40 fills 20 and leaves "₹0.40 more needed"; ₹20.60 moves 21. **bug**, Web is right, small, money.
   - Web: `Web/src/components/MoneyScreens.tsx:409,555,557`
   - Mobile: `Mobile/app/modals/move-money.tsx:116,334,336`
7. **Web can't move a source's full balance when `available` has float noise.** Assigned 100, spent 12.96: the pick rounds to 87.04, fails the check against 87.03999…, and the button stays disabled at "₹0 more to allocate". Arithmetic confirmed in node, not clicked through. **bug**, Mobile is right (compare in paise), small, money.
   - Web: `Web/src/components/MoneyScreens.tsx:417,447,461`, `Web/src/lib/envelope.ts:222`
   - Mobile: `Mobile/app/modals/move-money.tsx:147,186`
8. **The transactions list opens on this week on Web and this month on Mobile,** so the list and its total differ. Search stays inside the period and Web has no "all", so a search that finds an older spend on Mobile returns "Nothing turned up" on Web. **gap**, needs a decision on the default; Web should gain "all" either way, small.
   - Web: `Web/src/components/TransactionsView.tsx:47,177,240-242,360`
   - Mobile: `Mobile/app/(tabs)/activity.tsx:287,364,414,434-436`
9. **With the AI allowance spent, Web says "Something went wrong. Try again."** and offers Retry, which can't work until the 1st. **gap**, Mobile is right, small.
   - Web: `Web/src/components/MoneyBrainDrawer.tsx:271,276,417`, tagged at `Web/src/api/ai.ts:232`
   - Mobile: `Mobile/app/modals/money-brain.tsx:318-319,396`, `Mobile/src/lib/aiAllowance.ts:48-50`

## Medium impact

### Money and dates

10. **Assigning from Ready to Assign writes different data.** Assigned 1000, carry -200, assign 500: Web stores 1300, Mobile 1500. This month's available matches; next month inherits a different target. Only Web caps at Ready to Assign. **bug**, Web on the write, the cap needs a decision, larger, money. Port in progress (`7dbac07e`).
    - Web: `Web/src/components/MoneyScreens.tsx:823,832`, `Web/app/api/budgets/transfer/route.ts:128-133`
    - Mobile: `Mobile/app/(tabs)/index.tsx:824`, `Mobile/app/modals/edit-assigned-amount.tsx:198,316`
11. **Web blocks a partial pull when covering an overspend; Mobile moves what the sources hold.** **gap**, Mobile is right, small, money. Port in progress (`c0706ffa`, `5223d0a5`).
    - Web: `Web/src/components/MoneyScreens.tsx:415,417,591,594`
    - Mobile: `Mobile/app/modals/move-money.tsx:142,147,503`
12. **Assign flow differs.** Mobile seeds the amount and offers "Give it all", a category switch and two chips; Web starts blank with up to five chips. **gap**, Mobile for the chips and seeding, Web's row item needs a decision, larger, money. Port in progress (`1155c168`, `7dbac07e`).
    - Web: `Web/src/components/MoneyScreens.tsx:813,899-917`, `Web/src/components/EnvelopeGrid.tsx:309-311`
    - Mobile: `Mobile/app/modals/edit-assigned-amount.tsx:97,331`, `Mobile/src/components/envelope/EnvelopeRow.tsx:369-390`
13. **Return all money to Ready to Assign exists on Web only.** Web's version also includes the credit card envelope that Home hides. **gap**, needs a decision, larger, money.
    - Web: `Web/src/views/ExpensePage.tsx:389-400,615`, `Web/src/components/EnvelopeGrid.tsx:152`
    - Mobile: absent (grepped `Return all|bulk|handleBulk|__ready_to_assign__`)
14. **Web can split one expense across categories when editing; Mobile can't.** Web's save deletes then re-adds, non-atomically. **gap**, needs a decision, larger, money.
    - Web: `Web/src/components/TransactionEditModal.tsx:176-195,313`, `Web/src/components/SplitExpenseEditor.tsx:34`
    - Mobile: absent (grepped `By percentage|SplitLine|splitExpense|expenses/split|Split expense|split_group`); only bill-scan splitting at `Mobile/src/features/scan-bill/useBillSplit.ts`
15. **Going back in custom setup and changing income re-suggests the plan on Web; Mobile keeps old amounts,** and a lowered income can block Finish. A failed Jev call also never retries on Mobile. **bug**, Web is right, small, money.
    - Web: `Web/app/onboarding/page.tsx:237-242,254-256,447`
    - Mobile: `Mobile/app/setup.tsx:329-334,344`
16. **Subscription "today" is UTC on Web and local on Mobile,** so due labels disagree for part of each day. **bug**, Mobile is right, small.
    - Web: `Web/lib/subscriptions.ts:51-53`, `Web/src/components/SubscriptionsPanel.tsx:68-74,108`
    - Mobile: `Mobile/src/components/subscriptions/SubscriptionsPanel.tsx:114,143-145`
17. **A past one-time subscription still shows a future "Next" date on Web.** The cron is safe. **bug**, Mobile is right, small.
    - Web: `Web/lib/subscriptions.ts:46,125`, `Web/src/components/SubscriptionsPanel.tsx:108,123-127`
    - Mobile: `Mobile/src/components/subscriptions/SubscriptionsPanel.tsx:117`
18. **Subscription rows are rounded on Web (9.99 shows 10) and exact on Mobile.** **bug**, Mobile is right, small.
    - Web: `Web/src/components/SubscriptionsPanel.tsx:99-100,134,170`
    - Mobile: `Mobile/src/components/subscriptions/SubscriptionsPanel.tsx:190-194`
19. **"Last spent" uses the IST calendar on Web and the device day on Mobile.** Mexico City at 8pm: Web "Yesterday", Mobile "Today". Older dates read "3 Sept" vs "3 Sep". **bug**, Mobile is right; Web's existing twin can render after mount. Small.
    - Web: `Web/src/components/EnvelopeGrid.tsx:122-131`, `Web/src/lib/date.ts:55`, twin at `Web/src/lib/envelopeDisplay.ts:34`
    - Mobile: `Mobile/src/components/envelope/EnvelopeRow.tsx:57-72`
20. **Same description can auto-pick a different category.** Web takes the first matching word and fuzzy-matches renames; Mobile takes the most-matched and needs an exact name. **gap**, needs a decision, ideally one rule. Small, test first.
    - Web: `Web/src/components/LogExpenseModal.tsx:206-221`
    - Mobile: `Mobile/app/modals/log-expense.tsx:94-119`

### Features on one side

21. **Web has no way to add or edit expense notes,** though search matches them, so a list result can match on text you can't see. **gap**, Mobile is right, small.
    - Web: `Web/src/components/LogExpenseModal.tsx:343-352`, `Web/src/components/TransactionEditModal.tsx:207-210`, display only at `Web/src/components/TransactionsFeed.tsx:190,286`; search at `Web/app/api/expenses/route.ts:137`
    - Mobile: `Mobile/app/modals/log-expense.tsx:502,1066`, `Mobile/src/components/activity/TransactionDetail.tsx:238`
22. **Web can't delete a subscription, and Cancel fires with no confirmation.** The delete hook has no consumer. **gap**, Mobile is right, small.
    - Web: `Web/src/hooks/useSubscriptions.ts:73`, `Web/src/views/SubscriptionsPage.tsx:77-93,126`
    - Mobile: `Mobile/app/modals/subscription.tsx:150,163-174,320-325,341-346`
23. **Mobile logs a scanned bill as today with no way to change it at that step; Web has a date picker.** **gap**, Web is right, small.
    - Web: `Web/src/features/scan-bill/ScanReview.tsx:277`
    - Mobile: `Mobile/src/features/scan-bill/useScanBillController.ts:93-94,181`, `Mobile/src/features/scan-bill/ScanConfirm.tsx:52`
24. **Web gzips import files over 4 MB; Mobile rejects them.** The Web screen still says "up to 4 MB". **gap**, Web is right if on-device gzip is acceptable, larger, import.
    - Web: `Web/src/components/onboarding/ImportFlow.tsx:34-38,301,392`, `Web/lib/import/read.ts`
    - Mobile: `Mobile/src/components/onboarding/ImportFlow.tsx:31,251`
25. **Reopening Ask Aviary resumes the chat on Web and starts blank on Mobile.** **gap**, Web is right, larger (Mobile must reset on sign-out and budget switch).
    - Web: `Web/components/MoneyBrainProvider.tsx:42`, `Web/src/components/MoneyBrainDrawer.tsx:113-114,179`
    - Mobile: `Mobile/app/modals/money-brain.tsx:148,197-198`
26. **After saving a first monthly pay dated next month, Mobile prompts for a starting balance; Web just closes.** **gap**, Mobile is right, small.
    - Web: `Web/src/components/RecurringIncomeModal.tsx:70`, `Web/src/views/ExpensePage.tsx:570,573,986-991`
    - Mobile: `Mobile/app/modals/recurring-income.tsx:94-113,129`, `Mobile/app/(tabs)/index.tsx:698-700`
27. **Wrapped opens on Mobile; Web's card says "Download the mobile app",** though a full Web page exists with no link to it. **gap**, needs a decision: unlock it or delete the orphan. Deliberate (`678f4e5e`).
    - Web: `Web/app/account/page.tsx:134-143`, `Web/app/wrapped/page.tsx:6-7`
    - Mobile: `Mobile/app/(tabs)/more.tsx:299-307`

### Errors and state

28. **On Web, a new chat whose first reply fails or is closed mid-stream loses its session,** so the next message starts a second chat with no context. **bug**, Mobile is right (`ac8481d0`, Fixes #85), small.
    - Web: `Web/src/api/ai.ts:216,239`, `Web/src/components/MoneyBrainDrawer.tsx:259,284`
    - Mobile: `Mobile/src/api/ai.ts:154,197-199`, `Mobile/app/modals/money-brain.tsx:294-298,330`
29. **Renaming from Web's switcher leaves the settings dialog on the old name,** with no success state, and delete can dead-end until reopened. **bug**, Mobile is right, small.
    - Web: `Web/src/components/BudgetSwitcher.tsx:73,79,141`, `Web/src/components/BudgetMembers.tsx:133,139,400`
    - Mobile: `Mobile/app/budget-members.tsx:65-66,150-156,368`
30. **Importing a file with nothing usable says "Check your connection" on Mobile.** Web explains it. **bug**, Web is right, small, import.
    - Web: `Web/src/components/onboarding/importCopy.ts:18`, thrown at `Web/lib/import/normalize.ts:231`
    - Mobile: `Mobile/src/components/onboarding/importCopy.ts:14-32`, `Mobile/src/components/onboarding/ImportFlow.tsx:277`
31. **A shared-budget member can open the currency picker on Web and the change silently fails;** Mobile shows it read-only. Both close before saving, so an owner's failed save is silent everywhere. **bug**, Mobile for the read-only row, both need the error, small.
    - Web: `Web/src/components/CurrencyPicker.tsx:33-68`, 403 at `Web/app/api/user/route.ts:91`
    - Mobile: `Mobile/src/components/CurrencyPicker.tsx:82-94,127-130` (`8a009a29`)
32. **"Clear all transactions" differs.** Web closes silently on failure and never refreshes caches, but confirms success. Mobile handles failure and refresh but gives no success message. **bug**, each side has half of it, small.
    - Web: `Web/app/account/data/page.tsx:126-133,250`
    - Mobile: `Mobile/app/account/data.tsx:204-218`
33. **On Mobile, a refused account delete or restore reads as a connection problem,** inviting endless retries on a 409. **bug**, Web is right, small.
    - Web: `Web/app/account/security/DeleteAccount.tsx:72-76`, `Web/app/account/security/page.tsx:157`
    - Mobile: `Mobile/app/account/security.tsx:180,233`, `Mobile/src/api/account.ts:125,131`
34. **Mobile shows an empty or first-run state when recurring, subscriptions or accounts fail to load.** Its income screen already handles this. **gap**, Web is right, small per screen.
    - Web: `Web/src/views/RecurringPage.tsx:151-154`, `Web/src/components/SubscriptionsPanel.tsx:206-209`, `Web/src/views/AccountsPage.tsx:92-95`
    - Mobile: `Mobile/app/account/recurring.tsx:183-191`, `Mobile/src/components/subscriptions/SubscriptionsPanel.tsx:385-387`, `Mobile/app/account/accounts.tsx:108-109`
35. **Save errors differ on recurring and subscriptions.** Mobile blames the connection even on a real 409; Web shows raw server text. **bug**, neither is right: both should use the accounts pattern (`Web/src/views/AccountsPage.tsx:28-31`, `Mobile/src/lib/accounts.ts:13-16`).
    - Web: `Web/src/components/SubscriptionModal.tsx:166-168`, `Web/src/components/RecurringExpenseModal.tsx:145-148`
    - Mobile: `Mobile/app/modals/subscription.tsx:118,137`, `Mobile/app/modals/recurring-expense.tsx:169,179`
36. **A lapsed user creating or renaming a budget on Mobile is told to check their connection.** Web names the real reason. The 402 also flips Mobile's access gate, which may be wrong for someone in a healthy shared budget. **gap**, Web on copy, the gate needs a check, small.
    - Web: `Web/src/components/BudgetSwitcher.tsx:225`, `Web/src/components/BudgetMembers.tsx:64`
    - Mobile: `Mobile/app/modals/new-budget.tsx:68-69`, `Mobile/app/budget-members.tsx:39,156`, `Mobile/src/api/client.ts:118`

## Low impact

37. **"Last month" chip on Mobile rounds (₹1,234.50 sets 1235), then never shows as selected.** **bug**, Web is right, small, money. Web: `Web/src/components/MoneyScreens.tsx:913,915`. Mobile: `Mobile/app/modals/edit-assigned-amount.tsx:349-350`.
38. **Row pill and bar tone differ for the same numbers.** ₹100 assigned, ₹50 carried, ₹120 spent: Web amber, Mobile muted as if empty. **gap**, needs a decision, since neither accounts for rollover. Web: `Web/src/components/EnvelopeGrid.tsx:64-67,188`. Mobile: `Mobile/src/components/envelope/EnvelopeRow.tsx:44-45`, `Mobile/src/components/envelope/ProgressBar.tsx:34`.
39. **Dragging a category into another group is Web only.** **gap**, the edit sheet may be enough on Mobile. Port in progress (`1453d049`, `26c80275`). Web: `Web/src/views/EnvelopesPage.tsx:213-216`, `Web/app/api/categories/move/route.ts:26`. Mobile: `Mobile/src/api/categories.ts:45-49`, `Mobile/app/(tabs)/envelopes.tsx:799,1038`.
40. **A failed move on Web always blames the connection; Mobile explains stale categories and read-only access.** **gap**, Mobile is right. Web: `Web/src/components/MoneyScreens.tsx:488-490`, `Web/src/api/budgets.ts:59`. Mobile: `Mobile/app/modals/move-money.tsx:230-236`, `Mobile/src/api/budgets.ts:63`.
41. **The one-off income preview can show a wrong Ready to Assign on Web if the carry fails to load.** Preview only, nothing saved. **bug**, Mobile is right, money. Web: `Web/src/components/MoneyScreens.tsx:1014-1016,1050-1053`. Mobile: `Mobile/app/modals/add-income.tsx:77-78,114`.
42. **Legacy emoji still shows in account names on Web.** **bug**, Mobile is right. Port in progress (`43ece2a8`). Web: `Web/src/components/AccountChips.tsx:76-79`, `Web/src/views/AccountsPage.tsx:117-120,156`. Mobile: `Mobile/src/components/shared/AccountChips.tsx:83-86`, `Mobile/app/account/accounts.tsx:148,169-171`.
43. **Amount field rules differ.** Mobile has calculator keys, a 9-digit cap and a 2-decimal cap; Web takes digits and dots only, so "1.2.3" fails as "Add an amount". **gap**, Mobile for the rules, calculator keys need a decision, money. Web: `Web/src/components/LogExpenseModal.tsx:248`, `Web/src/lib/calcAmount.ts`. Mobile: `Mobile/app/modals/log-expense.tsx:193,962`, `Mobile/src/lib/calcAmount.ts:44-46`.
44. **Edit rules differ.** Web allows 0 and requires a description, with no unusual-amount warning; Mobile blocks 0, allows blank and warns. **gap**, needs a decision, money. Web: `Web/src/components/TransactionEditModal.tsx:90-91`, `Web/lib/inputValidation.ts:24`. Mobile: `Mobile/app/modals/log-expense.tsx:377,379,390,401-404`, `Mobile/src/features/log-expense/missingFields.ts:9`.
45. **Mobile can change an expense's time and edit in place on the detail screen; Web can't.** **gap**, Mobile is right. Port in progress (`3cb7408e`). Web: `Web/src/components/TransactionEditModal.tsx:207-210`, server support at `Web/app/api/expenses/route.ts:320,360-363`. Mobile: `Mobile/src/components/activity/TransactionDetail.tsx:134-139,293`.
46. **Income opens from Log expense and quick-add on Mobile only.** **gap**, needs a decision. Web: `Web/src/views/ExpensePage.tsx:197-221`, `Web/src/views/IncomePage.tsx:145-152`. Mobile: `Mobile/app/modals/log-expense.tsx:1114`, `Mobile/src/features/log-expense/LogExpenseNavigation.tsx:80`, `Mobile/app/modals/quick-income.tsx`.
47. **During the AI kill switch, Web shows a generic failure; Mobile has a dedicated screen.** **gap**, Mobile is right. Web: `Web/src/components/MoneyBrainDrawer.tsx:276`, `Web/lib/systemSettings.ts:108`. Mobile: `Mobile/app/modals/money-brain.tsx:165,395`.
48. **Mobile's chat count and history can go stale after sending; Web refreshes them.** **bug**, Web is right. Web: `Web/src/components/MoneyBrainDrawer.tsx:264-267`. Mobile: `Mobile/app/modals/money-brain.tsx:301-307`, `Mobile/src/hooks/useChatSessions.ts:9,19`.
49. **Too many invite-code tries reads as a connection problem on Mobile,** and its "Try again" spends another attempt. **gap**, Web is right. Web: `Web/src/components/JoinBudget.tsx:19-21`, limit at `Web/app/api/join/[code]/route.ts:10`. Mobile: `Mobile/app/modals/join-budget.tsx:48,52,215`.
50. **Bug report limit is 2000 on Web and 4000 on Mobile; an oversized screenshot gets clear copy only on Web.** **gap**, Mobile for the limit (matches the server), Web for the 413 copy. Web: `Web/src/views/FeedbackPage.tsx:61-62,90`, `Web/src/api/feedback.ts:40`, `Web/app/api/feedback/route.ts:17`. Mobile: `Mobile/app/account/feedback.tsx:54,88`, `Mobile/src/api/feedback.ts:34-35`.
51. **After a lost save, retrying Web setup can wrongly say it finished "on another device".** Needs the response and the recovery check to both fail. **bug**, Mobile is right. Web: `Web/app/onboarding/page.tsx:513-517,551-559`. Mobile: `Mobile/app/setup.tsx:284,658-667` (`c9de9686`).
52. **Timestamps read "3:45 PM" on Web and "3:45 pm" on Mobile.** **gap**, align Web if `a514bf60` was meant globally; `Web/src/lib/format.test.ts:39` pins the old form. Web: `Web/src/lib/format.ts:38`. Mobile: `Mobile/src/lib/format.ts:39`.
53. **Setup bulk select with undo is Web only.** **gap**, needs a decision. Web: `Web/app/onboarding/page.tsx:752-753` (`144cb34b`). Mobile: absent (grepped `selectAll|Select all|Deselect|Undo`).

### Copy

54. **Envelopes.** "Or pick a category" shows on Web with nothing above it (**bug**, Mobile's "Pick a category" is right). No-sources copy, zero-amount hint, empty-group delete copy and "That group already exists." vs "That name is already taken." also differ (**gap**, needs a decision). Web: `Web/src/views/ExpensePage.tsx:496`, `Web/src/components/MoneyScreens.tsx:508-512,538-541`, `Web/src/lib/envelopeGroups.ts:43`, `Web/src/views/EnvelopesPage.tsx:300`. Mobile: `Mobile/app/(tabs)/index.tsx:814`, `Mobile/app/modals/move-money.tsx:318-319,346`, `Mobile/app/(tabs)/envelopes.tsx:75,829`.
55. **Income and subscriptions.** "Pay today" vs "Payday today" (Mobile, Web's comes from a string replace), delete text (Web, more specific), empty state, and "New subscription" vs "Add subscription", "One-off income" vs "Add income" (needs a decision). **gap**. Web: `Web/src/views/IncomePage.tsx:51,275-278`, `Web/src/components/SubscriptionsPanel.tsx:215`, `Web/src/components/SubscriptionModal.tsx:176`, `Web/src/components/MoneyScreens.tsx:1058`. Mobile: `Mobile/app/account/income.tsx:69,72,257-261`, `Mobile/src/components/subscriptions/SubscriptionsPanel.tsx:386`, `Mobile/app/modals/subscription.tsx:181`, `Mobile/app/modals/add-income.tsx:159`.
56. **Budgets and capture.** Web's "pick an emoji" is stale, since the picker is icons (**bug**, Mobile is right). Invite format, "Started this budget" vs "Joined a while back", the solo-owner note and the capture screen title and examples also differ (**gap**). Web: `Web/src/components/BudgetSwitcher.tsx:226`, `Web/src/components/BudgetMembers.tsx:32,167,230`, `Web/src/components/MoneyBrainDrawer.tsx:336-337,402`. Mobile: `Mobile/app/modals/new-budget.tsx:150-151`, `Mobile/app/budget-members.tsx:42,47,286`, `Mobile/app/modals/money-brain.tsx:74,456,516-520`.
57. **Setup and tour.** Category explanation (Mobile reads clearer) and hints differ, and the settings screen is "Account" in one place, "You" in another and "More" in a third. **gap**, needs a decision on the name. Web: `Web/app/onboarding/page.tsx:132,135,681,685`, `Web/src/components/tour/content.ts:36,76`, `Web/src/components/onboarding/PickExtras.tsx:82`. Mobile: `Mobile/app/setup.tsx:169,181,924,928`, `Mobile/src/components/tour/content.ts:30,69`, `Mobile/src/components/onboarding/PickExtras.tsx:60`, `Mobile/app/(tabs)/more.tsx:187`.

## Intentional

- **Offline queue, saved draft and failed screen on Mobile; inline error with the form kept open on Web.** Web: `Web/src/components/LogExpenseModal.tsx:371-374`. Mobile: `Mobile/app/modals/log-expense.tsx:187-188,352,511-522,565-577`.
- **Notification switches on Mobile; digest cadence only on Web,** because alerts only arrive on Android. Web: `Web/app/account/page.tsx:197-220`, `Web/src/api/account.ts:5-8`. Mobile: `Mobile/app/account/notifications.tsx:37-49`.

## Confirmed the same

`src/lib/currencies.ts` is byte-identical. Theme default and options, setup defaults, the delete hand-off, `captureRows.ts` and `split.ts` all match. Both sides have the same gaps here: no client limit for the 500-character chat cap, a generic error for chat 429s, and 12.345 on recurring income reported as a connection error.

## Not checked

- **Dashboard and envelopes:** weekly pace internals, note sheet vs NoteBlock, Home's KPI hero beyond the Ready to Assign tap, Edit Ready to Assign and Edit Month Income twins, goal modal details, alert threshold limits, group reorder and delete flows, onboarding assignment.
- **Expenses and import:** Settings import and undo history (`Web/src/views/ImportPage.tsx` vs `Mobile/app/account/import.tsx`), import review and commit steps, file-type filters, statement review and logging, bulk delete, Mobile day headings, negative refund rows, ScanReview split UI, future-date behaviour in date pickers.
- **Recurring, income, accounts:** recurring suggestion screens beyond API shapes, the lower half of both recurring-expense modals, `AmountField` vs `pushAmountKey` decimals, date-picker limits, `defaultAccount.ts` on Web, the recurring-income cron. `Mobile/app/modals/recurring-income.tsx:82-92` backfills without the guard `recurring-expense.tsx:91-94` has, so a refetch could reset edits (not reproduced).
- **Spaces and Ask Aviary:** attachments, the `spaces/[id]/{invites,members,transfer}` route bodies, the Mobile access gate's downstream UI, bill-scan screen copy, both `CaptureReview` and `ChatHistoryList` UIs.
- **Settings and onboarding:** sign-out beyond the budget state, name editing, tour progress storage, changelog popup vs What's new eligibility, Help screen, Wrapped content.
- **Mirrored libs:** `activityFeed`, `analytics`, `monthly`, `envelope`, `goal`, `habits`, `emoji` and `netWorthHistory` were not diffed line by line.
- **Screens with no live check:** nothing here was run on the emulator or in a browser.
