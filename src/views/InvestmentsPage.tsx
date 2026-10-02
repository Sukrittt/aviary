"use client";

import { useCurrency } from "@/src/context/CurrencyContext";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AmountText,
  popIn,
  staggerDelay,
} from "../components/landing/mobile/kit";
import { ArrowRight, ChevronRight, Plus } from "lucide-react";
import {
  useAddHolding,
  useDeleteHolding,
  useHoldings,
  usePerformHoldingAction,
  useUpdateHolding,
} from "../hooks/useHoldings";
import { predictHoldingType } from "../api/holdings";
import { useHoldingEvents } from "../hooks/useHoldingEvents";
import { useHideAmounts } from "../hooks/useHideAmounts";
import { EMPTY } from "../lib/constants";
import { formatDateTime, formatOrdinalDate } from "../lib/format";
import { CHART_COLORS } from "../theme/chartColors";
import type { HoldingRow } from "../types";
import { Scrim, Sheet } from "../components/MotionSheet";
import { ExpenseSidebar } from "../components/ExpenseSidebar";
import {
  AllocationBar,
  type AllocationSegment,
} from "../components/charts/AllocationBar";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DeletingRow } from "../components/DeletingRow";
import { LoadingCaption } from "../components/LoadingCaption";
import { SuccessButton, useButtonPhase } from "../components/SuccessButton";
import {
  HoldingWriteError,
  holdingChanges,
  holdingDraft,
  rebaseHoldingDraft,
  type HoldingDraft,
} from "../lib/holdingConflict";
import { BirdEmptyState } from "../components/BirdEmptyState";

const TYPES = [
  "Equity",
  "FD",
  "Mutual Fund",
  "Gold",
  "Crypto",
  "Bonds",
  "Other",
];

// Fixed colors for common asset types, same keys as Mobile's FIXED_TYPE_COLOR;
// anything else cycles the shared chart palette.
const FIXED_TYPE_COLOR: Record<string, string> = {
  Equity: "var(--blue)",
  FD: "var(--mint)",
  "Mutual Fund": "var(--violet)",
  Gold: "var(--gold)",
  Crypto: "var(--coral)",
  Bonds: "var(--warn)",
  // CHART_COLORS is the exact same six colors above, index-for-index, so
  // cycling it for unlisted types always collides with one of them.
  Other: "var(--erd-text3)",
};

type ActionType = "market_update" | "contribution" | "withdrawal";

const ACTION_TITLES: Record<ActionType, string> = {
  market_update: "Update market value",
  contribution: "Add contribution",
  withdrawal: "Withdraw",
};

const ACTION_COPY: Record<ActionType, string> = {
  market_update: "Set the new current value.",
  contribution:
    "Amount being invested. Tracked here only. Budget it separately if you want it reflected in Ready to Assign.",
  withdrawal:
    "Amount to withdraw. Tracked here only. Budget it separately if you want it reflected in Ready to Assign.",
};

const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  market_update: { label: "Market update", color: "var(--gold-ink)" },
  contribution: { label: "Contribution", color: "var(--mint)" },
  withdrawal: { label: "Withdrawal", color: "var(--coral)" },
};

