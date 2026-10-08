"use client";

import { useCurrency } from "@/src/context/CurrencyContext";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { AmountText } from "../components/landing/mobile/kit";
import { ChevronRight, Pencil } from "lucide-react";
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
  EditMonthIncomeScreen,
} from "../components/MoneyScreens";
import { ExpenseSidebar } from "../components/ExpenseSidebar";
import { Scrim, Sheet } from "../components/MotionSheet";
import { ExpensePageLoading } from "../components/ExpensePageLoading";
import {
  toExpensePanelData,
  type ExpensePanelData,
} from "../services/expensePanelAdapter";
import { buildExpensePanel } from "../lib/expensePanel";
import { EMPTY } from "../lib/constants";
import { useBudgets, useTransferBudget, useUpdateBudget } from "../hooks/useBudgets";
import { useRecentExpenses, useLastSpent, useAddExpense } from "../hooks/useExpenses";
import { useCategories } from "../hooks/useCategories";
import { useGroups } from "../hooks/useGroups";
import { useSubscriptions, useCancelSubscription, useReactivateSubscription } from "../hooks/useSubscriptions";
import { useHideAmounts } from "../hooks/useHideAmounts";
import { GetStartedCard } from "../components/home/GetStartedCard";
import { LearningCard } from "../components/home/LearningCard";
import { BalanceCheckCard } from "../components/balance/BalanceCheckCard";
import { useUser } from "../hooks/useUser";
import { WeekRecapGate } from "../components/wrapped/WeekRecap";
import { usePersistentState } from "../hooks/usePersistentState";
import { LogExpenseModal } from "../components/LogExpenseModal";
import { SuccessButton, useButtonPhase } from "../components/SuccessButton";
import type { EnvelopeState } from "../types/expense";
import { computeEnvelopeState, currentMonthKey, daysLeftInMonth, monthLabel, prevMonthKey } from "../lib/envelope";

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
  const expensesQuery = useRecentExpenses();
  const lastSpent = useLastSpent().data;
  const categoriesQuery = useCategories();
  const groupsQuery = useGroups();
  const subscriptionsQuery = useSubscriptions();
  const user = useUser().data;

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
    groupsQuery.isLoading;

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
      categoryRows,
      groupNames,
      currencyCode,
    ],
  );
  // Read-only here: the toggle lives on /account, next to the theme control.
  const [hideAmounts] = useHideAmounts();
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
  const [moveMoneyTarget, setMoveMoneyTarget] = useState<string | null>(null);
  const [editAssignedTarget, setEditAssignedTarget] = useState<string | null>(
    null,
  );
  const [assignTarget, setAssignTarget] = useState<string | null>(null);
  const [editReady, setEditReady] = useState(false);
  const [incomeScreen, setIncomeScreen] = useState<"add" | "monthly" | null>(null);
  const [incomeMenuOpen, setIncomeMenuOpen] = useState(false);
  const incomeMenuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!incomeMenuOpen) return;
    function onPointer(e: MouseEvent) {
      if (!incomeMenuRef.current?.contains(e.target as Node)) setIncomeMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setIncomeMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [incomeMenuOpen]);
  const [showBulkReturnConfirm, setShowBulkReturnConfirm] = useState(false);
  const previousMonth = prevMonthKey(panel?.month ?? currentMonthKey());
  const [leftoverDismissed, setLeftoverDismissed] = usePersistentState(
    `rollover-dismissed-${previousMonth}`, false, parseDismissed, serializeDismissed,
  );
  const [getStartedSkipped, setGetStartedSkipped] = usePersistentState(
    'rollover-dismissed-get-started', false, parseDismissed, serializeDismissed,
  );
  const previousState = useMemo(
    () => computeEnvelopeState(budgetRows, expenseRows, previousMonth, categoryRows, groupNames),
    [budgetRows, expenseRows, previousMonth, categoryRows, groupNames],
  );
  const previousLeftover = previousState.income - previousState.totalSpent;
  // Unknown until budgets load; counting it done avoids flashing the income step.
  const incomeDone = !envelopeState || envelopeState.income > 0;
  const showGetStarted = !getStartedSkipped && !!user?.getStartedAt &&
    !(incomeDone && user.manualTransactionCompletedAt && user.guidedTourCompletedAt);
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
  const [editingSubscription, setEditingSubscription] = useState<SubscriptionPanelItem | null | undefined>(undefined);
  const { theme, setTheme } = useAppearance();

  async function changeSubscriptionStatus(service: string, action: "cancel" | "reactivate") {
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
      const updated = current.envelopes.map((e) =>
        e.available > 0 ? { ...e, assigned: e.assigned - e.available, available: 0 } : e,
      );
      const totalAssigned = updated.reduce((sum, e) => sum + e.assigned, 0);
      const rta = current.income - totalAssigned;
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
      setActionError("Couldn't return the money — your envelopes were not changed.");
    }
  }

  async function handlePayCreditCard() {
    const ccEnv = envelopeState?.envelopes.find((e) => e.isCreditCardPayment);
    const amount = ccEnv?.available;
    if (!amount || amount <= 0) return;
    setPayCreditCardAmount(amount);
  }

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

  if (!panel) {
    return <ExpensePageLoading />;
  }

  return (
    <section className="expense-redesign">
      <WeekRecapGate />
      {actionError && (
        <div className="erd-action-error" role="alert">
          {actionError}
        </div>
      )}
      <button
        type="button"
        className="erd-theme-toggle"
        onClick={() => setTheme(theme === "light" ? "dark" : "light")}
        aria-label="Toggle theme"
      >
        {theme === "dark" ? "☀️" : "🌙"}
      </button>

      <header className="erd-mobile-header">
        <div className="erd-mobile-greet">
          <BirdMark size={30} perched /> Aviary
        </div>
      </header>

      {/* Mounted only once the dashboard has loaded, so the bird lands on the
          real sidebar rather than the loading screen's copy of it. */}

      <div className="erd-main">
        <ExpenseSidebar onBulkReturn={() => setShowBulkReturnConfirm(true)} />
        <motion.div className="erd-content" layoutScroll>
          <LayoutGroup id="home-onboarding">
          <div className="erd-home" data-get-started={showGetStarted ? "true" : undefined}>
            <div className="erd-home-main">
              {/* Income is entered from the menu top-right; RTA is often ₹0,
                  so the hero alone doesn't say where money comes in. */}
              {envelopeState && (
                <article className="erd-card erd-home-hero-card">
                  <div className="erd-home-hero">
                    <span className="erd-home-hero-label">READY TO ASSIGN</span>
                    <strong
                      className={`erd-home-hero-amount ${envelopeState.readyToAssign < 0 ? "is-negative" : ""}`}
                    >
                      {hideAmounts ? (
                        "---"
                      ) : (
                        <AmountText
                          value={envelopeState.readyToAssign}
                          animate
                          id="ready-to-assign"
                        />
                      )}
                    </strong>
                    <span className="erd-home-hero-caption">
                      {monthLabel(panel.month)} ·{" "}
                      {daysLeftInMonth() === 0
                        ? "Less than 24 hrs"
                        : `${daysLeftInMonth()} days left`}
                    </span>
                  </div>
                  <div className="env-action-wrap erd-home-hero-menu" ref={incomeMenuRef}>
                    <button
                      type="button"
                      className="env-menu-trigger"
                      aria-label="Income options"
                      aria-haspopup="menu"
                      aria-expanded={incomeMenuOpen}
                      onClick={() => setIncomeMenuOpen((open) => !open)}
                    >
                      <Pencil size={15} aria-hidden="true" />
                    </button>
                    {incomeMenuOpen && (
                      <div className="env-menu" role="menu">
                        <button
                          type="button"
                          role="menuitem"
                          className="env-menu-item"
                          onClick={() => {
                            setIncomeMenuOpen(false);
                            setIncomeScreen("monthly");
                          }}
                        >
                          Change income
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="env-menu-item"
                          onClick={() => {
                            setIncomeMenuOpen(false);
                            setIncomeScreen("add");
                          }}
                        >
                          Add income
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="env-menu-item"
                          onClick={() => {
                            setIncomeMenuOpen(false);
                            setEditReady(true);
                          }}
                        >
                          Set Ready to Assign
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              )}

              {!leftoverDismissed && previousLeftover > 0 && (
                <article className="erd-card home-leftover-notice">
                  <p>{formatCurrency(previousLeftover, hideAmounts)} left over from last month.</p>
                  <button type="button" onClick={() => setLeftoverDismissed(true)}>Okay</button>
                </article>
              )}

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
                      manualTransactionDone={!!user.manualTransactionCompletedAt}
                      guidedTourDone={!!user.guidedTourCompletedAt}
                      onAddIncome={() => setIncomeScreen("monthly")}
                      onAddTransaction={() => setShowLogModal(true)}
                      onTakeTour={() => router.push('/account/guided-tour')}
                      onSkip={() => setGetStartedSkipped(true)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              <LearningCard />

              {/* The weekly balance check keeps these totals honest without bank
                  linking: a prompt when one is due, else the logged meter. */}
              <BalanceCheckCard />

              {envelopeState && (
                <motion.article
                  className="erd-card erd-envelopes-panel"
                  layout={reduceMotion ? false : "position"}
                  transition={homeTransition}
                >
                  <EnvelopeGrid
                    envelopes={envelopeState.envelopes}
                    groups={envelopeState.groups}
                    hideAmounts={hideAmounts}
                    onManage={() => router.push("/expense/envelopes")}
                    onMoveMoney={(cat) => setMoveMoneyTarget(cat)}
                    onAssignFromRTA={setAssignTarget}
                    onSetAssigned={setEditAssignedTarget}
                    onPayCreditCard={handlePayCreditCard}
                  />
                </motion.article>
              )}

              <MotionLink
                href="/insights"
                className="erd-home-insights-link"
                layout={reduceMotion ? false : "position"}
                transition={homeTransition}
              >
                Trends and daily spend <ChevronRight size={16} />
              </MotionLink>
            </div>
            <aside className="erd-home-rail" aria-label="Subscriptions and recent activity">
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
              <RecentActivity expenses={expenseRows} hideAmounts={hideAmounts} />
            </aside>
          </div>
          </LayoutGroup>
        </motion.div>
        <AnimatePresence>
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
          {payCreditCardAmount !== null && envelopeState && (
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
              targetCategory={moveMoneyTarget}
              onClose={() => setMoveMoneyTarget(null)}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {editAssignedTarget && (
            <EditAssignedScreen
              category={editAssignedTarget}
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
          {incomeScreen === "monthly" && envelopeState && (
            <EditMonthIncomeScreen
              month={envelopeState.month}
              initial={envelopeState.incomeBase}
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
          <span aria-hidden="true">🏠</span>
          <span>Home</span>
        </Link>
        <Link href="/expense/transactions" className="erd-tab">
          <span aria-hidden="true">🧾</span>
          <span>Activity</span>
        </Link>
        <button
          type="button"
          className="erd-tab-fab"
          onClick={() => setShowLogModal(true)}
          aria-label="Log expense"
        >
          +
        </button>
        <Link href="/insights" className="erd-tab">
          <span aria-hidden="true">📊</span>
          <span>Insights</span>
        </Link>
        <Link href="/account" className="erd-tab">
          <span aria-hidden="true">⚙️</span>
          <span>More</span>
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
