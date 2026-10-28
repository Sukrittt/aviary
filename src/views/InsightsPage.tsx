"use client";

import { useCurrency } from "@/src/context/CurrencyContext";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { AnimatePresence } from "motion/react";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, CaretLeftIcon, CaretRightIcon, GearIcon, HouseIcon, InvoiceIcon, MoonIcon, SunIcon, TrendDownIcon, TrendUpIcon, XIcon } from "@/src/components/icons";
import { CategoryIcon } from "@/src/components/CategoryIcon";
import { useAppearance } from "@/components/AppearanceProvider";
import { ExpenseSidebar } from "@/src/components/ExpenseSidebar";
import { InsightsSkeleton } from "@/src/components/TabSkeleton";
import { useForecast } from "@/src/hooks/useForecast";
import { EditMonthIncomeScreen, MoveMoneyScreen } from "@/src/components/MoneyScreens";
import { CategoryBreakdown } from "@/src/components/charts/CategoryBreakdown";
import { Heatmap, type HeatmapCell } from "@/src/components/charts/Heatmap";
import {
  TrendChart,
  type TrendPoint,
} from "@/src/components/charts/TrendChart";
import { useBudgets } from "@/src/hooks/useBudgets";
import { useCategories, useCategoryIcons, useCategoryStyle } from "@/src/hooks/useCategories";
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
import { avatarStyleFor, splitEmoji } from "@/src/lib/emoji";
import { todayLocal } from "@/src/lib/date";
import { formatDateShort, formatShortDate } from "@/src/lib/format";
import {
  categoryBreakdown,
  leftoverFor,
  monthComparison,
  monthTotals,
  risingCategories,
  savingsTrend,
  spikeFor,
  spikeCause,
  withDelta,
} from "@/src/lib/monthly";
import { fetchSpikeExplanation } from "@/src/api/ai";
import { EMPTY } from "@/src/lib/constants";
import { BirdEmptyState } from "@/src/components/BirdEmptyState";
import { InsightsTab } from "@/src/components/InsightsTab";
import { ForecastCard } from "@/src/components/Forecast";

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
  const styleOf = useCategoryStyle();
  const { formatCurrency } = useCurrency();

  const router = useRouter();
  const { theme, setTheme } = useAppearance();
  const [hideAmounts] = useHideAmounts();
  const budgetsQuery = useBudgets();
  const expensesQuery = useExpenses();
  const categoriesQuery = useCategories();
  const categoryIcons = useCategoryIcons();
  const groupsQuery = useGroups();

  const budgets = budgetsQuery.data ?? EMPTY;
  const expenses = expensesQuery.data ?? EMPTY;
  const categories = categoriesQuery.data ?? EMPTY;
  const groups = groupsQuery.data ?? EMPTY;
  const currentMonth = currentMonthKey();
  const today = todayLocal();

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
  const [topUp, setTopUp] = useState<{ category: string; amount: number } | null>(null);

  // The selection survives a month change, so tapping another month on the
  // category's trend keeps the whole page on that category. A new mode drops
  // it: a category key means nothing as a group.
  function changeBreakdownMode(mode: "category" | "group") {
    setBreakdownMode(mode);
    setSelectedBreakdownKey(null);
  }
  function selectCategory(category: string) {
    setBreakdownMode("category");
    setSelectedBreakdownKey(category);
  }

  // Same rule ForecastCard renders by, so its bones don't vanish on load.
  const forecast = useForecast();
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
    const totals = monthTotals(
      selectedBreakdownKey ? expenses.filter((expense) => matchesSelection(expense.category)) : expenses,
      trendMonths,
    );
    const points = trendMonths.map((date) => ({ date, value: totals.get(date) ?? 0 }));
    // Start at the first month with spend; later empty months stay as gaps.
    const first = points.findIndex((point) => point.value > 0);
    return first === -1 ? [] : points.slice(first);
    // matchesSelection closes over the selection and category mapping listed below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, trendMonths, selectedBreakdownKey, breakdownMode, categoryGroupMap]);

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
  const showSaved = trendView === "saved" && !selectedBreakdownKey;
  // A selection's own average: its finished months in view, like savedBaseline.
  const selectionBaseline = useMemo(() => {
    const done = trendData.filter((point) => point.date < currentMonth);
    return done.length >= 2 ? done.reduce((sum, point) => sum + point.value, 0) / done.length : null;
  }, [trendData, currentMonth]);
  const rising = useMemo(
    () => risingCategories(expenses, insightMonth, today),
    [expenses, insightMonth, today],
  );
  const selectedSpike = useMemo(
    () =>
      breakdownMode === "category" && selectedBreakdownKey
        ? spikeFor(expenses, selectedBreakdownKey, insightMonth, today)
        : null,
    [expenses, breakdownMode, selectedBreakdownKey, insightMonth, today],
  );
  const [explainKey, setExplainKey] = useState<string | null>(null);
  const spikeKey = selectedSpike ? `${selectedSpike.category}|${insightMonth}|${selectedSpike.spent}` : null;
  const explanation = useQuery({
    queryKey: ["spike-explanation", spikeKey],
    queryFn: () => fetchSpikeExplanation(selectedSpike!.category, insightMonth),
    enabled: spikeKey != null && explainKey === spikeKey,
    staleTime: Infinity,
    retry: false,
  });

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
        fullCategory: expense.category,
        icon: categoryIcons.get(expense.category),
        group: categoryGroupMap.get(expense.category),
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
    categoryIcons,
  ]);

  const selectedRow =
    breakdownRows.find((row) => row.key === selectedBreakdownKey) ?? null;
  // Still named in a month the selection didn't spend in, where it has no row.
  const selectedLabel = selectedBreakdownKey
    ? selectedRow?.label ?? splitEmoji(selectedBreakdownKey).text
    : null;
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
        {theme === "dark" ? <SunIcon size={18} aria-hidden /> : <MoonIcon size={18} aria-hidden />}
      </button>

      <header className="erd-mobile-header ins-mobile-header">
        <button
          type="button"
          className="ins-back-btn"
          onClick={() => router.back()}
          aria-label="Back"
        >
          <ArrowLeftIcon size={18} />
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
                <CaretLeftIcon size={18} />
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
                <CaretRightIcon size={18} />
              </button>
            </div>
          </header>

          {loading ? (
            <InsightsSkeleton forecast={isCurrent && (forecast.isPending || !!forecast.data)} />
          ) : (
            <div className="insights-grid">
              <article
                className="erd-card ins-card ins-trend-card"
              >
                <div className="ins-card-heading">
                  <div>
                    <h2>{selectedLabel ?? (showSaved ? "Saved per month" : "Spending trend")}</h2>
                    <p>
                      {showSaved && savings.since && savings.since < currentMonth
                        ? `${formatCurrency(savings.total, hideAmounts)} saved since ${monthLabel(savings.since)}`
                        : "Last 12 months"}
                    </p>
                  </div>
                  <div className="ins-head-actions">
                    {selectedLabel ? (
                      <button
                        type="button"
                        className="ins-clear-chip"
                        onClick={() => setSelectedBreakdownKey(null)}
                        aria-label={`Show all spending, not just ${selectedLabel}`}
                      >
                        All spending
                        <XIcon size={12} aria-hidden />
                      </button>
                    ) : (
                    <>
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
                            <TrendUpIcon size={14} />
                          ) : (
                            <TrendDownIcon size={14} />
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
                    </>
                    )}
                  </div>
                </div>
                {!showSaved && !selectedBreakdownKey && rising.length > 0 && (
                  <div className="ins-rising" aria-label={`Rising in ${monthAbbrev(insightMonth)}`}>
                    <span className="ins-rising-label">Rising</span>
                    {rising.map((spike) => (
                      <button
                        key={spike.category}
                        type="button"
                        className="ins-rising-chip"
                        onClick={() => selectCategory(spike.category)}
                        title={`${formatCurrency(Math.round(spike.spent), hideAmounts)} vs ${formatCurrency(Math.round(spike.baseline), hideAmounts)} usually`}
                      >
                        <span className="ins-top-icon" style={styleOf(spike.label)}>
                          <CategoryIcon name={spike.category} icon={categoryIcons.get(spike.category)} group={categoryGroupMap.get(spike.category)} />
                        </span>
                        {spike.label}
                        <span className="ins-head-delta is-up">
                          <TrendUpIcon size={12} />
                          {Math.round(spike.deltaPct)}%
                        </span>
                      </button>
                    ))}
                  </div>
                )}
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
                    baseline={selectedBreakdownKey ? selectionBaseline : comparison.baseline}
                    selectedKey={insightMonth}
                    hideAmounts={hideAmounts}
                    onSelect={setInsightMonth}
                    partialKey={currentMonth}
                    partialNote={`${monthAbbrev(currentMonth)}, ${Number(today.slice(8, 10))} days in`}
                    ariaLabel={selectedLabel ? `${selectedLabel} spending over the last 12 months` : undefined}
                  />
                )}
                {selectedSpike && (() => {
                  const money = (amount: number) => formatCurrency(Math.round(amount), hideAmounts)
                  const { why, fresh } = spikeCause(selectedSpike, money)
                  const isNow = insightMonth === currentMonth
                  return (
                    <div className="ins-spike">
                      <div className="ins-spike-head">
                        <span className="ins-spike-title">{selectedSpike.label} is up</span>
                        <span className="ins-spike-pct">+{Math.round(selectedSpike.deltaPct)}%</span>
                      </div>
                      <div className="ins-spike-stats">
                        <div>
                          <strong>{money(selectedSpike.spent)}</strong>
                          <span>{isNow ? "This month so far" : monthLabel(insightMonth)}</span>
                        </div>
                        <div>
                          <strong>{money(selectedSpike.baseline)}</strong>
                          <span>{isNow ? `Usual by day ${Number(today.slice(8, 10))}` : "Usual month"}</span>
                        </div>
                      </div>
                      <dl className="ins-spike-facts">
                        <dt>Why</dt>
                        <dd>{why}</dd>
                        {fresh.length > 0 && (
                          <>
                            <dt>New</dt>
                            <dd>{fresh.join(", ")}</dd>
                          </>
                        )}
                      </dl>
                      {explanation.data ? (
                        <p className="ins-spike-ai">{explanation.data}</p>
                      ) : explanation.data === null ? null : explanation.isError ? (
                        <p className="ins-spike-error">Couldn&apos;t explain right now. Try again later.</p>
                      ) : (
                        <button
                          type="button"
                          className="ins-spike-explain"
                          onClick={() => setExplainKey(spikeKey)}
                          disabled={explanation.isFetching}
                        >
                          {explanation.isFetching ? "Thinking…" : "Explain with AI"}
                        </button>
                      )}
                    </div>
                  )
                })()}
              </article>

              <div className="ins-left-col">
                {isCurrent && (
                  <ForecastCard
                    hideAmounts={hideAmounts}
                    onTopUp={(category, amount) => setTopUp({ category, amount })}
                    icon={(category) => (
                      <span className="ins-top-icon" title={category} style={avatarStyleFor(splitEmoji(category).text)}>
                        <CategoryIcon name={category} icon={categoryIcons.get(category)} group={categoryGroupMap.get(category)} />
                      </span>
                    )}
                  />
                )}

                <article className="erd-card ins-card ins-heatmap-card">
                  <div className="ins-card-heading ins-heatmap-heading">
                    <div>
                      <h2>
                        {selectedLabel
                          ? `Daily spend · ${selectedLabel}`
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
                  onModeChange={changeBreakdownMode}
                  selectedKey={selectedRow ? selectedBreakdownKey : null}
                  onSelectKey={setSelectedBreakdownKey}
                  comparison={comparison}
                  leftover={leftover}
                  monthLabel={monthLabel(insightMonth)}
                  hideAmounts={hideAmounts}
                />
              </article>

              <article className="erd-card ins-card ins-top-card ins-biggest-card">
                <div className="ins-card-heading">
                  <div>
                    <h2>Biggest spends</h2>
                    <p>
                      {selectedLabel ?? monthLabel(insightMonth)}
                    </p>
                  </div>
                  <Link href="/expense/transactions" className="erd-manage-btn ins-view-all">
                    View all
                  </Link>
                </div>
                {topSpends.length === 0 ? (
                  <BirdEmptyState
                    compact
                    subject="expenses"
                    title="Nothing logged yet"
                    description="Your biggest spends will line up here once you start logging."
                  />
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
                          style={styleOf(spend.category)}
                        >
                          <CategoryIcon name={spend.fullCategory} icon={spend.icon} group={spend.group} />
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
            </div>
          )}
        </main>
      </div>

      <nav className="erd-tabbar" aria-label="Primary">
        <Link href="/expense" className="erd-tab">
          <HouseIcon size={22} aria-hidden />
          <span>Home</span>
        </Link>
        <Link href="/expense/transactions" className="erd-tab">
          <InvoiceIcon size={22} aria-hidden />
          <span>Activity</span>
        </Link>
        <InsightsTab active />
        <Link href="/account" className="erd-tab">
          <GearIcon size={22} aria-hidden />
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
      <AnimatePresence>
        {topUp && (
          <MoveMoneyScreen
            targetCategory={topUp.category}
            amount={topUp.amount}
            onClose={() => setTopUp(null)}
          />
        )}
      </AnimatePresence>
    </section>
  );
}