/** `/investments`. Twin of Mobile's investments.tsx + modals/add-holding.tsx + modals/holding-action.tsx. */
export function InvestmentsPage() {
  const { formatCurrency } = useCurrency();
  const [hideAmounts] = useHideAmounts();
  const holdingsQuery = useHoldings();
  const eventsQuery = useHoldingEvents();
  const deleteHolding = useDeleteHolding();

  const holdings = holdingsQuery.data ?? EMPTY;
  const events = eventsQuery.data ?? EMPTY;
  const isLoading = holdingsQuery.isLoading || eventsQuery.isLoading;
  const loadError = holdingsQuery.error ?? eventsQuery.error;

  const [menuHolding, setMenuHolding] = useState<HoldingRow | null>(null);
  const [action, setAction] = useState<{
    name: string;
    type: ActionType;
  } | null>(null);
  // undefined = closed, '' = add, a name = edit that holding's monthly contribution.
  const [editing, setEditing] = useState<string | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  // Confirmed delete waits for the dialog to finish closing (else its fade
  // hides the sweep), then the row sweeps and handleDelete runs.
  const queuedDelete = useRef<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  // Dropped from the list as soon as the sweep ends, so rows below spring up
  // at once; a failed delete puts the name back.
  const [removedNames, setRemovedNames] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const shownHoldings = holdings.filter((h) => !removedNames.has(h.name));
  const [error, setError] = useState<string | null>(null);

  const netWorth = useMemo(
    () => holdings.reduce((sum, h) => sum + (Number(h.value) || 0), 0),
    [holdings],
  );

  const segments: AllocationSegment[] = useMemo(() => {
    const byType = new Map<string, number>();
    for (const h of holdings)
      byType.set(h.type, (byType.get(h.type) ?? 0) + (Number(h.value) || 0));
    return [...byType.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([type, value], i) => ({
        label: type,
        value,
        color: FIXED_TYPE_COLOR[type] ?? CHART_COLORS[i % CHART_COLORS.length],
      }));
  }, [holdings]);

  const reversedEvents = useMemo(() => events.slice().reverse(), [events]);

  async function handleDelete(name: string) {
    setDeleteTarget(null);
    setError(null);
    setPendingDelete(null);
    setRemovedNames((names) => new Set(names).add(name));
    try {
      await deleteHolding.mutateAsync(name);
    } catch {
      setRemovedNames((names) => {
        const next = new Set(names);
        next.delete(name);
        return next;
      });
      setError(`Couldn't delete ${name}. Check your connection and try again.`);
    }
  }

  function pick(next: () => void) {
    setMenuHolding(null);
    next();
  }

  return (
    <section className="expense-redesign">
      <header className="erd-mobile-header">
        <div className="erd-mobile-greet">Investments</div>
        <div className="erd-mobile-sub">
          <span>Net worth, allocation, and holdings</span>
        </div>
      </header>

      <div className="erd-main">
        <ExpenseSidebar />
        <div className="erd-content inv-page">
          <div className="erd-panel-head">
            <div>
              <div className="erd-panel-title">Investments</div>
              <div className="erd-panel-head-sub">
                {holdings.length}{" "}
                {holdings.length === 1 ? "holding" : "holdings"}
              </div>
            </div>
            <div className="erd-panel-tools">
              <button
                type="button"
                className="erd-log-btn"
                onClick={() => setEditing("")}
              >
                <Plus size={14} aria-hidden="true" />
                Add holding
              </button>
            </div>
          </div>

          {(error || loadError) && (
            <div className="erd-action-error" role="alert">
              {error ??
                "Couldn't load your investments. Check your connection and try again."}
            </div>
          )}

          {isLoading ? (
            <LoadingCaption feature="investments" placement="page" />
          ) : (
            <>
              <div className="erd-card inv-hero">
                <div className="account-section-label" style={{ padding: 0 }}>
                  Net worth
                </div>
                <div className="recurring-hero-amount">
                  {hideAmounts ? (
                    formatCurrency(netWorth, true)
                  ) : (
                    <AmountText value={netWorth} animate />
                  )}
                </div>
                {segments.length > 0 && <AllocationBar segments={segments} />}
              </div>

              <div>
                <div
                  className="account-section-label"
                  style={{ marginBottom: 10 }}
                >
                  Holdings
                </div>
                {shownHoldings.length === 0 ? (
                  <BirdEmptyState
                    subject="holdings"
                    title="Room to grow"
                    description="No holdings yet. Add one to start watching your future take shape."
                    action={{ label: 'Add a holding', onClick: () => setEditing('') }}
                  />
                ) : (
                  <ul
                    className="account-card recurring-list"
                    aria-label="Holdings"
                  >
                    <AnimatePresence mode="popLayout" initial={false}>
                    {shownHoldings.map((h, i) => (
                      <DeletingRow
                        key={h.name}
                        as="li"
                        active={pendingDelete === h.name}
                        onDone={() => void handleDelete(h.name)}
                      >
                        <motion.div {...popIn(staggerDelay(i))}>
                          <button
                            type="button"
                            className="account-row"
                            onClick={() => setMenuHolding(h)}
                          >
                            <span
                              className="recurring-dot"
                              style={{
                                background:
                                  FIXED_TYPE_COLOR[h.type] ??
                                  "var(--erd-text3)",
                              }}
                            />
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <span className="account-row-label recurring-title">
                                {h.name}
                              </span>
                              <span className="account-row-meta recurring-meta">
                                {h.type} · Updated{" "}
                                {formatDateTime(h.updated_at)}
                              </span>
                              {h.is_recurring === "true" && (
                                <span className="account-row-meta recurring-due">
                                  Monthly{" "}
                                  {formatCurrency(
                                    Number(h.recurring_amount) || 0,
                                    hideAmounts,
                                  )}
                                  {h.next_contribution_date && ` · Next ${formatOrdinalDate(h.next_contribution_date)}`}
                                </span>
                              )}
                            </span>
                            <strong>
                              {formatCurrency(
                                Number(h.value) || 0,
                                hideAmounts,
                              )}
                            </strong>
                            <ChevronRight
                              size={16}
                              className="account-row-arrow"
                              aria-hidden="true"
                            />
                          </button>
                        </motion.div>
                      </DeletingRow>
                    ))}
                    </AnimatePresence>
                  </ul>
                )}
              </div>

              {events.length > 0 && (
                <div>
                  <div
                    className="account-section-label"
                    style={{ marginBottom: 10 }}
                  >
                    Activity ({events.length})
                  </div>
                  <ul
                    className="account-card recurring-list"
                    aria-label="Investment activity"
                  >
                    {reversedEvents.map((e, i) => {
                      const meta = EVENT_LABELS[e.event_type] ?? {
                        label: e.event_type,
                        color: "var(--erd-text2)",
                      };
                      return (
                        <li
                          key={i}
                          className="account-row"
                          style={{ cursor: "default" }}
                        >
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span
                              className="account-row-label recurring-title"
                              style={{ color: meta.color }}
                            >
                              {meta.label}
                            </span>
                            <span className="account-row-meta recurring-meta">
                              {e.holding_name} · {formatDateTime(e.timestamp)}
                            </span>
                            <span className="account-row-meta inv-delta">
                              {formatCurrency(
                                Number(e.previous_value) || 0,
                                hideAmounts,
                              )}
                              <ArrowRight size={12} aria-hidden="true" />
                              {formatCurrency(
                                Number(e.new_value) || 0,
                                hideAmounts,
                              )}
                            </span>
                          </span>
                          <strong>
                            {e.event_type === "withdrawal" ? "-" : "+"}
                            {formatCurrency(Number(e.amount) || 0, hideAmounts)}
                          </strong>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <AnimatePresence>
        {menuHolding && (
          <Scrim
            className="erd-modal-overlay"
            onClick={() => setMenuHolding(null)}
          >
            <Sheet
              className="erd-modal-card inv-menu"
              role="dialog"
              aria-modal="true"
              aria-label={menuHolding.name}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="account-section-label inv-menu-title">
                {menuHolding.name}
              </div>
              {(["market_update", "contribution", "withdrawal"] as const).map(
                (type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() =>
                      pick(() => setAction({ name: menuHolding.name, type }))
                    }
                  >
                    {ACTION_TITLES[type]}
                  </button>
                ),
              )}
              <button
                type="button"
                onClick={() => pick(() => setEditing(menuHolding.name))}
              >
                Edit monthly contribution
              </button>
              <button
                type="button"
                className="is-danger"
                onClick={() => pick(() => setDeleteTarget(menuHolding.name))}
              >
                Delete
              </button>
              <button
                type="button"
                className="is-muted"
                onClick={() => setMenuHolding(null)}
              >
                Cancel
              </button>
            </Sheet>
          </Scrim>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {action && (
          <HoldingActionModal
            name={action.name}
            type={action.type}
            holding={holdings.find((h) => h.name === action.name)}
            onClose={() => setAction(null)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {editing !== undefined && (
          <HoldingModal
            name={editing || undefined}
            holding={holdings.find((h) => h.name === editing)}
            onClose={() => setEditing(undefined)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence
        onExitComplete={() => {
          if (!queuedDelete.current) return;
          setPendingDelete(queuedDelete.current);
          queuedDelete.current = null;
        }}
      >
        {deleteTarget && (
          <ConfirmDialog
            title={`Delete ${deleteTarget}?`}
            body="It will move to Archive. You can restore it for 7 days."
            cancelLabel="Keep"
            onCancel={() => setDeleteTarget(null)}
          >
            <button
              type="button"
              className="account-danger-btn"
              style={{ marginTop: 0 }}
              onClick={() => {
                queuedDelete.current = deleteTarget;
                setDeleteTarget(null);
              }}
            >
              Delete
            </button>
          </ConfirmDialog>
        )}
      </AnimatePresence>
    </section>
  );
}

function HoldingActionModal({
  name,
  type,
  holding,
  onClose,
}: {
  name: string;
  type: ActionType;
  holding: HoldingRow | undefined;
  onClose: () => void;
}) {
  const { formatCurrency, currencySymbol } = useCurrency();
  const [hideAmounts] = useHideAmounts();
  const performAction = usePerformHoldingAction();
  const phase = useButtonPhase();
  const currentValue = Number(holding?.value) || 0;
  const [amount, setAmount] = useState(
    type === "market_update" && holding ? String(currentValue) : "",
  );
  const [error, setError] = useState<string | null>(null);

  const parsed = Number(amount);
  const canSubmit =
    amount.trim() !== "" && !Number.isNaN(parsed) && parsed >= 0;
  const busy = phase.saving || phase.success;

  async function handleConfirm() {
    if (!canSubmit || busy) return;
    setError(null);
    phase.start();
    try {
      await performAction.mutateAsync({ name, action: type, amount: parsed });
      phase.succeed(onClose);
    } catch {
      setError("Couldn't save. Check your connection and try again.");
      phase.fail();
    }
  }

  return (
    <Scrim className="erd-modal-overlay" onClick={busy ? undefined : onClose}>
      <Sheet
        className="erd-modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={ACTION_TITLES[type]}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="erd-modal-head">
          <h3>{ACTION_TITLES[type]}</h3>
          <button
            type="button"
            className="erd-modal-close"
            onClick={onClose}
            aria-label="Close"
            disabled={phase.success}
          >
            ✕
          </button>
        </div>
        <div className="account-row-label">{name}</div>
        {holding && (
          <div className="account-row-meta">
            Current value: {formatCurrency(currentValue, hideAmounts)}
          </div>
        )}
        <p className="recurring-hint">{ACTION_COPY[type]}</p>

        <label className="erd-log-label" htmlFor="holding-action-amount">
          Amount ({currencySymbol})
        </label>
        <input
          id="holding-action-amount"
          className="erd-log-input"
          type="number"
          inputMode="decimal"
          min="0"
          placeholder="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
          autoFocus
        />

        {error && <p className="erd-log-error">{error}</p>}

        <SuccessButton
          type="button"
          baseClass="erd-log-submit"
          saving={phase.saving}
          success={phase.success}
          successLabel="Saved"
          disabled={!canSubmit || busy}
          onClick={handleConfirm}
        >
          Confirm
        </SuccessButton>
      </Sheet>
    </Scrim>
  );
}

/** Add a holding, or (with `name`) edit only its monthly contribution — never its value, same as Mobile. */
export function HoldingModal({
  name,
  holding,
  onClose,
}: {
  name?: string;
  holding: HoldingRow | undefined;
  onClose: () => void;
}) {
  const { currencySymbol } = useCurrency();
  const addHolding = useAddHolding();
  const updateHolding = useUpdateHolding();
  const phase = useButtonPhase();
  const isEdit = name !== undefined;
  const initialDraft: HoldingDraft = holding
    ? holdingDraft(holding)
    : { isRecurring: false, recurringAmount: "" };

  const [newName, setNewName] = useState("");
  const [type, setType] = useState("");
  const [typeTouched, setTypeTouched] = useState(false);
  const [value, setValue] = useState("");
  const [base, setBase] = useState(initialDraft);
  const [expectedVersion, setExpectedVersion] = useState(holding?.version ?? 0);
  const [isRecurring, setIsRecurring] = useState(initialDraft.isRecurring);
  const [recurringAmount, setRecurringAmount] = useState(
    initialDraft.recurringAmount,
  );
  const [conflict, setConflict] = useState<HoldingRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const typeTouchedRef = useRef(typeTouched);
  const typeSuggestTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    typeTouchedRef.current = typeTouched;
  }, [typeTouched]);

  // Guess the type from the holding name while it's still untyped, same debounced-Jev
  // pattern as expense category suggestions. A manual chip pick always wins.
  useEffect(() => {
    if (isEdit) return;
    if (typeSuggestTimer.current) clearTimeout(typeSuggestTimer.current);
    if (newName.trim().length < 3) return;
    typeSuggestTimer.current = setTimeout(() => {
      predictHoldingType(newName, TYPES).then((suggested) => {
        if (typeTouchedRef.current || !suggested) return;
        setType(suggested);
      });
    }, 300);
    return () => {
      if (typeSuggestTimer.current) clearTimeout(typeSuggestTimer.current);
    };
  }, [newName, isEdit]);

  const parsedValue = Number(value);
  const parsedRecurring = Number(recurringAmount);
  const recurringOk =
    !isRecurring ||
    (recurringAmount.trim() !== "" &&
      !Number.isNaN(parsedRecurring) &&
      parsedRecurring >= 0);
  const draft = { isRecurring, recurringAmount };
  const recurringUpdates = holdingChanges(base, draft);
  const hasChanges = Object.keys(recurringUpdates).length > 0;
  const canSubmit = isEdit
    ? recurringOk && hasChanges
    : newName.trim() !== "" &&
      value.trim() !== "" &&
      !Number.isNaN(parsedValue) &&
      parsedValue >= 0 &&
      recurringOk;
  const busy = phase.saving || phase.success;

  async function handleSubmit() {
    if (!canSubmit || busy) return;
    setError(null);
    phase.start();
    try {
      if (isEdit)
        await updateHolding.mutateAsync({
          name,
          version: expectedVersion,
          updates: recurringUpdates,
        });
      else
        await addHolding.mutateAsync({
          name: newName.trim(),
          type: type || "Other",
          value: value.trim(),
          is_recurring: isRecurring,
          recurring_amount: isRecurring ? recurringAmount.trim() : undefined,
        });
      phase.succeed(onClose);
    } catch (e) {
      if (e instanceof HoldingWriteError && e.status === 409 && e.current) {
        setConflict(e.current);
        setError(null);
        phase.fail();
        return;
      }
      setError(
        e instanceof Error
          ? e.message
          : "Couldn't save. Check your connection and try again.",
      );
      phase.fail();
    }
  }

  const title = isEdit ? "Edit monthly contribution" : "Add holding";

  function reviewLatest(keepDraft: boolean) {
    if (!conflict) return;
    const latest = holdingDraft(conflict);
    const next = keepDraft ? rebaseHoldingDraft(base, draft, conflict) : latest;
    setBase(latest);
    setExpectedVersion(conflict.version);
    setIsRecurring(next.isRecurring);
    setRecurringAmount(next.recurringAmount);
    setConflict(null);
    setError(null);
  }

  const merged = conflict ? rebaseHoldingDraft(base, draft, conflict) : null;
  const describeRecurring = (value: HoldingDraft) =>
    value.isRecurring
      ? `${currencySymbol}${Number(value.recurringAmount || 0).toLocaleString()} monthly`
      : "Off";

  return (
    <Scrim className="erd-modal-overlay" onClick={busy ? undefined : onClose}>
      <Sheet
        className="erd-modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="erd-modal-head">
          <h3>{title}</h3>
          <button
            type="button"
            className="erd-modal-close"
            onClick={onClose}
            aria-label="Close"
            disabled={phase.success}
          >
            ✕
          </button>
        </div>

        {conflict && merged ? (
          <div
            className="txn-review"
            role="region"
            aria-labelledby="holding-conflict-title"
          >
            <span className="txn-review-icon" aria-hidden="true">
              ↻
            </span>
            <h4 id="holding-conflict-title">This holding was updated</h4>
            <p className="txn-review-intro">
              A newer version was saved elsewhere. Your monthly contribution is
              still here.
            </p>
            <div className="txn-review-comparison">
              <div className="txn-review-columns" aria-hidden="true">
                <span>Latest saved</span>
                <span>With your changes</span>
              </div>
              <div className="txn-review-row">
                <div className="txn-review-label">Monthly contribution</div>
                <div className="txn-review-values">
                  <span>
                    <span className="txn-review-sr-only">Latest saved: </span>
                    {describeRecurring(holdingDraft(conflict))}
                  </span>
                  <span className="txn-review-changed">
                    <span className="txn-review-sr-only">
                      With your changes:{" "}
                    </span>
                    {describeRecurring(merged)}
                  </span>
                </div>
              </div>
            </div>
            <p className="txn-review-note">
              Continue with your edit and keep the latest holding updates. You
              can review it before saving.
            </p>
            <div className="txn-review-actions">
              <button
                type="button"
                className="txn-review-primary"
                onClick={() => reviewLatest(true)}
              >
                Continue with my changes <span aria-hidden="true">→</span>
              </button>
              <button
                type="button"
                className="txn-review-secondary"
                onClick={() => reviewLatest(false)}
              >
                Use latest instead
              </button>
            </div>
            <p className="txn-review-footnote">
              Nothing will be saved until you confirm.
            </p>
          </div>
        ) : (
          <>
            {isEdit ? (
              <>
                <div className="erd-log-label">Holding</div>
                <div className="account-row-label">{name}</div>
              </>
            ) : (
              <>
                <label className="erd-log-label" htmlFor="holding-name">
                  Name
                </label>
                <input
                  id="holding-name"
                  className="erd-log-input"
                  placeholder="e.g. Stocks"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  autoFocus
                />

                <div className="erd-log-label">Type</div>
                <div className="erd-chip-row">
                  {TYPES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`erd-chip ${type === t ? "is-selected" : ""}`}
                      aria-pressed={type === t}
                      onClick={() => {
                        setType(type === t ? "" : t);
                        setTypeTouched(true);
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                <label
                  className="erd-log-label"
                  htmlFor="holding-value"
                  style={{ marginTop: 24 }}
                >
                  Current value ({currencySymbol})
                </label>
                <input
                  id="holding-value"
                  className="erd-log-input"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  placeholder="0"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              </>
            )}

            <label className="account-row inv-recurring-toggle">
              <span className="account-row-label">
                Repeat monthly (SIP/PF)
                <span className="account-row-hint">
                  {isEdit
                    ? "Adds the amount below as a contribution on top of the current balance every month"
                    : "Adds the amount below as a contribution on this day every month"}
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                className="account-switch"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
              />
            </label>
            {isRecurring && (
              <>
                <label className="erd-log-label" htmlFor="holding-monthly">
                  Monthly contribution ({currencySymbol})
                </label>
                <input
                  id="holding-monthly"
                  className="erd-log-input"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  placeholder="0"
                  value={recurringAmount}
                  onChange={(e) => setRecurringAmount(e.target.value)}
                />
              </>
            )}

            {error && <p className="erd-log-error">{error}</p>}

            <SuccessButton
              type="button"
              baseClass="erd-log-submit"
              saving={phase.saving}
              success={phase.success}
              successLabel="Saved"
              disabled={!canSubmit || busy}
              onClick={handleSubmit}
            >
              {isEdit ? "Save changes" : "Add holding"}
            </SuccessButton>
          </>
        )}
      </Sheet>
    </Scrim>
  );
}
