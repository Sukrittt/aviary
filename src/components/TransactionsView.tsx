import { ExpenseNoticeDialog } from './ExpenseNoticeDialog';
import { ExpenseWriteError } from '../lib/expenseConflict';
import { useCurrency } from "@/src/context/CurrencyContext";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CopyIcon, ImagesIcon, PlusIcon, MagnifyingGlassIcon, MoneyWavyIcon, RowsIcon, XIcon } from "@/src/components/icons";
import { TransactionsFeed } from "./TransactionsFeed";
import { useActivityView } from "../hooks/useActivityView";
import { useUser } from "../hooks/useUser";
import { track } from "../lib/analytics";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toTransactions, type Transaction } from "../lib/expenseTransactions";
import { useBudgets } from "../hooks/useBudgets";
import { useCategories, useCategoryIcons } from "../hooks/useCategories";
import { useExpensesPage, useDeleteExpense, useDuplicates } from "../hooks/useExpenses";
import { DuplicateReviewDialog } from "./DuplicateReviewDialog";
import { ConfirmDialog } from "./ConfirmDialog";
import { DeletingRow, ROW_SPRING } from "./DeletingRow";
import { EMPTY } from "../lib/constants";
import { orderWithRecents } from "../lib/recentCategories";
import { useRecentCategories } from "../hooks/useRecentCategories";

import { ActivitySkeleton } from "./TabSkeleton";
import { TransactionEditModal } from "./TransactionEditModal";
import { LogExpenseModal } from "./LogExpenseModal";
import { DatePicker } from "./DatePicker";
import { Select } from "./Select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MENU_ITEM, MENU_POPUP } from "./menuStyles";
import { avatarStyleFor, splitEmoji } from "../lib/emoji";
import { CategoryIcon } from "./CategoryIcon";
import { formatShortDate } from "../lib/format";
import { parseLocalDate, toLocalDateString } from "../lib/date";
import { BirdEmptyState } from "./BirdEmptyState";
import { useIncomes } from "../hooks/useIncomes";
import { liveAccounts, useAccounts } from "../hooks/useAccounts";
import { incomesForPage, periodEnd } from "../lib/incomeActivity";
import { AccountIcon, accountLabel, accountName } from "./AccountChips";
import type { IncomeRow } from "../types";

type PeriodKey = "week" | "month" | "custom";

const PAGE_SIZE = 40;


