"use client";

import { useCurrency } from "@/src/context/CurrencyContext";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactElement } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { AmountText, CheckIcon } from "../components/landing/mobile/kit";
import { track } from "../lib/analytics";
import { currencyUnit } from "../lib/currencies";
import { CaretRightIcon, GearIcon, HouseIcon, InvoiceIcon, MoneyWavyIcon, MoonIcon, PencilSimpleIcon, SunIcon } from "@/src/components/icons";
import { useAppearance } from "../../components/AppearanceProvider";

import { FluidDemo } from "../components/FluidDemo";
import { SubscriptionsPanel, type SubscriptionPanelItem } from "../components/SubscriptionsPanel";
import { SubscriptionModal } from "../components/SubscriptionModal";
import { BirdMark } from "../components/BirdMark";
import { RecentActivity } from "../components/RecentActivity";
import { EnvelopeGrid } from "../components/EnvelopeGrid";
import {
  MoveMoneyScreen,
  EditAssignedScreen,
  EditReadyToAssignScreen,
  AssignMoneyScreen,
  AddIncomeScreen,
} from "../components/MoneyScreens";
import { ExpenseSidebar } from "../components/ExpenseSidebar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MENU_ITEM, MENU_POPUP } from "../components/menuStyles";
import { Scrim, Sheet } from "../components/MotionSheet";
import { HomeSkeleton } from "../components/TabSkeleton";
import { BirdEmptyState } from "../components/BirdEmptyState";
import {
  toExpensePanelData,
  type ExpensePanelData,
} from "../services/expensePanelAdapter";
import { buildExpensePanel } from "../lib/expensePanel";
import { EMPTY } from "../lib/constants";
import { useBudgets, useCarry, useTransferBudget, useUpdateBudget } from "../hooks/useBudgets";
import { useRecentExpenses, useLastSpent, useAddExpense } from "../hooks/useExpenses";
import { useCategories, useCategoryIcons } from "../hooks/useCategories";
import { useGroupIcons, useGroups } from "../hooks/useGroups";
import { useSubscriptions, useCancelSubscription, useReactivateSubscription } from "../hooks/useSubscriptions";
import { useHideAmounts } from "../hooks/useHideAmounts";
import { GetStartedCard } from "../components/home/GetStartedCard";
import { paydayLabel, startingBalanceIntro, upcomingMonthlyPay } from "@/src/lib/upcomingPay";
import { useBillingStatus } from "../hooks/useBillingStatus";
import { formatDate } from "../components/billing/copy";
import { LearningCard } from "../components/home/LearningCard";
import { BALANCE_CHECK_ENABLED, BalanceCheckCard } from "../components/balance/BalanceCheckCard";
import { useHiddenFeatures, useUser } from "../hooks/useUser";
import { FeatureNudge } from "../components/home/FeatureNudge";
import { WeekRecapGate } from "../components/wrapped/WeekRecap";
import { usePersistentState } from "../hooks/usePersistentState";
import { useDismissedRolloverBanner } from "../hooks/useDismissedRolloverBanner";
import { rolloverCard } from "../lib/rollover";
import { splitEmoji } from "../lib/emoji";
import { fundBehindGoals, goalProgress } from "../lib/goal";
import { RolloverCard } from "../components/home/RolloverCard";
import { WeeklyRecapCard } from "../components/home/WeeklyRecapCard";
import { useWeeklyCategories } from "../hooks/useWeeklyCategories";
import { lastWeekResults, spendByDay, weekPace, weeklyRecap, type WeekPace } from "../lib/weekly";
import { LogExpenseModal } from "../components/LogExpenseModal";
import { FillGap } from "../features/fill-gap/FillGap";
import { RecurringIncomeModal } from "../components/RecurringIncomeModal";
import { useRecurringIncomes } from "../hooks/useIncomes";
import { useAccounts } from "../hooks/useAccounts";
import { useSpaces } from "../hooks/useSpaces";
import { ReadOnlyDialog } from "../components/BudgetNotices";
import { SuccessButton, useButtonPhase } from "../components/SuccessButton";
import { ImportBanner, useImportInProgress } from "../components/ImportBanner";
import type { EnvelopeState } from "../types/expense";
import { currentMonthKey, daysLeftInMonth, monthLabel, splitDebit } from "../lib/envelope";
import { InsightsTab } from "@/src/components/InsightsTab";
import { ForecastLine } from "@/src/components/Forecast";

const noop = () => () => {};
const WIDE_HOME = "(min-width: 1280px)"; // matches the two-column .erd-home breakpoint
function subscribeWideHome(onChange: () => void) {
  const media = window.matchMedia?.(WIDE_HOME);
  media?.addEventListener("change", onChange);
  return () => media?.removeEventListener("change", onChange);
}
const parseDismissed = (raw: string) => raw === "1";
const serializeDismissed = (value: boolean) => value ? "1" : "0";
const MotionLink = motion.create(Link);
const HOME_LAYOUT_SPRING = { type: "spring", stiffness: 260, damping: 28 } as const;

// type ExpenseTab = 'overview' | 'transactions' | 'insights'

