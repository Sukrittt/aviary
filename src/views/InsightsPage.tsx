"use client";

import { useCurrency } from "@/src/context/CurrencyContext";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence } from "motion/react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useAppearance } from "@/components/AppearanceProvider";
import { ExpenseSidebar } from "@/src/components/ExpenseSidebar";
import { LoadingCaption } from "@/src/components/LoadingCaption";
import { EditMonthIncomeScreen } from "@/src/components/MoneyScreens";
import { CategoryBreakdown } from "@/src/components/charts/CategoryBreakdown";
import { Heatmap, type HeatmapCell } from "@/src/components/charts/Heatmap";
import {
  TrendChart,
  type TrendPoint,
} from "@/src/components/charts/TrendChart";
import { useBudgets } from "@/src/hooks/useBudgets";
import { useCategories } from "@/src/hooks/useCategories";
import { useExpenses } from "@/src/hooks/useExpenses";
import { useGroups } from "@/src/hooks/useGroups";
import { useHideAmounts } from "@/src/hooks/useHideAmounts";
import {
  CREDIT_CARD_CATEGORY,
  INCOME_CATEGORY,
  currentMonthKey,
  monthAbbrev,
  monthLabel,
  prevMonthKey,
  shiftMonthKey,
} from "@/src/lib/envelope";
import {
  avatarColorFor,
  categoryEmoji,
  splitEmoji,
} from "@/src/lib/emoji";
import { todayIST } from "@/src/lib/date";
import { formatDateShort, formatShortDate } from "@/src/lib/format";
import {
  categoryBreakdown,
  leftoverFor,
  monthComparison,
  monthTotals,
  savingsTrend,
  withDelta,
} from "@/src/lib/monthly";
import { EMPTY } from "@/src/lib/constants";

const TREND_MONTHS = 12;
const HEATMAP_WEEKS = 12;
const TOP_SPENDS = 5;