function formatDateHeading(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTransactionTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (!timestamp || Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Stable per-row identity for the optimistic removal set. */
const txnKey = (t: Transaction) => t.id || `${t.timestamp}-${t.item}-${t.amountInr}`;

export function TransactionsView({
  hideAmounts = false,
}: {
  hideAmounts?: boolean;
}) {
  const { formatCurrency } = useCurrency();

  const budgetsQuery = useBudgets();
  const categoriesQuery = useCategories();
  const categoryIcons = useCategoryIcons();
  const deleteExpenseM = useDeleteExpense();
  const duplicates = useDuplicates().data ?? [];
  const [reviewingDuplicates, setReviewingDuplicates] = useState(false);
  const closeDuplicateReview = useCallback(() => setReviewingDuplicates(false), []);

  // Period and the custom range start as derived values and become state only
  // once the user touches them. Seeding them from an effect instead made them
  // snap back to the newest row on every refetch, and is what
  // react-hooks/set-state-in-effect exists to catch.
  const [periodOverride, setPeriod] = useState<PeriodKey | null>(null);
  const [customStartOverride, setCustomStart] = useState<string | null>(null);
  const [customEndOverride, setCustomEnd] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedAccount, setSelectedAccount] = useState("");
  const incomesQuery = useIncomes();
  const accountsQuery = useAccounts();
  const accountOptions = liveAccounts(accountsQuery.data);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // A cheap 1-row fetch to anchor "this week"/"this month" off the newest
  // logged transaction, the same way the old full-fetch version did — not
  // real-world "today", which is deliberate (see latestDate below).
  const anchorQuery = useExpensesPage({ page: 1, limit: 1 });
  const anchorDate = useMemo(() => {
    const iso = anchorQuery.data?.rows[0]?.date;
    if (!iso) return null;
    const d = parseLocalDate(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [anchorQuery.data]);

  const searchParams = useSearchParams();
  const router = useRouter();
  const reduce = useReducedMotion();
  const dateParam = searchParams.get("date");
  const categoryParam = searchParams.get("category");
  const accountParam = searchParams.get("account");

  const budgetCategories = useMemo(
    () =>
      (budgetsQuery.data ?? EMPTY)
        .map((b) => b.category)
        .filter((c) => c !== "__income__" && c !== "__credit_card__"),
    [budgetsQuery.data],
  );
  const [editingTxn, setEditingTxn] = useState<Transaction | null>(null);
  const [deleteTxn, setDeleteTxn] = useState<Transaction | null>(null);
  // Remove clicked: held until the dialog has finished closing, so the sweep
  // isn't hidden behind its fade. Then it becomes pendingDelete.
  const queuedDelete = useRef<Transaction | null>(null);
  // Drives the row's coral sweep.
  const [pendingDelete, setPendingDelete] = useState<Transaction | null>(null);
  // Rows dropped from the list the moment their sweep ends, before the delete
  // settles, so the rows below spring up at once. A failed delete puts one back.
  const [removedKeys, setRemovedKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [deleteNotice, setDeleteNotice] = useState<{ status?: number } | null>(null);
  // Multi-select: `selecting` swaps row clicks from the actions menu to toggling.
  const [selecting, setSelecting] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);
  const [actionsKey, setActionsKey] = useState<string | null>(null);
  const feedOn = useUser().data?.activityFeed === true;
  const [view, setView] = useActivityView();
  // Turning the feed on in Features opens Activity on it; the header button
  // still flips to the list, and that choice sticks in this browser.
  // Selection is the list's; the feed has no checkboxes to show it with.
  const feedView = feedOn && (view ?? "feed") === "feed" && !selecting;

  /**
   * The custom range's default: the day named in ?date=, else the month
   * containing the newest transaction. Only a default — the moment the user
   * picks a range, the override below wins.
   */
  const seededRange = useMemo(() => {
    if (dateParam) return { start: dateParam, end: dateParam };
    const latest = anchorDate ?? new Date();
    return {
      start: toLocalDateString(new Date(latest.getFullYear(), latest.getMonth(), 1)),
      end: toLocalDateString(latest),
    };
  }, [dateParam, anchorDate]);

  // Arriving with ?date= means the user asked for one specific day.
  const period: PeriodKey = periodOverride ?? (dateParam ? "custom" : "week");
  const customStart = customStartOverride ?? seededRange.start;
  const customEnd = customEndOverride ?? seededRange.end;

  // Arriving from an envelope: adopt its category and match its per-month window.
  // Deliberate one-time adoption of an external (URL) value into local filter
  // state that the user can then change independently — not derivable at render time.
  useEffect(() => {
    if (!categoryParam) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedCategory(categoryParam);
    setPeriod("month");
  }, [categoryParam]);

  // Arriving from an account's transactions action: adopt that account.
  useEffect(() => {
    if (!accountParam) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedAccount(accountParam);
    setPeriod("month");
  }, [accountParam]);

  const categories = useMemo(() => {
    // A new category has no budget row until it's assigned money, so the
    // categories list is the source of truth; budget rows still contribute
    // categories that were since deleted but have old transactions. Budget
    // rows repeat per month, so dedupe to keep dropdown option keys unique.
    const names = (categoriesQuery.data ?? EMPTY).map((c) => c.name).filter(Boolean);
    return [...new Set([...names, ...budgetCategories])].sort();
  }, [categoriesQuery.data, budgetCategories]);
  const { recents } = useRecentCategories();
  const orderedCategories = useMemo(
    () => orderWithRecents(categories, recents),
    [categories, recents],
  );

  const latestDate = useMemo(() => anchorDate ?? new Date(), [anchorDate]);

  // The date window sent to the server — same week/month/custom math the old
  // client-side filter used, now producing a `from`/`to` pair instead of
  // filtering an already-fetched array.
  const { from, to } = useMemo(() => {
    const end = new Date(latestDate);
    let start = new Date(0);
    if (period === "week") {
      const now = new Date(end);
      start = new Date(now);
      const diffToMonday = (start.getDay() + 6) % 7;
      start.setDate(now.getDate() - diffToMonday);
    } else if (period === "month") {
      start = new Date(end.getFullYear(), end.getMonth(), 1);
    } else if (period === "custom" && customStart && customEnd) {
      start = parseLocalDate(customStart);
      end.setTime(parseLocalDate(customEnd).getTime());
    }
    return { from: toLocalDateString(start), to: toLocalDateString(end) };
  }, [period, customStart, customEnd, latestDate]);

  const expensesQuery = useExpensesPage({
    page,
    limit: PAGE_SIZE,
    category: selectedCategory || undefined,
    account: selectedAccount || undefined,
    from,
    to,
    q: search || undefined,
  });
  const loading = anchorQuery.isLoading || expensesQuery.isLoading;
  const error = expensesQuery.error ? "Couldn't load your transactions." : null;

  const pageTransactions = useMemo(
    () => toTransactions(expensesQuery.data?.rows ?? EMPTY),
    [expensesQuery.data],
  );
  // Where this page's income starts: the oldest date on the page before it
  // (lib/incomeActivity.ts). Already cached from visiting that page.
  const prevPageQuery = useExpensesPage({
    page: Math.max(1, page - 1),
    limit: PAGE_SIZE,
    category: selectedCategory || undefined,
    account: selectedAccount || undefined,
    from,
    to,
    q: search || undefined,
  });
  const prevRows = page > 1 ? prevPageQuery.data?.rows ?? EMPTY : EMPTY;
  const prevPageMin = prevRows.length > 0 ? prevRows[prevRows.length - 1].date : null;
  const pageMin = pageTransactions.length > 0 ? pageTransactions[pageTransactions.length - 1].date : null;
  const totalPagesForIncome = expensesQuery.data?.pageCount ?? 1;
  // Income has no category, so a category filter hides it.
  const visibleIncomes = useMemo(
    () =>
      selectedCategory || expensesQuery.isPlaceholderData
        ? []
        : incomesForPage(incomesQuery.data ?? EMPTY, {
            from,
            to: periodEnd(period, to),
            pageMin,
            prevPageMin,
            page,
            isLastPage: page >= totalPagesForIncome,
            q: search,
            account: selectedAccount || undefined,
          }),
    [incomesQuery.data, selectedCategory, expensesQuery.isPlaceholderData, from, to, period, pageMin, prevPageMin, page, totalPagesForIncome, search, selectedAccount],
  );

  const transactionGroups = useMemo(() => {
    const groups: Array<{
      date: string;
      total: number;
      transactions: Transaction[];
      incomes: IncomeRow[];
    }> = [];
    const byDate = new Map<string, (typeof groups)[number]>();
    const groupFor = (date: string) => {
      let group = byDate.get(date);
      if (!group) {
        group = { date, total: 0, transactions: [], incomes: [] };
        byDate.set(date, group);
        groups.push(group);
      }
      return group;
    };

    for (const transaction of pageTransactions) {
      if (removedKeys.has(txnKey(transaction))) continue;
      const group = groupFor(transaction.date);
      group.total += transaction.amountInr;
      group.transactions.push(transaction);
    }
    for (const income of visibleIncomes) groupFor(income.date).incomes.push(income);

    return groups.sort((a, b) => b.date.localeCompare(a.date));
  }, [pageTransactions, removedKeys, visibleIncomes]);

  useEffect(() => {
    // Reset pagination whenever any filter changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [period, customStart, customEnd, selectedCategory, selectedAccount, search]);

  // Which rows are on screen; a bulk delete that finishes after it changed
  // mustn't reselect its failures into a view that no longer shows them.
  const viewKey = [page, period, customStart, customEnd, selectedCategory, selectedAccount, search].join("|");
  const viewKeyRef = useRef(viewKey);
  useEffect(() => {
    viewKeyRef.current = viewKey;
  });
  useEffect(() => {
    // A selection only means the rows on screen: drop it when they change, so
    // rows picked earlier can't come back selected and get swept into a delete.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedKeys(new Set());
  }, [page, period, customStart, customEnd, selectedCategory, selectedAccount, search]);

  const totalCount = expensesQuery.data?.total ?? 0;
  const totalPages = expensesQuery.data?.pageCount ?? 1;
  const totalSpend = expensesQuery.data?.totalAmount ?? 0;

  // Keep the URL in step with manual filter changes so ?category= never goes stale
  function applyCategory(category: string) {
    setSelectedCategory(category);
    const next = new URLSearchParams(searchParams.toString());
    if (category) next.set("category", category);
    else next.delete("category");
    const qs = next.toString();
    router.replace(`/expense/transactions${qs ? `?${qs}` : ""}`);
  }

  function applyAccount(account: string) {
    setSelectedAccount(account);
    const next = new URLSearchParams(searchParams.toString());
    if (account) next.set("account", account);
    else next.delete("account");
    const qs = next.toString();
    router.replace(`/expense/transactions${qs ? `?${qs}` : ""}`);
  }

  function resetFilters() {
    setPeriod("week");
    setSelectedCategory("");
    setSelectedAccount("");
    setSearch("");
    setPage(1);
    router.replace("/expense/transactions");
  }

  // The mutation hooks invalidate the expense and budget queries themselves,
  // so there is nothing left for callers to refresh by hand.
  function refreshTransactions() {}

  async function handleDelete(t: Transaction) {
    const key = txnKey(t);
    setRemovedKeys((keys) => new Set(keys).add(key));
    setPendingDelete(null);
    setDeleteNotice(null);
    try {
      await deleteExpenseM.mutateAsync({
        id: t.id,
        version: t.version,
        timestamp: t.timestamp,
        item: t.item,
        amountInr: t.amountInr,
      });
      setActionsKey(null);
      await refreshTransactions();
    } catch (err) {
      // Back into the list; a conflict requires a new confirmation after reviewing the refreshed row.
      setRemovedKeys((keys) => {
        const next = new Set(keys);
        next.delete(key);
        return next;
      });
      setActionsKey(null);
      setDeleteNotice({ status: err instanceof ExpenseWriteError ? err.status : undefined });
    }
  }

  const visibleTransactions = transactionGroups.flatMap((g) => g.transactions);
  const selectedTxns = visibleTransactions.filter((t) => selectedKeys.has(txnKey(t)));
  // keepPreviousData shows the old page's rows while the new one loads; they
  // aren't what the filter asked for, so nothing gets picked or deleted then.
  const selectionLocked = bulkDeleting || expensesQuery.isPlaceholderData;
  const allSelected = visibleTransactions.length > 0 && selectedTxns.length === visibleTransactions.length;

  function exitSelecting() {
    setSelecting(false);
    setSelectedKeys(new Set());
  }

  function toggleSelected(t: Transaction) {
    const key = txnKey(t);
    setSelectedKeys((keys) => {
      const next = new Set(keys);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  // One request per row, in order: each delete runs its own server transaction
  // (credit-card envelope rebalance included), so running them in parallel
  // would just race those for no real speed-up at this list size.
  async function handleBulkDelete(txns: Transaction[]) {
    const keys = txns.map(txnKey);
    setConfirmBulk(false);
    setBulkDeleting(true);
    setDeleteNotice(null);
    // Optimistic: rows and the select bar go now; failures bring both back.
    setRemovedKeys((prev) => new Set([...prev, ...keys]));
    exitSelecting();
    const startView = viewKeyRef.current;
    const failed: Transaction[] = [];
    let firstStatus: number | undefined;
    for (const t of txns) {
      try {
        await deleteExpenseM.mutateAsync({
          id: t.id,
          version: t.version,
          timestamp: t.timestamp,
          item: t.item,
          amountInr: t.amountInr,
        });
      } catch (err) {
        if (!failed.length) firstStatus = err instanceof ExpenseWriteError ? err.status : undefined;
        failed.push(t);
      }
    }
    setBulkDeleting(false);
    if (!failed.length) return;
    // Failed rows come back, still selected, so a retry is one tap away.
    const failedKeys = new Set(failed.map(txnKey));
    setRemovedKeys((prev) => new Set([...prev].filter((k) => !failedKeys.has(k))));
    if (viewKeyRef.current === startView) {
      setSelecting(true);
      setSelectedKeys(failedKeys);
    }
    setDeleteNotice({ status: firstStatus });
  }

  const hasActiveFilters =
    period !== "week" || Boolean(selectedCategory) || Boolean(selectedAccount) || Boolean(search.trim());

  const emptyState = (
    <BirdEmptyState
      className="txn-timeline-empty"
      mood={search || selectedCategory || selectedAccount ? 'searching' : 'snoozing'}
      subject="expenses"
      title={search || selectedCategory || selectedAccount ? 'Nothing turned up' : 'Your story starts here'}
      description={search || selectedCategory || selectedAccount ? 'No transactions for this filter.' : 'Log your first expense and we’ll keep the little details here.'}
      action={search || selectedCategory || selectedAccount
        ? { label: 'Reset filters', onClick: resetFilters }
        : { label: 'Log your first expense', onClick: () => setShowLogModal(true) }}
    />
  );

  return (
    <div className="txn-timeline">
      <header className="txn-page-header">
        <div className="txn-page-heading">
          <span className="txn-page-eyebrow">Transaction history</span>
          <h1>Activity</h1>
          <p>Review, search, and edit everything you have logged.</p>
        </div>
        <div className="txn-page-actions">
          {feedOn && (
            <button
              type="button"
              className="action-button"
              aria-pressed={feedView}
              onClick={() => {
                const next = feedView ? "list" : "feed";
                setActionsKey(null);
                setView(next);
                track("activity_view_changed", { view: next });
              }}
            >
              {feedView ? <RowsIcon size={15} aria-hidden="true" /> : <ImagesIcon size={15} aria-hidden="true" />}
              {feedView ? "List" : "Feed"}
            </button>
          )}
          {visibleTransactions.length > 0 && !selecting && !feedView && (
            <button
              type="button"
              className="action-button"
              disabled={bulkDeleting}
              onClick={() => {
                setActionsKey(null);
                setSelecting(true);
              }}
            >
              Select
            </button>
          )}
          {duplicates.length > 0 && (
            <button
              type="button"
              className="action-button txn-page-duplicates-btn"
              onClick={() => setReviewingDuplicates(true)}
            >
              <CopyIcon size={15} aria-hidden="true" />
              Review {duplicates.length} possible duplicate{duplicates.length === 1 ? "" : "s"}
            </button>
          )}
          <button
            type="button"
            className="erd-log-btn txn-page-log-btn"
            onClick={() => setShowLogModal(true)}
          >
            <PlusIcon size={17} weight="bold" aria-hidden="true" />
            Log expense
          </button>
        </div>
      </header>

      <section className="txn-timeline-filters" aria-label="Activity filters">
        <div className="txn-filter-row txn-filter-row-period">
          <span className="txn-filter-label">Period</span>
          <div
            className="mc-filter-chips"
            role="tablist"
            aria-label="Period presets"
          >
            {(["week", "month", "custom"] as PeriodKey[]).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={period === key}
                className={`action-button ${period === key ? "is-active" : ""}`}
                onClick={() => setPeriod(key)}
              >
                {key === "week"
                  ? "This week"
                  : key === "month"
                    ? "This month"
                    : "Custom"}
              </button>
            ))}
          </div>
          {period === "custom" && (
            <div className="txn-timeline-dates">
              <DatePicker
                mode="range"
                value={{ start: customStart, end: customEnd }}
                onChange={({ start, end }) => {
                  setCustomStart(start);
                  setCustomEnd(end);
                }}
              />
            </div>
          )}
        </div>

        <div className="txn-filter-row txn-filter-row-refine">
          <span className="txn-filter-label">Filter</span>
          <div className="txn-select-field">
            <Select
              aria-label="Filter by category"
              value={selectedCategory || ""}
              onChange={applyCategory}
              placeholder="All categories"
              searchable={orderedCategories.length >= 12}
              options={[
                { value: "", label: "All categories" },
                ...orderedCategories.map((c) => ({
                  value: c,
                  label: splitEmoji(c).text,
                  icon: <CategoryIcon name={c} icon={categoryIcons.get(c)} />,
                })),
              ]}
            />
          </div>

          {accountOptions.length > 0 && (
            <div className="txn-select-field">
              <Select
                aria-label="Filter by account"
                value={selectedAccount}
                onChange={applyAccount}
                placeholder="All accounts"
                options={[
                  { value: "", label: "All accounts" },
                  ...accountOptions.map((a) => ({ value: a.id, label: accountLabel(a), icon: <AccountIcon account={a} /> })),
                ]}
              />
            </div>
          )}

          <label className="txn-search-field">
            <MagnifyingGlassIcon size={16} aria-hidden="true" />
            <span className="sr-only">Search transactions</span>
            <input
              type="search"
              className="txn-timeline-search"
              placeholder="Search transactions…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>

          {hasActiveFilters && (
            <button
              type="button"
              className="action-button is-ghost txn-filter-reset"
              onClick={resetFilters}
            >
              Reset
            </button>
          )}
        </div>
      </section>

      <AnimatePresence>
        {reviewingDuplicates && (
          <DuplicateReviewDialog pairs={duplicates} onClose={closeDuplicateReview} />
        )}
      </AnimatePresence>
      {deleteNotice && <ExpenseNoticeDialog status={deleteNotice.status} action="delete" onBack={() => setDeleteNotice(null)} />}

      {feedView ? (
        <TransactionsFeed
          params={{
            category: selectedCategory || undefined,
            account: selectedAccount || undefined,
            from,
            to,
            q: search || undefined,
          }}
          hideAmounts={hideAmounts}
          accountNameOf={(id) => accountName(accountsQuery.data, id)}
          removedKeys={removedKeys}
          txnKey={txnKey}
          isDeleting={(t) => pendingDelete?.id === t.id && pendingDelete?.timestamp === t.timestamp}
          onDeleteDone={(t) => void handleDelete(t)}
          onEdit={setEditingTxn}
          onDelete={setDeleteTxn}
          empty={emptyState}
        />
      ) : loading ? (
        <ActivitySkeleton />
      ) : error ? (
        <div className="txn-timeline-empty">
          Couldn&apos;t load transactions. {error}
        </div>
      ) : totalCount === 0 && visibleIncomes.length === 0 ? (
        emptyState
      ) : (
        <motion.div
          key={page}
          className={`txn-timeline-list${selecting ? " is-selecting" : ""}`}
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "tween", duration: 0.15, ease: "easeOut" }}
        >
          <AnimatePresence mode="popLayout" initial={false}>
          {transactionGroups.map((group) => (
            <motion.section
              className="txn-day-group"
              key={group.date}
              layout="position"
              transition={{ layout: ROW_SPRING }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
            >
              <header className="txn-timeline-header">
                <div>
                  <h2 className="txn-timeline-header-label">
                    {formatDateHeading(group.date)}
                  </h2>
                  <span className="txn-timeline-header-count">
                    {group.transactions.length + group.incomes.length} transaction{group.transactions.length + group.incomes.length === 1 ? "" : "s"}
                  </span>
                </div>
                <span className={`txn-timeline-header-total ${hideAmounts ? "amount-hidden" : ""}`}>
                  {hideAmounts ? "---" : formatCurrency(group.total)}
                </span>
              </header>

              <div className="txn-day-rows">
                <AnimatePresence mode="popLayout" initial={false}>
                {group.incomes.map((income) => {
                  const account = accountName(accountsQuery.data, income.account_id);
                  return (
                    <motion.div key={`income-${income.id}`} className="txn-timeline-row is-income-row" layout="position">
                      <Link href="/account/income" className="txn-row-trigger" aria-label={`${income.label}, income. Open Income`} />
                      <span className="txn-check-slot" aria-hidden="true" />
                      <span className="txn-timeline-icon" aria-hidden="true" style={{ background: "var(--mint-soft)" }}>
                        <MoneyWavyIcon />
                      </span>
                      <span className="txn-timeline-body">
                        <span className="txn-timeline-item">{income.label}</span>
                        <span className="txn-timeline-meta">Income{account ? ` · ${account}` : ""}</span>
                      </span>
                      <span className={`txn-timeline-amount is-income ${hideAmounts ? "amount-hidden" : ""}`}>
                        {hideAmounts ? "---" : `+${formatCurrency(Number(income.amount) || 0)}`}
                      </span>
                      <span className="txn-actions" />
                    </motion.div>
                  );
                })}
                {group.transactions.map((t, i) => {
                  const rowKey = `${t.timestamp}-${t.item}-${t.amountInr}`;
                  const categoryName = splitEmoji(t.category).text;
                  const time = formatTransactionTime(t.timestamp);
                  const isSelected = selecting && selectedKeys.has(txnKey(t));
                  return (
                    <DeletingRow
                      key={t.id || `t-${t.timestamp}-${i}`}
                      className={`txn-timeline-row${actionsKey === rowKey ? " is-open" : ""}${isSelected ? " is-selected" : ""}`}
                      active={pendingDelete?.id === t.id && pendingDelete?.timestamp === t.timestamp}
                      onDone={() => void handleDelete(t)}
                    >
                      {selecting ? (
                        <button
                          type="button"
                          className="txn-row-trigger"
                          aria-label={`Select ${t.item}`}
                          aria-pressed={isSelected}
                          disabled={selectionLocked}
                          onClick={() => toggleSelected(t)}
                        />
                      ) : (
                        <DropdownMenu
                          open={actionsKey === rowKey}
                          onOpenChange={(open) => setActionsKey(open ? rowKey : null)}
                        >
                          <DropdownMenuTrigger
                            render={<button type="button" className="txn-row-trigger" aria-label={`Open actions for ${t.item}`} />}
                          />
                          <DropdownMenuContent align="end" className={MENU_POPUP}>
                            <DropdownMenuItem className={MENU_ITEM} onClick={() => setEditingTxn(t)}>
                              Edit transaction
                            </DropdownMenuItem>
                            <DropdownMenuItem className={MENU_ITEM} variant="destructive" onClick={() => setDeleteTxn(t)}>
                              Delete transaction
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                      <span className="txn-check-slot" aria-hidden="true">
                        <span className={`txn-check${isSelected ? " is-on" : ""}`}>
                          {isSelected && (
                            <svg viewBox="0 0 24 24" fill="none">
                              <path
                                d="M5 13l4 4L19 7"
                                stroke="currentColor"
                                strokeWidth={3}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                pathLength={1}
                              />
                            </svg>
                          )}
                        </span>
                      </span>
                      <span
                        className="txn-timeline-icon"
                        title={categoryName}
                        style={avatarStyleFor(categoryName)}
                      >
                        <CategoryIcon name={t.category} icon={categoryIcons.get(t.category)} />
                      </span>
                      <span className="txn-timeline-body">
                        <span className="txn-timeline-item">{t.item}</span>
                        <span className="txn-timeline-meta">
                          {categoryName}{time ? ` · ${time}` : ` · ${formatShortDate(t.date)}`}
                        </span>
                      </span>
                      <span
                        className={`txn-timeline-amount ${hideAmounts ? "amount-hidden" : ""}`}
                      >
                        {hideAmounts
                          ? "---"
                          : formatCurrency(t.amountInr)}
                      </span>
                      <span className="txn-actions" />
                    </DeletingRow>
                  );
                })}
                </AnimatePresence>
              </div>
            </motion.section>
          ))}
          </AnimatePresence>
        </motion.div>
      )}

      <AnimatePresence>
        {selecting && (
          <motion.div
            className="txn-select-bar"
            role="toolbar"
            aria-label="Selected transactions"
            initial={reduce ? false : { opacity: 0, y: 24, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.9, transition: { duration: 0.15 } }}
            transition={{ type: "spring", mass: 0.8, damping: 14, stiffness: 220 }}
          >
            <motion.span
              key={selectedTxns.length}
              className="txn-select-count"
              initial={reduce || selectedTxns.length === 0 ? false : { scale: 1.25 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", damping: 12, stiffness: 400 }}
            >
              {selectedTxns.length === 0 ? "Tap rows to pick them" : `${selectedTxns.length} selected`}
            </motion.span>
            <button
              type="button"
              className="action-button is-ghost"
              disabled={selectionLocked}
              onClick={() =>
                setSelectedKeys(allSelected ? new Set() : new Set(visibleTransactions.map(txnKey)))
              }
            >
              {allSelected ? "Clear" : "Select all"}
            </button>
            <button
              type="button"
              className="txn-select-delete"
              disabled={selectedTxns.length === 0 || selectionLocked}
              onClick={() => setConfirmBulk(true)}
            >
              {bulkDeleting ? "Deleting…" : "Delete"}
            </button>
            <button
              type="button"
              className="txn-select-close"
              aria-label="Done selecting"
              disabled={bulkDeleting}
              onClick={exitSelecting}
            >
              <XIcon size={16} weight="bold" aria-hidden="true" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {!feedView && !loading && !error && (
        <div className="txn-timeline-footer">
          <span>
            {totalCount} transaction{totalCount !== 1 ? "s" : ""}
          </span>
          {totalPages > 1 && (
            <div className="txn-timeline-pagination">
              <button
                type="button"
                className="action-button is-ghost"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Prev
              </button>
              <span>
                {page} / {totalPages}
              </span>
              <button
                type="button"
                className="action-button is-ghost"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          )}
          <span>Total: {hideAmounts ? "---" : formatCurrency(totalSpend)}</span>
        </div>
      )}

      <AnimatePresence
        onExitComplete={() => {
          if (!queuedDelete.current) return;
          setPendingDelete(queuedDelete.current);
          queuedDelete.current = null;
        }}
      >
        {deleteTxn && (
          <ConfirmDialog
            title="Delete this transaction?"
            body={`“${deleteTxn.item}” will move to Archive. You can restore it for 7 days.`}
            cancelLabel="Cancel"
            onCancel={() => setDeleteTxn(null)}
          >
            <button
              type="button"
              className="account-danger-btn"
             
              onClick={() => {
                queuedDelete.current = deleteTxn;
                setDeleteTxn(null);
              }}
            >
              Remove
            </button>
          </ConfirmDialog>
        )}
        {confirmBulk && (
          <ConfirmDialog
            title={`Delete ${selectedTxns.length} transaction${selectedTxns.length === 1 ? "" : "s"}?`}
            body={`${selectedTxns.length === 1 ? "It'll" : "They'll"} move to Archive. You can restore ${selectedTxns.length === 1 ? "it" : "them"} for 7 days.`}
            cancelLabel="Cancel"
            onCancel={() => setConfirmBulk(false)}
          >
            <button
              type="button"
              className="account-danger-btn"
             
              onClick={() => void handleBulkDelete(selectedTxns)}
            >
              Remove
            </button>
          </ConfirmDialog>
        )}
        {editingTxn && (
          <TransactionEditModal
            id={editingTxn.id}
            version={editingTxn.version}
            timestamp={editingTxn.timestamp}
            item={editingTxn.item}
            amountInr={editingTxn.amountInr}
            date={editingTxn.date}
            category={editingTxn.category}
            accountId={editingTxn.accountId}
            hasPhoto={editingTxn.hasPhoto}
            onClose={() => setEditingTxn(null)}
            onSaved={refreshTransactions}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showLogModal && (
          <LogExpenseModal
            onClose={() => setShowLogModal(false)}
            onSaved={refreshTransactions}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