export function ExpensePage() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const homeTransition = { layout: reduceMotion ? { duration: 0 } : HOME_LAYOUT_SPRING };
  const { formatCurrency, currencyCode } = useCurrency();

  // One query per resource, as Mobile has, with the dashboard's derived panel
  // recomputed from them. The old single SWR fetcher both fetched and derived;
  // buildExpensePanel is the derivation half, now pure.
  const budgetsQuery = useBudgets();
  const thisMonth = currentMonthKey();
  const carryQuery = useCarry(thisMonth);
  const expensesQuery = useRecentExpenses();
  const lastSpent = useLastSpent().data;
  const categoriesQuery = useCategories();
  const categoryIcons = useCategoryIcons();
  const groupIcons = useGroupIcons();
  const groupsQuery = useGroups();
  const subscriptionsQuery = useSubscriptions();
  const user = useUser().data;
  const hidden = useHiddenFeatures();
  const { readOnly, active: activeSpace } = useSpaces();

  const updateBudgetM = useUpdateBudget();
  const transferBudgetM = useTransferBudget();
  const addExpenseM = useAddExpense();
  const cancelSubscriptionM = useCancelSubscription();
  const reactivateSubscriptionM = useReactivateSubscription();

  const budgetRows = budgetsQuery.data ?? EMPTY;
  const expenseRows = expensesQuery.data ?? EMPTY;
  const categoryRows = categoriesQuery.data ?? EMPTY;
  const groupNames = groupsQuery.data ?? EMPTY;
  const subscriptionRows = subscriptionsQuery.data ?? EMPTY;

  const coreLoading =
    budgetsQuery.isLoading ||
    expensesQuery.isLoading ||
    categoriesQuery.isLoading ||
    groupsQuery.isLoading ||
    // Waits so carried money doesn't land a beat after the envelopes paint.
    carryQuery.isLoading;
  // Without the carry every balance is off, so Home says so instead of guessing.
  const carryFailed = carryQuery.isError && carryQuery.data === undefined;

  const panel = useMemo<ExpensePanelData | null>(
    () =>
      coreLoading
        ? null
        : toExpensePanelData(
            buildExpensePanel({
              currencyCode,
              budgets: budgetRows,
              expenses: expenseRows,
              lastSpent,
              carry: carryQuery.data,
              subscriptions: subscriptionRows,
              categories: categoryRows,
              groups: groupNames,
            }),
            currencyCode,
          ),
    [
      coreLoading,
      budgetRows,
      expenseRows,
      subscriptionRows,
      lastSpent,
      carryQuery.data,
      categoryRows,
      groupNames,
      currencyCode,
    ],
  );
  // Read-only here: the toggle lives on /account, next to the theme control.
  const [hideAmounts] = useHideAmounts();
  const importing = useImportInProgress();
  // Derived during render, not copied in by an effect: the page is
  // server-rendered (app/expense/page.tsx), and an effect-filled value left
  // the hero and envelopes out of the HTML, then pushed the rail ~2,300px
  // down when they appeared. A local edit (the bulk return below) overrides
  // it until the panel data changes, as the effect used to allow.
  const [envelopeOverride, setEnvelopeOverride] = useState<{ base: EnvelopeState | null; state: EnvelopeState } | null>(null);
  const envelopeState: EnvelopeState | null = panel
    ? envelopeOverride && envelopeOverride.base === panel.envelopeState
      ? envelopeOverride.state
      : panel.envelopeState
    : null;
  const [moveMoneyTarget, setMoveMoneyTarget] = useState<{ category: string; amount?: number } | null>(null);
  // takeBack: opened from a negative Ready to Assign, so the amount starts lowered by what's over.
  const [editAssignedTarget, setEditAssignedTarget] = useState<{ category: string; takeBack?: number } | null>(null);
  const [assignTarget, setAssignTarget] = useState<string | null>(null);
  const [editReady, setEditReady] = useState(false);
  const [incomeScreen, setIncomeScreen] = useState<"add" | "monthly" | "starting" | null>(null);
  // Change income edits the monthly schedule Ready to Assign counts from day 1.
  // With more than one, or before they've loaded (a create form then could
  // duplicate one), the Income page is the place to pick.
  const schedulesQ = useRecurringIncomes();
  // Warms the accounts cache so Log expense has them on its first open.
  useAccounts();
  const monthlySchedules = (schedulesQ.data ?? []).filter((r) => r.frequency === "monthly" && r.status === "active");
  // The pencil and the income pill open the same menu, each under itself.
  const incomeMenu = (trigger: ReactElement, align: "start" | "center" | "end") => (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent align={align} sideOffset={6} className={MENU_POPUP}>
        <DropdownMenuItem
          className={MENU_ITEM}
          onClick={() => {
            if (!schedulesQ.data || monthlySchedules.length > 1) router.push("/account/income");
            else setIncomeScreen("monthly");
          }}
        >
          Change income
        </DropdownMenuItem>
        <DropdownMenuItem
          className={MENU_ITEM}
          onClick={() => {
            router.push("/account/income");
          }}
        >
          Manage income
        </DropdownMenuItem>
        <DropdownMenuItem
          className={MENU_ITEM}
          onClick={() => {
            setIncomeScreen("add");
          }}
        >
          Add income
        </DropdownMenuItem>
        <DropdownMenuItem
          className={MENU_ITEM}
          onClick={() => {
            setEditReady(true);
          }}
        >
          Set Ready to Assign
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const [showBulkReturnConfirm, setShowBulkReturnConfirm] = useState(false);
  // Once per space and month. Held back through hydration (the server can't
  // know it was dismissed) and until the active space is known, so it never flashes.
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const [rolloverDismissed, setRolloverDismissed] = useDismissedRolloverBanner(`${activeSpace?.id ?? ""}:${thisMonth}`);
  const rollover = hydrated && activeSpace && !rolloverDismissed && !readOnly
    ? rolloverCard(carryQuery.data, thisMonth, (n) => formatCurrency(n, hideAmounts))
    : null;
  // Each bump rolls the carry into the category amounts: once when the strip
  // first shows, again whenever it's tapped. Nothing to roll once it's gone.
  const [rollReplays, setRollReplays] = useState(0);
  const rollPlay = rollover ? rollReplays + 1 : 0;

  // Weekly-tracked categories keep the month bar and add a pace tick; their
  // weeks live in the row's menu. Same rules as Mobile (src/lib/weekly.ts).
  const { weekly, setWeekly } = useWeeklyCategories();
  // Held until the budget is known: the switch is stored per budget, and a
  // flip before then would land under the wrong key and be lost.
  const onThisMonth = panel?.month === thisMonth && !!activeSpace;
  const paces = useMemo(() => {
    const map = new Map<string, WeekPace>();
    if (!envelopeState || !onThisMonth) return map;
    const today = new Date().getDate();
    for (const e of envelopeState.envelopes) {
      // Nothing to pace with no money in it: the month's own bar says it better.
      const pot = e.assigned + e.rolledOver;
      if (!weekly.has(e.category) || e.isCreditCardPayment || pot <= 0) continue;
      map.set(e.category, weekPace(pot, spendByDay(expenseRows, e.category, thisMonth), thisMonth, today));
    }
    return map;
  }, [envelopeState, onThisMonth, weekly, expenseRows, thisMonth]);
  const firstPace = paces.values().next().value;
  // Only categories already tracked when last week began get judged on it.
  const lastWeekFrom = firstPace?.weeks.at(-2)?.from ?? 0;
  const lastWeek = lastWeekResults(
    [...paces]
      .filter(([category]) => (weekly.get(category) ?? "") <= `${thisMonth}-${String(lastWeekFrom).padStart(2, "0")}`)
      .map(([category, pace]) => ({ category, pace })),
  );
  // Once per space and week: the next Monday starts undismissed on its own.
  const [recapDismissed, setRecapDismissed] = useDismissedRolloverBanner(`weekly-${activeSpace?.id ?? ""}:${thisMonth}-${firstPace?.current.from ?? 0}`);
  const recap = hydrated && lastWeek && !recapDismissed && !readOnly
    ? weeklyRecap(lastWeek, (n) => formatCurrency(n, hideAmounts), (c) => splitEmoji(c).text)
    : null;
  useEffect(() => {
    if (recap && lastWeek && !rollover) track("weekly_recap_shown", { under: lastWeek.under, total: lastWeek.total });
    // Once per showing, not on every render while it's up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!recap && !rollover]);
  const [getStartedSkipped, setGetStartedSkipped] = usePersistentState(
    'rollover-dismissed-get-started', false, parseDismissed, serializeDismissed,
  );
  // Ready to Assign's "Fund behind goals": what each behind goal is short this
  // month, out of what's there to assign. Empty when there's nothing to do.
  const goalFunding = useMemo(() => {
    if (!envelopeState || !onThisMonth || readOnly || envelopeState.readyToAssign <= 0) return [];
    const rows = new Map(categoryRows.map((c) => [c.name, c]));
    const behind = envelopeState.envelopes.flatMap((e) => {
      const row = e.isCreditCardPayment ? undefined : rows.get(e.category);
      const p = row?.goal ? goalProgress({ goal: row.goal, month: thisMonth, available: e.available, assigned: e.assigned, spent: e.spent, since: row.since }) : null;
      return p?.status === "behind" && p.by && p.behindBy ? [{ category: e.category, by: p.by, behindBy: p.behindBy }] : [];
    });
    return fundBehindGoals(envelopeState.readyToAssign, behind);
  }, [envelopeState, onThisMonth, readOnly, categoryRows, thisMonth]);
  const goalFundingTotal = goalFunding.reduce((sum, f) => sum + f.amount, 0);
  // Unknown until budgets load; counting it done avoids flashing the income step.
  const incomeDone = !envelopeState || envelopeState.income > 0;
  // Same test as Mobile's Home: income is set and nothing is left to assign.
  const rtaSettled = !!envelopeState && envelopeState.income > 0 && Math.abs(envelopeState.readyToAssign) < 0.005;
  // Mobile's peak-end beat: Ready to Assign reaching zero while you watch (an
  // assign, a move) gets a short mint celebration on the settled row. Loading
  // in at zero doesn't count: there was no "before" to celebrate.
  const readyToAssignNow = envelopeState?.readyToAssign;
  const prevReadyRef = useRef<number | undefined>(undefined);
  const [rtaCelebrationPending, setRtaCelebrationPending] = useState(false);
  const [rtaCelebrating, setRtaCelebrating] = useState(false);
  useEffect(() => {
    const prev = prevReadyRef.current;
    prevReadyRef.current = readyToAssignNow;
    if (prev === undefined || Math.abs(prev) < 0.005 || !rtaSettled || document.visibilityState !== "visible") return;
    setRtaCelebrationPending(true);
  }, [readyToAssignNow, rtaSettled]);
  // The save that zeroes it usually lands while its sheet is still open, so the
  // beat waits for every modal to leave the page, same as Mobile waiting for focus.
  useEffect(() => {
    if (!rtaCelebrationPending) return;
    const start = () => {
      if (document.querySelector('[aria-modal="true"]')) return false;
      setRtaCelebrationPending(false);
      setRtaCelebrating(true);
      track("rta_zero_celebrated");
      return true;
    };
    if (start()) return;
    const observer = new MutationObserver(() => { if (start()) observer.disconnect(); });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-modal"] });
    return () => observer.disconnect();
  }, [rtaCelebrationPending]);
  useEffect(() => {
    if (!rtaCelebrating) return;
    const t = setTimeout(() => setRtaCelebrating(false), 2500);
    return () => clearTimeout(t);
  }, [rtaCelebrating]);
  const daysLeftLabel = daysLeftInMonth() === 0 ? "Less than 24 hrs" : `${daysLeftInMonth()} days left`;
  // Every rupee has a job once Ready to Assign is spent down, the whole point
  // of the method, so Get started holds out for that, not one funded category.
  const fundDone = !envelopeState || (incomeDone && envelopeState.readyToAssign <= 0);
  // The next empty category on screen, so each tap moves the job along.
  const nextToFund = (envelopeState?.envelopes.find((e) => e.assigned === 0) ?? envelopeState?.envelopes[0])?.category;
  const upcomingPay = upcomingMonthlyPay(schedulesQ.data ?? [], thisMonth);
  const showGetStarted = !getStartedSkipped && !!user?.getStartedAt &&
    !(incomeDone && fundDone && user.manualTransactionCompletedAt && user.guidedTourCompletedAt);
  // On wide screens with Subscriptions hidden the rail holds only Recent
  // activity, so Get started fills that space instead of pushing the budget down.
  const wideHome = useSyncExternalStore(subscribeWideHome, () => !!window.matchMedia?.(WIDE_HOME).matches, () => false);
  const getStartedInRail = wideHome && hidden.includes("subscriptions");
  // Only fetched while the card that mentions the trial is up.
  const billing = useBillingStatus(showGetStarted).data;
  const [showFluidDemo, setShowFluidDemo] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  useEffect(() => {
    if (!actionError) return;
    const t = setTimeout(() => setActionError(null), 4000);
    return () => clearTimeout(t);
  }, [actionError]);
  const [payCreditCardAmount, setPayCreditCardAmount] = useState<number | null>(
    null,
  );
  const payPhase = useButtonPhase();
  const bulkReturnPhase = useButtonPhase();
  const [showLogModal, setShowLogModal] = useState(false);
  const [subscriptionBusy, setSubscriptionBusy] = useState<string | null>(null);
  const [showReadOnly, setShowReadOnly] = useState(false);
  const [editingSubscription, setEditingSubscription] = useState<SubscriptionPanelItem | null | undefined>(undefined);
  const { theme, setTheme } = useAppearance();

  async function changeSubscriptionStatus(service: string, action: "cancel" | "reactivate") {
    // The panel owns the Cancel/Reactivate buttons; say why instead of a 402.
    if (readOnly) {
      setShowReadOnly(true);
      return;
    }
    setSubscriptionBusy(service);
    try {
      if (action === "cancel") await cancelSubscriptionM.mutateAsync(service);
      else await reactivateSubscriptionM.mutateAsync(service);
    } catch {
      setActionError(`Couldn't ${action} ${service}. Check your connection and try again.`);
    } finally {
      setSubscriptionBusy(null);
    }
  }

  // Restore the "hide amounts" preference after hydration so the server and
  // client render the same initial output (avoids a hydration mismatch).

  async function handleBulkReturnToRTA() {
    if (!envelopeState) return;
    const positive = envelopeState.envelopes.filter((e) => e.available > 0);
    if (positive.length === 0) return;
    const current = envelopeState;
    bulkReturnPhase.start();
    try {
      await transferBudgetM.mutateAsync({
        month: current.month,
        to: "__ready_to_assign__",
        sources: positive.map((e) => ({ category: e.category, amount: e.available })),
      });
      // Same split as the server: carried money first, then assigned. Carried
      // money always lands in Ready to Assign; assigned only does outside
      // Credit Card Payment, which stays out of totalAssigned (computeEnvelopeState).
      let returned = 0;
      const updated = current.envelopes.map((e) => {
        if (e.available <= 0) return e;
        const { fromAssigned, fromCarry } = splitDebit(e.available, e.assigned, e.rolledOver);
        returned += fromCarry + (e.isCreditCardPayment ? 0 : fromAssigned);
        const assigned = e.assigned - fromAssigned;
        const spentPct = assigned > 0 ? Math.min(100, (e.spent / assigned) * 100) : e.spent > 0 ? 100 : 0;
        return { ...e, assigned, rolledOver: e.rolledOver - fromCarry, available: 0, spentPct };
      });
      const totalAssigned = updated.filter((e) => !e.isCreditCardPayment).reduce((sum, e) => sum + e.assigned, 0);
      const rta = current.readyToAssign + returned;
      const log = {
        type: "bulk-return-to-rta",
        month: current.month,
        timestamp: new Date().toISOString(),
        categories: positive.map((e) => ({
          category: e.category,
          amount: e.available,
        })),
        totalReturned: positive.reduce((s, e) => s + e.available, 0),
      };
      try {
        const logs = JSON.parse(
          localStorage.getItem("budget-transfer-log") || "[]",
        );
        logs.push(log);
        localStorage.setItem("budget-transfer-log", JSON.stringify(logs));
      } catch {
        // Transfer log is diagnostic only — a write failure shouldn't block the return
      }
      if (panel) setEnvelopeOverride({ base: panel.envelopeState, state: {
        ...current,
        envelopes: updated,
        totalAssigned,
        readyToAssign: rta,
        isOverAssigned: rta < 0,
      } });
      bulkReturnPhase.succeed(() => setShowBulkReturnConfirm(false));
    } catch {
      bulkReturnPhase.fail();
      setActionError("Couldn't return the money. Your categories weren't changed.");
    }
  }

  async function handlePayCreditCard() {
    const ccEnv = envelopeState?.envelopes.find((e) => e.isCreditCardPayment);
    const amount = ccEnv?.available;
    if (!amount || amount <= 0) return;
    setPayCreditCardAmount(amount);
  }

  /** A goal's one-tap "Set ₹X/mo": this month's assigned, the same versioned write as Edit amount. */
  async function setMonthly(category: string, amount: number) {
    await updateBudgetM.mutateAsync({
      month: thisMonth,
      category,
      version: budgetRows.find((row) => row.month === thisMonth && row.category === category)?.version ?? 0,
      updates: { assigned: String(amount) },
    });
  }

  async function fundGoals() {
    if (!envelopeState) return;
    try {
      // One versioned write per goal, same as tapping each goal's Set.
      for (const f of goalFunding) {
        const assigned = envelopeState.envelopes.find((e) => e.category === f.category)?.assigned ?? 0;
        await setMonthly(f.category, Math.round((assigned + f.amount) * 100) / 100);
      }
      track("rta_goals_funded", { goals: goalFunding.length });
    } catch {
      setActionError("Couldn't fund your goals. Check your connection and try again.");
    }
  }

  // Tapping Ready to Assign: give it a job, or take some back when it's negative.
  // Taking back lowers what's assigned, capped at what's left, so it never just moves the hole into an envelope.
  const rtaMenu = (trigger: ReactElement) => {
    const rta = envelopeState?.readyToAssign ?? 0;
    const picks = (envelopeState?.envelopes ?? []).filter((e) => !e.isCreditCardPayment && (rta > 0 || (e.assigned > 0 && e.available > 0)));
    return (
      <DropdownMenu>
        <DropdownMenuTrigger render={trigger} />
        <DropdownMenuContent align="center" sideOffset={6} className={`${MENU_POPUP} max-h-80`}>
          {rta > 0 && goalFunding.length > 0 && (
            <DropdownMenuItem className={MENU_ITEM} onClick={() => void fundGoals()}>
              {`Fund behind goals · ${formatCurrency(goalFundingTotal, hideAmounts)}`}
            </DropdownMenuItem>
          )}
          {/* Flat, not a submenu: it has to work by tap, and a phone has no hover. */}
          <DropdownMenuGroup>
            <DropdownMenuLabel className="px-2.5 pt-2 pb-1">
              {rta > 0 ? "Or pick a category" : "Take it back from"}
            </DropdownMenuLabel>
            {picks.map((e) => (
              <DropdownMenuItem
                key={e.category}
                className={MENU_ITEM}
                onClick={() => (rta > 0 ? setAssignTarget(e.category) : setEditAssignedTarget({ category: e.category, takeBack: Math.min(-rta, e.available) }))}
              >
                {splitEmoji(e.category).text}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  async function confirmPayCreditCard(amount: number) {
    // Deliberately not caught here — the caller drives the button's
    // saving/success/fail phase and must know whether this actually worked
    // before showing a success checkmark.
    await addExpenseM.mutateAsync({
      item: "Credit Card Payment",
      amount_inr: String(amount),
      category: "__credit_card__",
      payment_method: "bank",
    });
  }

  useEffect(() => {
    if (!panel) return;
    const override = localStorage.getItem("expense-income-override");
    if (override === null) return;
    const value = Math.round(Number(override)) || 0;
    const month = panel.month;
    (async () => {
      // PUT /api/budgets already upserts server-side, so no fallback POST to
      // addBudget — on a real failure that would be misleading.
      try {
        await updateBudgetM.mutateAsync({
          month,
          category: "__income__",
          version: budgetRows.find((row) => row.month === month && row.category === "__income__")?.version ?? 0,
          updates: { assigned: String(value) },
        });
        localStorage.removeItem("expense-income-override");
      } catch {
        setActionError("Couldn't save income — check your connection.");
      }
    })();
    // Deliberately keyed on `panel` alone: this drains a one-shot localStorage
    // override once the month is known. The mutation object is re-created each
    // render but stays bound to the same query client, so including it would
    // only re-run this for no gain.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel]);

  const getStartedCard = (
    <AnimatePresence mode="popLayout">
      {showGetStarted && user && (
        <motion.div
          key="get-started"
          className="home-get-started-slot"
          // Cancel the column's 20px gap at zero height, then open
          // it with the card so even the first reveal moves smoothly.
          initial={reduceMotion ? false : { height: 0, opacity: 0, marginBottom: -20 }}
          animate={{ height: "auto", opacity: 1, marginBottom: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: reduceMotion ? 0 : 0.32, ease: [0.22, 1, 0.36, 1] }}
        >
          <GetStartedCard
            incomeDone={incomeDone}
            fundDone={fundDone}
            fundHint={envelopeState && envelopeState.income > 0 ? `${formatCurrency(envelopeState.readyToAssign, hideAmounts)} still to assign` : undefined}
            upcomingPayHint={upcomingPay ? `Your pay lands ${paydayLabel(upcomingPay.start_date)}. Budget what you have till then.` : undefined}
            manualTransactionDone={!!user.manualTransactionCompletedAt}
            guidedTourDone={!!user.guidedTourCompletedAt}
            onAddIncome={() => setIncomeScreen(upcomingPay ? "starting" : "monthly")}
            onFund={() => (nextToFund ? setAssignTarget(nextToFund) : router.push("/expense/envelopes"))}
            onAddTransaction={() => setShowLogModal(true)}
            onTakeTour={() => router.push('/account/guided-tour')}
            onSkip={() => setGetStartedSkipped(true)}
            trialNote={billing?.mode === 'trial' && billing.trialEndsAt ? `Free until ${formatDate(billing.trialEndsAt)}${getStartedInRail ? '' : ' · no card needed'}` : undefined}
            compact={getStartedInRail}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );

  // Loading and loaded share one tree, so the sidebar stays mounted when the
  // data lands and a dialog opened from it (mid-upload, say) stays open.
  return (
    <section className="expense-redesign">
      {panel && <WeekRecapGate />}
      {panel && <FillGap />}
      {actionError && (
        <div className="erd-action-error" role="alert">
          {actionError}
        </div>
      )}
      {panel && (
        <button
          type="button"
          className="erd-theme-toggle"
          onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          aria-label="Toggle theme"
        >
          {theme === "dark" ? <SunIcon aria-hidden /> : <MoonIcon aria-hidden />}
        </button>
      )}

      <header className="erd-mobile-header">
        <div className="erd-mobile-greet">
          <BirdMark size={30} perched={!!panel} /> Aviary
        </div>
      </header>

      <div className="erd-main">
        <ExpenseSidebar onBulkReturn={panel && !readOnly && !carryFailed ? () => setShowBulkReturnConfirm(true) : undefined} />
        {carryFailed ? (
          <div className="erd-content">
            <BirdEmptyState
              title="Couldn't load your budget"
              description="Check your connection and try again."
              action={{ label: "Try again", onClick: () => void carryQuery.refetch() }}
            />
          </div>
        ) : !panel ? (
          <div className="erd-content">
            <HomeSkeleton />
          </div>
        ) : (
        <motion.div className="erd-content" layoutScroll>
          <LayoutGroup id="home-onboarding">
          <div className="erd-home" data-get-started={showGetStarted ? "true" : undefined}>
            <div className="erd-home-main">
              <ImportBanner />
              {/* Income is entered from the menu top-right; RTA is often ₹0,
                  so the hero alone doesn't say where money comes in. */}
              {envelopeState && !rtaSettled && (
                <article className="erd-card erd-home-hero-card">
                  <div className="erd-home-hero">
                    <span className="erd-home-hero-label">READY TO ASSIGN</span>
                    {(() => {
                      const rta = envelopeState.readyToAssign;
                      const amount = (
                        <strong className={`erd-home-hero-amount ${rta < 0 ? "is-negative" : ""}`}>
                          {hideAmounts ? (
                            "---"
                          ) : (
                            // A pass across the digits every few seconds while there's money to give a job,
                            // for someone who can give it one.
                            <span className={rta > 0 && !readOnly ? "text-shimmer text-shimmer--nudge" : undefined}>
                              <AmountText value={rta} animate id="ready-to-assign" />
                            </span>
                          )}
                        </strong>
                      );
                      // Nothing to do with it (zero, or a viewer): just the number.
                      if (readOnly || Math.abs(rta) < 0.005) return amount;
                      return (
                        <div className="env-action-wrap erd-home-pill-wrap">
                          {rtaMenu(
                            <button type="button" className="erd-home-hero-assign">
                              {amount}
                              <span className={`erd-home-hero-hint${rta < 0 ? " is-negative" : ""}`}>
                                {rta > 0
                                  ? hideAmounts ? "Give it a job" : `Give this ${formatCurrency(rta)} a job`
                                  : hideAmounts ? "Take some back" : `Take ${formatCurrency(-rta)} back`}
                                <CaretRightIcon size={14} aria-hidden="true" />
                              </span>
                            </button>,
                          )}
                        </div>
                      );
                    })()}
                    <span className="erd-home-hero-caption">
                      {monthLabel(panel.month)} · {daysLeftLabel}
                    </span>
                    {/* The pencil is easy to miss, so this pill names where the
                        number comes from. With no income yet it goes straight to
                        setting it. */}
                    <div className="env-action-wrap erd-home-pill-wrap">
                      {envelopeState.income === 0 ? (
                        <button type="button" className="erd-home-income-pill is-empty" onClick={() => setIncomeScreen("monthly")}>
                          Set your income
                          <CaretRightIcon size={14} aria-hidden="true" />
                        </button>
                      ) : (
                        incomeMenu(
                          <button type="button" className="erd-home-income-pill">
                            {`Income · ${formatCurrency(envelopeState.income, hideAmounts)}`}
                            <CaretRightIcon size={14} aria-hidden="true" />
                          </button>,
                          "center",
                        )
                      )}
                    </div>
                  </div>
                  <div className="env-action-wrap erd-home-hero-menu">
                    {incomeMenu(
                      <button type="button" className="env-menu-trigger" aria-label="Income options">
                        <PencilSimpleIcon size={15} aria-hidden="true" />
                      </button>,
                      "end",
                    )}
                  </div>
                </article>
              )}

              {/* Mobile's settled state: once every rupee has a job, Ready to
                  Assign drops from the hero to one row and the month moves up
                  top. Tapping the row opens the same income menu. */}
              {envelopeState && rtaSettled && (
                <>
                  <div className="erd-home-month">
                    <strong>{monthLabel(panel.month)}</strong>
                    <span>{daysLeftLabel}</span>
                  </div>
                  <div className="env-action-wrap erd-home-rta-slim-wrap">
                    {incomeMenu(
                      <button
                        type="button"
                        className={`erd-card erd-home-rta-slim${rtaCelebrating ? " is-celebrating" : ""}`}
                        aria-label="Ready to Assign options"
                      >
                        <AnimatePresence mode="wait" initial={false}>
                          <motion.span
                            key={rtaCelebrating ? "celebrate" : "label"}
                            className={rtaCelebrating ? "erd-home-rta-celebrate" : undefined}
                            role={rtaCelebrating ? "status" : undefined}
                            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                            transition={{ duration: 0.22, ease: "easeOut" }}
                          >
                            {rtaCelebrating ? (
                              <>
                                <CheckIcon color="var(--mint)" size={18} />
                                Every {currencyUnit(currencyCode)} has a job.
                              </>
                            ) : (
                              <><span className="erd-rta-icon" aria-hidden="true"><MoneyWavyIcon size={18} /></span>Ready to Assign</>
                            )}
                          </motion.span>
                        </AnimatePresence>
                        <span className="erd-home-rta-slim-amount">
                          {hideAmounts ? "---" : <AmountText value={envelopeState.readyToAssign} animate id="ready-to-assign" />}
                          <CaretRightIcon size={16} aria-hidden="true" />
                        </span>
                      </button>,
                      "end",
                    )}
                  </div>
                </>
              )}

              {envelopeState && <ForecastLine />}
              {/* One banner at a time, same as Mobile: the rollover note goes first,
                  and the next one waits for it to fade out. */}
              <AnimatePresence mode="wait">
                {rollover ? (
                  <motion.div
                    key="rollover"
                    className="home-leftover-slot"
                    initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    // Once the check has played it slides off to the right, then its
                    // height (and the column's 20px gap) closes so the cards below glide up.
                    exit={reduceMotion ? { opacity: 0 } : {
                      x: "100%", opacity: 0, height: 0, marginBottom: -20,
                      transition: {
                        x: { duration: 0.3, ease: [0.4, 0, 1, 1] },
                        opacity: { duration: 0.3 },
                        height: { delay: 0.22, duration: 0.32, ease: [0.22, 1, 0.36, 1] },
                        marginBottom: { delay: 0.22, duration: 0.32, ease: [0.22, 1, 0.36, 1] },
                      },
                    }}
                  >
                    <RolloverCard text={rollover} onReplay={() => setRollReplays((n) => n + 1)} onDone={() => setRolloverDismissed(true)} />
                  </motion.div>
                ) : recap ? (
                  <motion.div
                    key="weekly-recap"
                    className="home-leftover-slot"
                    initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    exit={reduceMotion ? { opacity: 0 } : {
                      x: "100%", opacity: 0, height: 0, marginBottom: -20,
                      transition: {
                        x: { duration: 0.3, ease: [0.4, 0, 1, 1] },
                        opacity: { duration: 0.3 },
                        height: { delay: 0.22, duration: 0.32, ease: [0.22, 1, 0.36, 1] },
                        marginBottom: { delay: 0.22, duration: 0.32, ease: [0.22, 1, 0.36, 1] },
                      },
                    }}
                  >
                    <WeeklyRecapCard {...recap} onDone={() => setRecapDismissed(true)} />
                  </motion.div>
                ) : (
                  <FeatureNudge key="nudge" />
                )}
              </AnimatePresence>

              {!getStartedInRail && getStartedCard}

              <LearningCard />

              {/* The weekly balance check keeps these totals honest without bank
                  linking: a prompt when one is due, else the logged meter. */}
              {BALANCE_CHECK_ENABLED && <BalanceCheckCard />}

              {envelopeState && (
                <motion.article
                  className="erd-card erd-envelopes-panel"
                  layout={reduceMotion ? false : "position"}
                  transition={homeTransition}
                >
                  <EnvelopeGrid
                    rollPlay={rollPlay}
                    month={panel.month}
                    categoryIcons={categoryIcons}
                    groupIcons={groupIcons}
                    envelopes={envelopeState.envelopes}
                    groups={envelopeState.groups}
                    hideAmounts={hideAmounts}
                    onManage={() => router.push("/expense/envelopes")}
                    onMoveMoney={(category, amount) => setMoveMoneyTarget({ category, amount })}
                    onAssignFromRTA={setAssignTarget}
                    onSetAssigned={(category) => setEditAssignedTarget({ category })}
                    onPayCreditCard={handlePayCreditCard}
                    paces={paces}
                    weekly={onThisMonth ? weekly : undefined}
                    onToggleWeekly={readOnly ? undefined : setWeekly}
                    onSetMonthly={onThisMonth && !readOnly ? setMonthly : undefined}
                  />
                </motion.article>
              )}

              {!hidden.includes("insights") && (
                <MotionLink
                  href="/insights"
                  className="erd-home-insights-link"
                  layout={reduceMotion ? false : "position"}
                  transition={homeTransition}
                >
                  Trends and daily spend <CaretRightIcon size={16} />
                </MotionLink>
              )}
            </div>
            <aside className="erd-home-rail" aria-label="Subscriptions and recent activity">
              {getStartedInRail && getStartedCard}
              {!hidden.includes("subscriptions") && (
                <SubscriptionsPanel
                  active={panel.subscriptions.active}
                  cancelled={panel.subscriptions.cancelled}
                  hideAmounts={hideAmounts}
                  busyService={subscriptionBusy}
                  loading={subscriptionsQuery.isLoading && !subscriptionsQuery.data}
                  error={subscriptionsQuery.isError && !subscriptionsQuery.data}
                  onAdd={() => setEditingSubscription(null)}
                  onEdit={setEditingSubscription}
                  onCancel={(service) => void changeSubscriptionStatus(service, "cancel")}
                  onReactivate={(service) => void changeSubscriptionStatus(service, "reactivate")}
                  homeRail
                />
              )}
              <RecentActivity expenses={expenseRows} hideAmounts={hideAmounts} categoryIcons={categoryIcons} historyComing={importing} />
            </aside>
          </div>
          </LayoutGroup>
        </motion.div>
        )}
        <AnimatePresence>
          {showReadOnly && <ReadOnlyDialog onClose={() => setShowReadOnly(false)} />}
          {editingSubscription !== undefined && (
            <SubscriptionModal
              editData={editingSubscription ? {
                service: editingSubscription.service,
                amount_inr: String(editingSubscription.amountInr),
                billing_cycle: editingSubscription.billingCycle,
                next_due_date: editingSubscription.nextDueDate,
                notes: editingSubscription.notes,
                category: editingSubscription.category,
              } : undefined}
              onClose={() => setEditingSubscription(undefined)}
              onSaved={() => setEditingSubscription(undefined)}
            />
          )}
          {payCreditCardAmount !== null && readOnly && <ReadOnlyDialog onClose={() => setPayCreditCardAmount(null)} />}
          {payCreditCardAmount !== null && !readOnly && envelopeState && (
            <Scrim
              className="modal-overlay"
              onClick={() => setPayCreditCardAmount(null)}
            >
              <Sheet
                className="modal-content move-money-modal"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="move-money-header">
                  <h4>Pay Credit Card Bill</h4>
                  <button
                    type="button"
                    className="move-money-close"
                    onClick={() => setPayCreditCardAmount(null)}
                    disabled={payPhase.saving || payPhase.success}
                  >
                    ✕
                  </button>
                </div>
                <p className="move-money-desc">
                  Pay the full outstanding balance of{" "}
                  {formatCurrency(payCreditCardAmount)} from your bank account?
                </p>
                <div className="move-money-actions">
                  <button
                    type="button"
                    className="move-money-cancel"
                    onClick={() => setPayCreditCardAmount(null)}
                    disabled={payPhase.saving || payPhase.success}
                  >
                    Cancel
                  </button>
                  <SuccessButton
                    type="button"
                    disabled={payPhase.saving || payPhase.success}
                    saving={payPhase.saving}
                    success={payPhase.success}
                    onClick={async () => {
                      if (
                        payPhase.saving ||
                        payPhase.success ||
                        payCreditCardAmount == null
                      )
                        return;
                      payPhase.start();
                      try {
                        await confirmPayCreditCard(payCreditCardAmount);
                        payPhase.succeed(() => setPayCreditCardAmount(null));
                      } catch {
                        payPhase.fail();
                        setActionError(
                          "Couldn't record the payment — check your connection.",
                        );
                      }
                    }}
                  >
                    Pay {formatCurrency(payCreditCardAmount)}
                  </SuccessButton>
                </div>
              </Sheet>
            </Scrim>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {moveMoneyTarget && envelopeState && (
            <MoveMoneyScreen
              targetCategory={moveMoneyTarget.category}
              amount={moveMoneyTarget.amount}
              quick={moveMoneyTarget.amount !== undefined}
              onClose={() => setMoveMoneyTarget(null)}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {editAssignedTarget && (
            <EditAssignedScreen
              category={editAssignedTarget.category}
              takeBack={editAssignedTarget.takeBack}
              onClose={() => setEditAssignedTarget(null)}
            />
          )}
          {assignTarget && (
            <AssignMoneyScreen
              category={assignTarget}
              onClose={() => setAssignTarget(null)}
            />
          )}
          {editReady && (
            <EditReadyToAssignScreen onClose={() => setEditReady(false)} />
          )}
          {incomeScreen === "add" && (
            <AddIncomeScreen onClose={() => setIncomeScreen(null)} />
          )}
          {incomeScreen === "starting" && upcomingPay && (
            <AddIncomeScreen onClose={() => setIncomeScreen(null)} defaultLabel="Starting balance" intro={startingBalanceIntro(upcomingPay.start_date)} />
          )}
          {incomeScreen === "monthly" && envelopeState && (
            <RecurringIncomeModal
              id={monthlySchedules[0]?.id}
              initial={{ label: "Monthly income", amount: envelopeState.incomeBase > 0 ? String(envelopeState.incomeBase) : "", frequency: "monthly" }}
              onClose={() => setIncomeScreen(null)}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {showBulkReturnConfirm &&
            envelopeState &&
            (() => {
              const positive = envelopeState.envelopes.filter(
                (e) => e.available > 0,
              );
              const total = positive.reduce((s, e) => s + e.available, 0);
              return (
                <Scrim
                  className="move-money-overlay"
                  onClick={() => setShowBulkReturnConfirm(false)}
                >
                  <Sheet
                    className="move-money-modal bulk-return-modal"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Return all to Ready to Assign"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="move-money-header">
                      <h4>Return all to Ready to Assign</h4>
                      <button
                        type="button"
                        className="move-money-close"
                        onClick={() => setShowBulkReturnConfirm(false)}
                        disabled={
                          bulkReturnPhase.saving || bulkReturnPhase.success
                        }
                      >
                        ✕
                      </button>
                    </div>
                    {positive.length === 0 ? (
                      <p className="move-money-empty">
                        No categories with leftover available balance.
                      </p>
                    ) : (
                      <>
                        <p className="move-money-desc">
                          Move <strong>{formatCurrency(total)}</strong> from{" "}
                          {positive.length} categor
                          {positive.length === 1 ? "y" : "ies"} back to Ready to
                          Assign. Each category&apos;s Available will reset to{" "}
                          {formatCurrency(0)}.
                        </p>
                        <div className="bulk-return-list">
                          {positive.map((e) => (
                            <div key={e.category} className="bulk-return-row">
                              <span>{e.category}</span>
                              <span className="num">
                                {formatCurrency(e.available)}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="move-money-actions">
                          <button
                            type="button"
                            className="action-button"
                            onClick={() => setShowBulkReturnConfirm(false)}
                            disabled={
                              bulkReturnPhase.saving || bulkReturnPhase.success
                            }
                          >
                            Cancel
                          </button>
                          <SuccessButton
                            type="button"
                            className="is-active erd-accent-action"
                            disabled={
                              bulkReturnPhase.saving || bulkReturnPhase.success
                            }
                            saving={bulkReturnPhase.saving}
                            success={bulkReturnPhase.success}
                            onClick={handleBulkReturnToRTA}
                          >
                            Return {formatCurrency(total)} to RTA
                          </SuccessButton>
                        </div>
                      </>
                    )}
                  </Sheet>
                </Scrim>
              );
            })()}
        </AnimatePresence>
        {showFluidDemo && (
          <Scrim onClick={() => setShowFluidDemo(false)}>
            <Sheet>
              <FluidDemo />
              <button
                type="button"
                className="action-button is-ghost"
                onClick={() => setShowFluidDemo(false)}
                style={{ marginTop: "24px" }}
              >
                Close Demo
              </button>
            </Sheet>
          </Scrim>
        )}
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
        <button
          type="button"
          className="erd-tab-fab"
          onClick={() => setShowLogModal(true)}
          disabled={!panel}
          aria-label="Log expense"
        >
          +
        </button>
        <InsightsTab />
        <Link href="/account" className="erd-tab">
          <GearIcon size={22} aria-hidden />
          <span>Account</span>
        </Link>
      </nav>
      <AnimatePresence>
        {showLogModal && (
          <LogExpenseModal
            onClose={() => setShowLogModal(false)}
            onSaved={() => {}}
          />
        )}
      </AnimatePresence>
    </section>
  );
}
