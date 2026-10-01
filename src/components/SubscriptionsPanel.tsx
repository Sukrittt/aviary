"use client";

import { useCurrency } from "@/src/context/CurrencyContext";
import { useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { getEffectiveDueDate } from "@/lib/subscriptions";
import { AllocationBar, type AllocationSegment } from "./charts/AllocationBar";
import { CHART_COLORS } from "../theme/chartColors";
import { formatDateShort } from "../lib/format";
import { LoadingCaption } from "./LoadingCaption";
import { BirdEmptyState } from "./BirdEmptyState";

export interface SubscriptionPanelItem {
  timestamp: string;
  service: string;
  amountInr: number;
  billingCycle: string;
  nextDueDate: string;
  status: string;
  renewalOrEndMonth?: string;
  notes: string;
  category: string;
}

interface Props {
  active: SubscriptionPanelItem[];
  cancelled: SubscriptionPanelItem[];
  hideAmounts: boolean;
  busyService: string | null;
  onAdd: () => void;
  onEdit: (sub: SubscriptionPanelItem) => void;
  onCancel: (service: string) => void;
  onReactivate: (service: string) => void;
  loading?: boolean;
  error?: boolean;
  homeRail?: boolean;
}

// Twin of Mobile's SubscriptionsPanel BRAND_COLORS, so a service gets the same color on both apps.
const BRAND_COLORS: Record<string, string> = {
  netflix: "#E50914",
  hotstar: "#0C3B7C",
  "disney+": "#0C3B7C",
  prime: "#00A8E1",
  "amazon prime": "#00A8E1",
  spotify: "#1DB954",
  apple: "#A2AAAD",
  "apple music": "#FA2D48",
  "apple tv": "#A2AAAD",
  youtube: "#FF0000",
  "youtube premium": "#FF0000",
  google: "#4285F4",
  "google one": "#4285F4",
  microsoft: "#00A4EF",
  office: "#D83B01",
  "microsoft 365": "#D83B01",
  notion: "#FFFFFF",
  slack: "#4A154B",
  discord: "#5865F2",
  figma: "#A259FF",
  canva: "#00C4CC",
  adobe: "#FF0000",
  dropbox: "#0061FF",
  twitch: "#9146FF",
  hulu: "#1CE783",
  "hbo max": "#B537F2",
  max: "#002BE7",
  jio: "#0A2F8F",
  jiocinema: "#0A2F8F",
  airtel: "#ED1C24",
  zee5: "#8B2FC9",
  sonyliv: "#0066CC",
  voot: "#E4002B",
  github: "#6e40c9",
  chatgpt: "#10A37F",
  openai: "#10A37F",
  mastercard: "#EB001B",
  visa: "#1A1F71",
};

function colorFor(service: string, i: number): string {
  const lower = service.toLowerCase();
  for (const [key, color] of Object.entries(BRAND_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return CHART_COLORS[i % CHART_COLORS.length];
}

function monthlyEq(sub: SubscriptionPanelItem): number {
  if (/one-time/i.test(sub.billingCycle)) return 0;
  if (/yearly|annual/i.test(sub.billingCycle)) return sub.amountInr / 12;
  if (/quarterly/i.test(sub.billingCycle)) return sub.amountInr / 3;
  if (/weekly/i.test(sub.billingCycle)) return sub.amountInr * 4.33;
  return sub.amountInr;
}

function cleanCycle(cycle: string): string {
  if (/one-time/i.test(cycle)) return "one-time";
  if (/monthly/i.test(cycle)) return "monthly";
  if (/yearly|annual/i.test(cycle)) return "yearly";
  if (/quarterly/i.test(cycle)) return "quarterly";
  if (/weekly/i.test(cycle)) return "weekly";
  return cycle;
}

const SUFFIX: Record<string, string> = {
  yearly: "/yr",
  quarterly: "/qtr",
  weekly: "/wk",
};

function daysTo(date: string): number {
  return Math.round(
    (new Date(date).getTime() -
      new Date(new Date().toISOString().slice(0, 10)).getTime()) /
      86400000,
  );
}

function chargeLabel(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days}d`;
}

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export function SubscriptionsPanel({
  active,
  cancelled,
  hideAmounts,
  busyService,
  onAdd,
  onEdit,
  onCancel,
  onReactivate,
  loading = false,
  error = false,
  homeRail = false,
}: Props) {
  const { formatCurrency } = useCurrency();
  const [showCancelled, setShowCancelled] = useState(false);
  const money = (v: number) =>
    hideAmounts ? "---" : formatCurrency(Math.round(v));

  const sorted = [...active].sort((a, b) => monthlyEq(b) - monthlyEq(a));
  const totalRaw = sorted.reduce((s, sub) => s + monthlyEq(sub), 0);
  const totalMonthly = Math.round(totalRaw);

  let next: { service: string; days: number } | null = null;
  for (const sub of sorted) {
    const due = getEffectiveDueDate(sub);
    if (!due) continue;
    const days = daysTo(due);
    if (days >= 0 && (!next || days < next.days))
      next = { service: sub.service, days };
  }

  const segments: AllocationSegment[] = sorted.map((sub, i) => ({
    label: sub.service,
    value: monthlyEq(sub),
    color: colorFor(sub.service, i),
  }));

  function row(sub: SubscriptionPanelItem, i: number, isActive: boolean) {
    const cycle = cleanCycle(sub.billingCycle);
    const due = isActive ? getEffectiveDueDate(sub) : "";
    const meta = capitalize(
      isActive
        ? [cycle, due ? `Next ${formatDateShort(due)}` : ""]
            .filter(Boolean)
            .join(" · ")
        : sub.renewalOrEndMonth || "n/a",
    );
    // Non-monthly subs lead with the per-month figure that sums into the total; as-billed amount goes secondary.
    const showMonthly = isActive && cycle in SUFFIX;
    const secondary = [
      showMonthly ? `${money(sub.amountInr)}${SUFFIX[cycle]}` : "",
      isActive && totalRaw > 0
        ? `${((monthlyEq(sub) / totalRaw) * 100).toFixed(0)}%`
        : "",
    ]
      .filter(Boolean)
      .join(" · ");
    const color = isActive ? colorFor(sub.service, i) : "var(--erd-text3)";
    const dueSoon = isActive && due !== "" && daysTo(due) <= 3;

    return (
      <li
        key={sub.service}
        className={`subp-row ${isActive ? "" : "is-cancelled"}`}
      >
        <button
          type="button"
          className="subp-row-main"
          onClick={() => onEdit(sub)}
          title="Edit subscription"
        >
          <span
            className="subp-tile"
            style={{
              color,
              background: `color-mix(in oklab, ${color} 22%, transparent)`,
            }}
          >
            {sub.service.charAt(0).toUpperCase()}
          </span>
          <span className="subp-info">
            <strong>{sub.service}</strong>
            <span className={dueSoon ? "is-soon" : ""}>{meta}</span>
          </span>
          <span className="subp-amount">
            <strong>
              {money(showMonthly ? monthlyEq(sub) : sub.amountInr)}
            </strong>
            {secondary && <span>{secondary}</span>}
          </span>
        </button>
        {busyService === sub.service ? (
          <span className="subp-busy">
            {isActive ? "Cancelling…" : "Reactivating…"}
          </span>
        ) : (
          <button
            type="button"
            className="subp-action"
            onClick={() =>
              isActive ? onCancel(sub.service) : onReactivate(sub.service)
            }
          >
            {isActive ? "Cancel" : "Reactivate"}
          </button>
        )}
      </li>
    );
  }

  return (
    <article className="erd-card erd-subs-panel" style={homeRail ? undefined : { maxHeight: 'none' }}>
      {homeRail && (
        <div className="erd-panel-head">
          <h3>Subscriptions</h3>
          <button type="button" className="action-button is-active erd-accent-action subp-add-button" onClick={onAdd} disabled={loading}>
            <Plus size={14} aria-hidden="true" /> Add
          </button>
        </div>
      )}
      {loading ? (
        <LoadingCaption feature="subscriptions" />
      ) : error ? (
        <p className="subp-empty" role="alert">
          Couldn&apos;t load subscriptions.
        </p>
      ) : active.length === 0 && cancelled.length === 0 ? (
        <BirdEmptyState
          compact={homeRail}
          subject="subscriptions"
          title="Keep tabs on your repeats"
          description="Track renewals so bills never surprise you."
          action={{ label: 'Add a subscription', onClick: onAdd }}
        />
      ) : (
        <>
          <div className="subp-eyebrow">RECURRING / MONTH</div>
          <div className="subp-total">{money(totalMonthly)}</div>
          <div className="subp-caption">
            ≈ {money(totalMonthly * 12)}/yr · {active.length} active
            {next ? ` · Next: ${next.service} ${chargeLabel(next.days)}` : ""}
          </div>

          {segments.length >= 3 && (
            <div className="subp-bar">
              <AllocationBar segments={segments} />
            </div>
          )}

          <div className="subp-scroll" style={homeRail ? undefined : { flex: 'none', overflowY: 'visible' }}>
            {sorted.length === 0 ? (
              <p className="subp-empty">No active subscriptions.</p>
            ) : (
              <ul className="subp-list">
                {sorted.map((sub, i) => row(sub, i, true))}
              </ul>
            )}

            {cancelled.length > 0 && (
              <div className="subp-cancelled">
                <button
                  type="button"
                  className={`subp-section-head ${showCancelled ? "is-open" : ""}`}
                  onClick={() => setShowCancelled((v) => !v)}
                  aria-expanded={showCancelled}
                >
                  <motion.span
                    style={{ display: "inline-flex" }}
                    animate={{ rotate: showCancelled ? 90 : 0 }}
                    transition={{ type: "spring", damping: 64, stiffness: 600 }}
                  >
                    <ChevronRight size={14} />
                  </motion.span>
                  CANCELLED ({cancelled.length})
                </button>
                <AnimatePresence initial={false}>
                  {showCancelled && (
                    <motion.ul
                      className="subp-list"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1, transition: { duration: 0.15 } }}
                      exit={{ opacity: 0, transition: { duration: 0.12 } }}
                    >
                      {cancelled.map((sub, i) => row(sub, i, false))}
                    </motion.ul>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </>
      )}
    </article>
  );
}
