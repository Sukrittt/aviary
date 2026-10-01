"use client";
import { useState } from "react";
import { ArrowRight, Check, LoaderCircle, Repeat2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { popIn, staggerDelay } from "./landing/mobile/kit";
import "./RecurringSuggestions.css";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  loadRecurringSuggestions,
  scanRecurringSuggestions,
  dismissRecurringSuggestion,
} from "../api/recurringSuggestions";
import { useCurrency } from "../context/CurrencyContext";
import { useHideAmounts } from "../hooks/useHideAmounts";
import { formatDateShort } from "../lib/format";
import type {
  RecurringSuggestion,
  RecurringScan,
  ScanMonths,
} from "../types/recurringSuggestions";
import { LoadingCaption } from "./LoadingCaption";
import { Select } from "./Select";
import { RecurringExpenseModal } from "./RecurringExpenseModal";
import { SubscriptionModal } from "./SubscriptionModal";

const baseKey = ["recurring-suggestions"] as const;
type SuggestionKind = RecurringSuggestion["kind"];

export function RecurringSuggestions({ kind = "other_recurring" }: { kind?: SuggestionKind }) {
  const qc = useQueryClient();
  const subscriptionMode = kind === "subscription";
  const [months, setMonths] = useState<ScanMonths>(subscriptionMode ? 12 : 6);
  const key = [...baseKey, months] as const;
  const { formatCurrency } = useCurrency();
  const [hideAmounts] = useHideAmounts();
  const [reviewing, setReviewing] = useState<RecurringSuggestion | null>(null);
  const [accepted, setAccepted] = useState<string[]>([]);
  const query = useQuery({
    queryKey: key,
    queryFn: () => loadRecurringSuggestions(months),
    staleTime: 30_000,
    retry: false,
  });
  const scan = useMutation({
    mutationFn: scanRecurringSuggestions,
    onSuccess: (data, scannedMonths) =>
      qc.setQueryData([...baseKey, scannedMonths], data),
  });
  const dismiss = useMutation({
    mutationFn: dismissRecurringSuggestion,
    onSuccess: (_, id) => {
      qc.setQueriesData<RecurringScan>({ queryKey: baseKey }, (old) =>
        old
          ? { ...old, suggestions: old.suggestions.filter((s) => s.id !== id) }
          : old,
      );
    },
  });
  const data = query.data;
  const suggestions =
    data?.suggestions.filter((s) => s.kind === kind && !accepted.includes(s.id)) ?? [];
  const busy = scan.isPending || dismiss.isPending;
  const failure = scan.error ?? dismiss.error ?? query.error;
  return (
    <section
      className="account-card recurring-discovery"
      aria-label={subscriptionMode ? "Find subscriptions" : "Find recurring expenses"}
    >
      <div className="recurring-discovery-header">
        <div className="recurring-discovery-intro">
          <span className="recurring-discovery-icon" aria-hidden="true">
            <Repeat2 size={22} strokeWidth={1.7} />
          </span>
          <div>
            <h2>{subscriptionMode ? "Find subscriptions" : "Find recurring expenses"}</h2>
            <p>{subscriptionMode ? "Spot services you already pay for and start tracking them." : "Spot repeated payments. Choose which ones to automate."}</p>
          </div>
        </div>
        <div className="recurring-discovery-controls">
          <div className="recurring-discovery-period">
            <Select
              id="recurring-scan-period"
              aria-label="Scan period"
              value={String(months)}
              disabled={busy}
              options={[
                { value: "1", label: "Last month" },
                { value: "3", label: "Last 3 months" },
                { value: "6", label: "Last 6 months" },
                { value: "12", label: "Last 12 months" },
              ]}
              onChange={(value) => {
                setMonths(Number(value) as ScanMonths);
                scan.reset();
                dismiss.reset();
              }}
            />
          </div>
          <button
            type="button"
            className="account-compact-btn recurring-discovery-scan"
            disabled={busy || query.isLoading}
            onClick={() => scan.mutate(months)}
          >
            {scan.isPending && (
              <LoaderCircle
                size={16}
                className="recurring-discovery-spinner"
                aria-hidden="true"
              />
            )}
            {scan.isPending
              ? "Scanning expenses…"
              : data?.scannedAt && data.remaining > 0
                ? "Scan remaining patterns"
                : subscriptionMode ? "Find subscriptions" : "Find recurring expenses"}
            {!scan.isPending && <ArrowRight size={16} aria-hidden="true" />}
          </button>
        </div>
      </div>
      {months === 1 && (
        <p className="recurring-discovery-hint">
          For monthly bills, try a 3 or 6 month scan.
        </p>
      )}
      {scan.isPending ? (
        <div className="recurring-discovery-loading">
          <LoadingCaption feature="recurringScan" placement="section" />
        </div>
      ) : (
        <div
          className="recurring-discovery-status"
          role="status"
          aria-live="polite"
        >
          {query.isLoading && (
            <p className="account-row-meta">Loading saved results…</p>
          )}
          {data?.scannedAt && (
            <div className="recurring-discovery-summary">
              <p className="recurring-discovery-timestamp">
                Last scanned{" "}
                <time dateTime={data.scannedAt.slice(0, 10)}>
                  {formatDateShort(data.scannedAt.slice(0, 10))}
                </time>
              </p>
              <p className="recurring-discovery-range">
                Expenses from {formatDateShort(data.windowStart)} –{" "}
                {formatDateShort(data.windowEnd)}
              </p>
              <p className="recurring-discovery-caption">
                New expenses? Run another scan.
              </p>
            </div>
          )}
          {data?.stale && (
            <p className="account-row-meta">
              Some saved suggestions changed. Scan again to refresh them.
            </p>
          )}
          {Boolean(data?.failed) && (
            <p className="account-row-meta">
              Some patterns couldn’t be checked. Try scanning again.
            </p>
          )}
          {data && data.remaining > 0 && data.scannedAt && (
            <p className="account-row-meta">
              {data.remaining} new or changed patterns left to check.
            </p>
          )}
          {data?.scannedAt &&
            !data.stale &&
            !data.failed &&
            !data.remaining &&
            !suggestions.length &&
            !scan.isPending && (
              <div className="recurring-discovery-empty">
                <span
                  className="recurring-discovery-empty-icon"
                  aria-hidden="true"
                >
                  <Check size={19} />
                </span>
                <div>
                  <h3>{subscriptionMode ? "No new subscriptions" : "No new recurring payments"}</h3>
                  <p>
                    Nothing new to add for this period. Tracked and dismissed payments are hidden.
                  </p>
                </div>
              </div>
            )}
        </div>
      )}
      {failure && (
        <p className="erd-log-error" role="alert">
          {failure.message}
        </p>
      )}
      {!scan.isPending && suggestions.length > 0 && (
        <ul className="recurring-discovery-results">
          <AnimatePresence>
            {suggestions.map((s, i) => (
              <motion.li
                key={s.id}
                layout
                {...popIn(staggerDelay(i))}
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
              >
                <div className="recurring-suggestion-details">
                  <div className="recurring-suggestion-title">
                    <strong>{s.input.item}</strong>
                    <span className="recurring-suggestion-kind">
                      {s.kind === "subscription"
                        ? "Likely subscription"
                        : "Recurring payment"}
                    </span>
                  </div>
                  <p className="recurring-suggestion-evidence">
                    <span>{s.occurrences} payments found</span>
                    <span>{s.dates.map(formatDateShort).join(" · ")}</span>
                  </p>
                </div>
                <div className="recurring-suggestion-amount">
                  <strong>
                    {formatCurrency(Number(s.input.amount_inr), hideAmounts)}
                  </strong>
                  <span>
                    {s.input.frequency}
                    {s.variableAmount ? " · latest amount" : ""}
                  </span>
                </div>
                {s.variableAmount && (
                  <p className="account-row-meta recurring-suggestion-note">
                    Amounts vary. Review the latest amount before setting up
                    automatic logging.
                  </p>
                )}
                <div className="recurring-discovery-actions">
                  <button
                    type="button"
                    className="account-compact-btn"
                    disabled={busy}
                    onClick={() => setReviewing(s)}
                  >
                    Review and add
                  </button>
                  <button
                    type="button"
                    className="scan-link-btn"
                    disabled={busy}
                    onClick={() => dismiss.mutate(s.id)}
                  >
                    Dismiss
                  </button>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      {reviewing && reviewing.kind === "other_recurring" && (
        <RecurringExpenseModal
          key={reviewing.id}
          initialValues={reviewing.input}
          suggestionId={reviewing.id}
          onClose={() => setReviewing(null)}
          onAdded={() => {
            setAccepted((old) => [...old, reviewing.id]);
            void qc.invalidateQueries({ queryKey: baseKey });
          }}
        />
      )}
      {reviewing && reviewing.kind === "subscription" && (
        <SubscriptionModal
          key={reviewing.id}
          initialValues={{
            service: reviewing.input.item,
            amount_inr: reviewing.input.amount_inr,
            billing_cycle: reviewing.input.frequency,
            next_due_date: reviewing.input.start_date,
            notes: reviewing.input.notes ?? "",
            category: reviewing.input.category,
          }}
          suggestionId={reviewing.id}
          onClose={() => setReviewing(null)}
          onSaved={() => {
            setAccepted((old) => [...old, reviewing.id]);
            void qc.invalidateQueries({ queryKey: baseKey });
          }}
        />
      )}
    </section>
  );
}