function monthsBack(month: string, currentMonth: string) {
  const [y1, m1] = month.split("-").map(Number);
  const [y2, m2] = currentMonth.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

/** "Jun, Jul and Aug have spending but no income, so they aren't counted. Tap one to add it." */
function missingIncomeNote(months: string[]) {
  const names = months.map(monthAbbrev);
  const list =
    names.length > 3
      ? `${names.length} months`
      : names.length === 1
        ? names[0]
        : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return months.length === 1
    ? `${list} has spending but no income, so it isn't counted. Tap it to add income.`
    : `${list} have spending but no income, so they aren't counted. Tap one to add income.`;
}

export function InsightsPage() {
  const { formatCurrency } = useCurrency();

  const router = useRouter();
  const { theme, setTheme } = useAppearance();
  const [hideAmounts] = useHideAmounts();
  const budgetsQuery = useBudgets();
  const expensesQuery = useExpenses();
  const categoriesQuery = useCategories();
  const groupsQuery = useGroups();

  const budgets = budgetsQuery.data ?? EMPTY;
  const expenses = expensesQuery.data ?? EMPTY;
  const categories = categoriesQuery.data ?? EMPTY;
  const groups = groupsQuery.data ?? EMPTY;
  const currentMonth = currentMonthKey();
  const today = todayIST();

  const [insightMonth, setInsightMonth] = useState(currentMonth);
  const [breakdownMode, setBreakdownMode] = useState<"category" | "group">(
    "category",
  );
  const [selectedBreakdownKey, setSelectedBreakdownKey] = useState<
    string | null
  >(null);
  const [heatmapView, setHeatmapView] = useState<"month" | "weeks">("month");
  const [trendView, setTrendView] = useState<"spending" | "saved">("spending");
  const [incomeMonth, setIncomeMonth] = useState<string | null>(null);

  const scopeRef = useRef(`${insightMonth}|${breakdownMode}`);
  const scope = `${insightMonth}|${breakdownMode}`;
  if (scopeRef.current !== scope) {
    scopeRef.current = scope;
    if (selectedBreakdownKey != null) setSelectedBreakdownKey(null);
  }

  const loading =
    budgetsQuery.isLoading ||
    expensesQuery.isLoading ||
    categoriesQuery.isLoading ||
    groupsQuery.isLoading;
  const earliestMonth = useMemo(() => {
    if (expenses.length === 0) return currentMonth;
    return expenses.reduce(
      (earliest, expense) =>
        expense.date.slice(0, 7) < earliest
          ? expense.date.slice(0, 7)
          : earliest,
      currentMonth,
    );
  }, [expenses, currentMonth]);

  const categoryGroupMap = useMemo(
    () =>
      new Map(
        categories.map((category) => [
          category.name,
          category.group || "Other",
        ]),
      ),
    [categories],
  );

  const trendMonths = useMemo(
    () =>
      Array.from({ length: TREND_MONTHS }, (_, index) =>
        shiftMonthKey(currentMonth, index - (TREND_MONTHS - 1)),
      ),
    [currentMonth],
  );
  const trendData: TrendPoint[] = useMemo(() => {
    const totals = monthTotals(expenses, trendMonths);
    const points = trendMonths.map((date) => ({ date, value: totals.get(date) ?? 0 }));
    // Start at the first month with spend; later empty months stay as gaps.
    const first = points.findIndex((point) => point.value > 0);
    return first === -1 ? [] : points.slice(first);
  }, [expenses, trendMonths]);

  // Full history (Insights loads every expense), so the running total is exact.
  const savings = useMemo(
    () => savingsTrend(budgets, expenses, categories, groups, currentMonth),
    [budgets, expenses, categories, groups, currentMonth],
  );
  // Months with spending but no income stay on the chart as placeholders the
  // user can tap to backfill, instead of silently dropping out.
  const missingInView = useMemo(
    () => savings.missingIncome.filter((month) => month >= trendMonths[0]),
    [savings, trendMonths],
  );
  const savedData: TrendPoint[] = useMemo(
    () =>
      [
        ...savings.points.filter((point) => point.date >= trendMonths[0]),
        ...missingInView.map((date) => ({ date, value: 0, missing: true })),
      ].sort((a, b) => a.date.localeCompare(b.date)),
    [savings, missingInView, trendMonths],
  );
  // Mean of the finished months in view (the in-progress month and income
  // placeholders would drag it down). Needs 2+ months, like the spending avg.
  const savedBaseline = useMemo(() => {
    const done = savedData.filter((point) => !point.missing && point.date < currentMonth);
    return done.length >= 2 ? done.reduce((sum, point) => sum + point.value, 0) / done.length : null;
  }, [savedData, currentMonth]);
  const showSaved = trendView === "saved";

  const comparison = useMemo(
    () => monthComparison(expenses, insightMonth, today),
    [expenses, insightMonth, today],
  );
  const categoryRows = useMemo(
    () =>
      withDelta(
        categoryBreakdown(
          budgets,
          expenses,
          categories,
          groups,
          insightMonth,
          "category",
        ),
        categoryBreakdown(
          budgets,
          expenses,
          categories,
          groups,
          prevMonthKey(insightMonth),
          "category",
        ),
      ),
    [budgets, expenses, categories, groups, insightMonth],
  );
  const groupRows = useMemo(
    () =>
      withDelta(
        categoryBreakdown(
          budgets,
          expenses,
          categories,
          groups,
          insightMonth,
          "group",
        ),
        categoryBreakdown(
          budgets,
          expenses,
          categories,
          groups,
          prevMonthKey(insightMonth),
          "group",
        ),
      ),
    [budgets, expenses, categories, groups, insightMonth],
  );
  const breakdownRows = breakdownMode === "category" ? categoryRows : groupRows;
  const leftover = useMemo(
    () => leftoverFor(budgets, expenses, categories, groups, insightMonth),
    [budgets, expenses, categories, groups, insightMonth],
  );

  const trendSummary = useMemo(() => {
    const monthsWithSpend = trendData.filter((point) => point.value > 0).length;
    if (monthsWithSpend >= 3) return null;
    if (monthsWithSpend <= 1) return { kind: "first" as const };
    const previous = prevMonthKey(insightMonth);
    const totals = monthTotals(expenses, [insightMonth, previous]);
    const current = totals.get(insightMonth) ?? 0;
    const prior = totals.get(previous) ?? 0;
    return {
      kind: "compare" as const,
      current,
      prior,
      previous,
      deltaPct: prior > 0 ? ((current - prior) / prior) * 100 : null,
    };
  }, [trendData, expenses, insightMonth]);

  function matchesSelection(category: string) {
    if (!selectedBreakdownKey) return true;
    if (breakdownMode === "category") return category === selectedBreakdownKey;
    return (categoryGroupMap.get(category) || "Other") === selectedBreakdownKey;
  }

  const heatmap = useMemo(() => {
    const totals = new Map<string, number>();
    if (heatmapView === "month") {
      for (const expense of expenses) {
        if (
          !expense.date.startsWith(insightMonth) ||
          !matchesSelection(expense.category)
        )
          continue;
        totals.set(
          expense.date,
          (totals.get(expense.date) ?? 0) + (Number(expense.amount_inr) || 0),
        );
      }
      const [year, month] = insightMonth.split("-").map(Number);
      const daysInMonth = new Date(year, month, 0).getDate();
      const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7;
      const cells: HeatmapCell[] = Array.from(
        { length: firstWeekday },
        (_, index) => ({ date: `pad-${index}`, day: 0, value: 0 }),
      );
      for (let day = 1; day <= daysInMonth; day += 1) {
        const date = `${insightMonth}-${String(day).padStart(2, "0")}`;
        cells.push({ date, day, value: totals.get(date) ?? 0 });
      }
      return { cells, caption: null as string | null };
    }

    const [year, month, day] = today.split("-").map(Number);
    const end = new Date(year, month - 1, day);
    const start = new Date(end);
    start.setDate(start.getDate() - (HEATMAP_WEEKS * 7 - 1));
    const days: Array<{ date: string; day: number }> = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      const date = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
      days.push({ date, day: cursor.getDate() });
      cursor.setDate(cursor.getDate() + 1);
    }
    const startDate = days[0]?.date ?? today;
    for (const expense of expenses) {
      if (
        expense.date < startDate ||
        expense.date > today ||
        !matchesSelection(expense.category)
      )
        continue;
      totals.set(
        expense.date,
        (totals.get(expense.date) ?? 0) + (Number(expense.amount_inr) || 0),
      );
    }
    const firstWeekday = (start.getDay() + 6) % 7;
    return {
      cells: [
        ...Array.from({ length: firstWeekday }, (_, index) => ({
          date: `pad-${index}`,
          day: 0,
          value: 0,
        })),
        ...days.map((entry) => ({
          ...entry,
          value: totals.get(entry.date) ?? 0,
        })),
      ],
      caption: `${formatDateShort(startDate)} – ${formatDateShort(today)}`,
    };
    // matchesSelection closes over the selection and category mapping listed below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    expenses,
    insightMonth,
    heatmapView,
    today,
    selectedBreakdownKey,
    breakdownMode,
    categoryGroupMap,
  ]);

  /** Biggest single expenses of the month, under whatever breakdown filter is
   *  active — same CC/income exclusion and same selection filter the heatmap
   *  beside it uses, so the two halves of the left column always agree. */
  const topSpends = useMemo(() => {
    return expenses
      .filter(
        (expense) =>
          expense.date.startsWith(insightMonth) &&
          expense.category !== CREDIT_CARD_CATEGORY &&
          expense.category !== INCOME_CATEGORY &&
          matchesSelection(expense.category),
      )
      .map((expense) => ({
        id: expense.id ?? `${expense.date}-${expense.item}-${expense.amount_inr}`,
        date: expense.date,
        item: expense.item || splitEmoji(expense.category).text,
        category: splitEmoji(expense.category).text,
        emoji: categoryEmoji(
          expense.category,
          categoryGroupMap.get(expense.category),
        ),
        amount: Number(expense.amount_inr) || 0,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, TOP_SPENDS);
    // matchesSelection closes over the selection and category mapping listed below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    expenses,
    insightMonth,
    selectedBreakdownKey,
    breakdownMode,
    categoryGroupMap,
  ]);

  const selectedRow =
    breakdownRows.find((row) => row.key === selectedBreakdownKey) ?? null;
  const back = monthsBack(insightMonth, currentMonth);
  const canGoPrevious = insightMonth > earliestMonth;
  const canGoNext = insightMonth < currentMonth;
  const isCurrent = insightMonth === currentMonth;

  return (
    <section className="expense-redesign insights-page">
      <button
        type="button"
        className="erd-theme-toggle"
        onClick={() => setTheme(theme === "light" ? "dark" : "light")}
        aria-label="Toggle theme"
      >
        {theme === "dark" ? "☀️" : "🌙"}
      </button>

      <header className="erd-mobile-header ins-mobile-header">
        <button
          type="button"
          className="ins-back-btn"
          onClick={() => router.back()}
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="erd-mobile-greet">Insights</div>
      </header>

      <div className="erd-main">
        <ExpenseSidebar />
        <main className="erd-content ins-content">
          <header className="ins-period-header">
            <div className="ins-period-nav">
              <button
                type="button"
                className="ins-month-btn"
                onClick={() =>
                  setInsightMonth((month) => shiftMonthKey(month, -1))
                }
                disabled={!canGoPrevious}
                aria-label={
                  canGoPrevious
                    ? `Previous month, ${monthLabel(shiftMonthKey(insightMonth, -1))}`
                    : "No earlier months"
                }
                title={
                  canGoPrevious
                    ? monthLabel(shiftMonthKey(insightMonth, -1))
                    : "No earlier months"
                }
              >
                <ChevronLeft size={18} />
              </button>
              <div className="ins-period-copy">
                <h1>{monthLabel(insightMonth)}</h1>
                {isCurrent ? (
                  <span>This month</span>
                ) : (
                  <button
                    type="button"
                    className="ins-today-chip"
                    onClick={() => setInsightMonth(currentMonth)}
                  >
                    {back} {back === 1 ? "month" : "months"} back · Today
                  </button>
                )}
              </div>
              <button
                type="button"
                className="ins-month-btn"
                onClick={() =>
                  setInsightMonth((month) => shiftMonthKey(month, 1))
                }
                disabled={!canGoNext}
                aria-label={
                  canGoNext
                    ? `Next month, ${monthLabel(shiftMonthKey(insightMonth, 1))}`
                    : "Already on this month"
                }
                title={
                  canGoNext
                    ? monthLabel(shiftMonthKey(insightMonth, 1))
                    : "Already on this month"
                }
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </header>

          {loading ? (
            <div className="ins-loading">
              <LoadingCaption placement="page" feature="insights" />
            </div>
          ) : (
            <div className="insights-grid">
              <article
                className="erd-card ins-card ins-trend-card"
              >
                <div className="ins-card-heading">
                  <div>
                    <h2>{showSaved ? "Saved per month" : "Spending trend"}</h2>
                    <p>
                      {showSaved && savings.since && savings.since < currentMonth
                        ? `${formatCurrency(savings.total, hideAmounts)} saved since ${monthLabel(savings.since)}`
                        : "Last 12 months"}
                    </p>
                  </div>
                  <div className="ins-head-actions">
                    {!showSaved &&
                      trendSummary?.kind === "compare" &&
                      trendSummary.deltaPct != null && (
                        <span
                          className={
                            trendSummary.deltaPct > 0
                              ? "ins-head-delta is-up"
                              : "ins-head-delta is-down"
                          }
                        >
                          {trendSummary.deltaPct > 0 ? (
                            <TrendingUp size={14} />
                          ) : (
                            <TrendingDown size={14} />
                          )}
                          {Math.abs(trendSummary.deltaPct).toFixed(0)}%
                        </span>
                      )}
                    <div className="ins-segmented" aria-label="Trend view">
                      <button
                        type="button"
                        className={showSaved ? "" : "is-active"}
                        onClick={() => setTrendView("spending")}
                      >
                        Spending
                      </button>
                      <button
                        type="button"
                        className={showSaved ? "is-active" : ""}
                        onClick={() => setTrendView("saved")}
                      >
                        Saved
                      </button>
                    </div>
                  </div>
                </div>
                {showSaved ? (
                  <>
                    <TrendChart
                      data={savedData}
                      baseline={savedBaseline}
                      selectedKey={insightMonth}
                      hideAmounts={hideAmounts}
                      onSelect={(month) =>
                        missingInView.includes(month)
                          ? setIncomeMonth(month)
                          : setInsightMonth(month)
                      }
                      partialKey={currentMonth}
                      partialNote={`${monthAbbrev(currentMonth)}, ${Number(today.slice(8, 10))} days in`}
                      emptyNote="Set your income to see what you save each month"
                      ariaLabel="Income minus spending over the last 12 months"
                    />
                    {missingInView.length > 0 && (
                      <p className="ins-trend-missing-note">
                        {missingIncomeNote(missingInView)}
                      </p>
                    )}
                  </>
                ) : (
                  <TrendChart
                    data={trendData}
                    baseline={comparison.baseline}
                    selectedKey={insightMonth}
                    hideAmounts={hideAmounts}
                    onSelect={setInsightMonth}
                    partialKey={currentMonth}
                    partialNote={`${monthAbbrev(currentMonth)}, ${Number(today.slice(8, 10))} days in`}
                  />
                )}
              </article>

              <div className="ins-left-col">
                <article className="erd-card ins-card ins-top-card">
                  <div className="ins-card-heading">
                    <div>
                      <h2>Biggest spends</h2>
                      <p>
                        {selectedRow
                          ? selectedRow.label
                          : monthLabel(insightMonth)}
                      </p>
                    </div>
                    <Link href="/expense/transactions" className="erd-manage-btn ins-view-all">
                      View all
                    </Link>
                  </div>
                  {topSpends.length === 0 ? (
                    <p className="ins-top-empty">Nothing logged yet.</p>
                  ) : (
                    <div className="ins-top-list">
                      {topSpends.map((spend, index) => (
                        <button
                          key={spend.id}
                          type="button"
                          className="ins-top-row"
                          style={{ animationDelay: `${220 + index * 55}ms` }}
                          onClick={() =>
                            router.push(`/expense/transactions?date=${spend.date}`)
                          }
                        >
                          <span
                            className="ins-top-icon"
                            title={spend.category}
                            style={{ background: avatarColorFor(spend.category) }}
                          >
                            {spend.emoji}
                          </span>
                          <span className="ins-top-body">
                            <span className="ins-top-item">{spend.item}</span>
                            <span className="ins-top-meta">
                              {formatShortDate(spend.date)} · {spend.category}
                            </span>
                          </span>
                          <span className="ins-top-amount">
                            {formatCurrency(spend.amount, hideAmounts)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </article>

                <article className="erd-card ins-card ins-heatmap-card">
                  <div className="ins-card-heading ins-heatmap-heading">
                    <div>
                      <h2>
                        {selectedRow
                          ? `Daily spend · ${selectedRow.label}`
                          : "Daily spend"}
                      </h2>
                      {heatmap.caption && <p>{heatmap.caption}</p>}
                    </div>
                    <div className="ins-segmented" aria-label="Heatmap range">
                      <button
                        type="button"
                        className={heatmapView === "month" ? "is-active" : ""}
                        onClick={() => setHeatmapView("month")}
                      >
                        Month
                      </button>
                      <button
                        type="button"
                        className={heatmapView === "weeks" ? "is-active" : ""}
                        onClick={() => setHeatmapView("weeks")}
                      >
                        12 weeks
                      </button>
                    </div>
                  </div>
                  <Heatmap
                    cells={heatmap.cells}
                    todayDate={today}
                    hideAmounts={hideAmounts}
                    onSelectDate={(date) =>
                      router.push(`/expense/transactions?date=${date}`)
                    }
                  />
                </article>
              </div>

              <article className="erd-card ins-card ins-breakdown-card">
                <CategoryBreakdown
                  rows={breakdownRows}
                  categoryRows={categoryRows}
                  groupRows={groupRows}
                  categoryGroupMap={categoryGroupMap}
                  mode={breakdownMode}
                  onModeChange={setBreakdownMode}
                  selectedKey={selectedBreakdownKey}
                  onSelectKey={setSelectedBreakdownKey}
                  comparison={comparison}
                  leftover={leftover}
                  monthLabel={monthLabel(insightMonth)}
                  hideAmounts={hideAmounts}
                />
              </article>
            </div>
          )}
        </main>
      </div>

      <nav className="erd-tabbar" aria-label="Primary">
        <Link href="/expense" className="erd-tab">
          <span aria-hidden="true">🏠</span>
          <span>Home</span>
        </Link>
        <Link href="/expense/transactions" className="erd-tab">
          <span aria-hidden="true">🧾</span>
          <span>Activity</span>
        </Link>
        <Link href="/insights" className="erd-tab is-active">
          <span aria-hidden="true">📊</span>
          <span>Insights</span>
        </Link>
        <Link href="/account" className="erd-tab">
          <span aria-hidden="true">⚙️</span>
          <span>More</span>
        </Link>
      </nav>
      <AnimatePresence>
        {incomeMonth && (
          <EditMonthIncomeScreen
            month={incomeMonth}
            onClose={() => setIncomeMonth(null)}
          />
        )}
      </AnimatePresence>
    </section>
  );
}
