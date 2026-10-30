"use client";

import { useMemo, useState, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ReceiptIcon, BellIcon, ArrowsInLineVerticalIcon, SquaresFourIcon, MoonIcon, PencilSimpleIcon, PlusIcon, SunIcon, TrashIcon, XIcon } from "@/src/components/icons";
import { draftOf, goalOf, GoalFields, type GoalDraft } from "../components/GoalSheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CategoryIcon } from "../components/CategoryIcon";
import { CategoryIconPicker, ColorSwatches } from "../components/CategoryIconPicker";
import { Pop } from "../components/Pop";
import { categoryIconKey, groupIconKey, type CategoryIconKey } from "../lib/categoryIcons";
import { useAppearance } from "../../components/AppearanceProvider";
import { ExpenseSidebar } from "../components/ExpenseSidebar";
import { EnvelopesSkeleton } from "../components/TabSkeleton";
import { EnvelopeTabbar } from "../components/EnvelopeTabbar";
import { ENVELOPE_SPRING, SpringChevron, SpringCollapse } from "../components/SpringCollapse";
import { AlertThresholdPicker } from "../components/AlertThresholdPicker";
import { AddCategoryModal } from "../components/AddCategoryModal";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Scrim, Sheet } from "../components/MotionSheet";
import {
  useCategories,
  useUpdateCategory,
  useDeleteCategory,
  useMoveCategory,
} from "../hooks/useCategories";
import {
  useGroups,
  useAddGroup,
  useUpdateGroup,
  useGroupIcons,
  useGroupColors,
  useDeleteGroup,
  useMoveGroup,
} from "../hooks/useGroups";
import { useCollapsedGroups } from "../hooks/useCollapsedGroups";
import {
  groupCategories,
  orphanedBy,
  groupDeleteBody,
  OTHER_LABEL,
} from "../lib/envelopeGroups";
import { splitEmoji, avatarStyleFor, categoryColor, colorStyle, groupColor } from "../lib/emoji";
import { isCategoryColor, type CategoryColor } from "../lib/categoryColors";
import { DEFAULT_ALERT_PCTS } from "../lib/alerts";
import { EMPTY } from "../lib/constants";
import type { CategoryGoal, CategoryRow } from "../types";
import { BirdEmptyState } from "../components/BirdEmptyState";
import { DragItem, DragList, useDragOrder } from "../components/DragReorder";
import { CategoryGrip, CategoryGripShape, slotKey, useCategoryDrag, type CategoryDrag } from "../components/CategoryDrag";
import { useReadOnlyError } from "../components/BudgetNotices";
import { useSpaces } from "../hooks/useSpaces";

/** A pending rename or creation, in whichever place the row sits. */
type Draft =
  | { kind: "new-group" }
  | { kind: "rename-category"; name: string; group: string; icon?: string; color?: string; goal?: CategoryGoal }
  | { kind: "rename-group"; name: string; icon?: string; color?: string };

/** The edit sheet's starting point for a category row. */
const editDraft = (c: CategoryRow, group: string): Draft => ({
  kind: "rename-category", name: c.name, group, icon: c.icon, color: c.color, goal: c.goal,
});

type DeleteTarget =
  { kind: "category"; name: string } | { kind: "group"; name: string };

function sorted(pcts: number[]): number[] {
  return [...pcts].sort((a, b) => a - b);
}

function sameThresholds(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * One group's categories. While any category is dragged, every boundary between rows can hold the
 * gap, each with its own presence so a gap shrinks in place as the next one opens.
 */
function CategoryList({
  group,
  items,
  drag,
  onNudge,
  renderRow,
}: {
  group: string;
  items: CategoryRow[];
  drag: CategoryDrag;
  onNudge: (name: string, by: number) => void;
  renderRow: (category: CategoryRow, grip: ReactNode) => ReactNode;
}) {
  const reduce = useReducedMotion();
  const active = drag.active;
  const rows = active ? items.filter((c) => c.name !== active.name) : items;
  const gapAt = active?.gap?.group === group ? active.gap.index : -1;
  const gapTransition = reduce ? { duration: 0 } : ENVELOPE_SPRING;
  const boundary = (index: number, key: string) =>
    active && (
      <AnimatePresence key={`gap:${key}`} initial={false}>
        {gapAt === index && (
          <motion.li
            className="env-cat-gap"
            data-cat-slot={slotKey({ group, index })}
            initial={active.moved ? { height: 0, opacity: 0 } : false}
            animate={{ height: active.rect.height, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={gapTransition}
          />
        )}
      </AnimatePresence>
    );
  const dragged = active?.from.group === group ? items.find((c) => c.name === active.name) : undefined;
  return (
    <ul className="env-cat-list">
      {rows.flatMap((category, index) => [
        boundary(index, category.name),
        <li key={category.name} className="env-cat" data-cat>
          {renderRow(
            category,
            <CategoryGrip
              name={category.name}
              group={group}
              index={index}
              label={splitEmoji(category.name).text}
              drag={drag}
              onNudge={onNudge}
            />,
          )}
        </li>,
      ])}
      {boundary(rows.length, "end")}
      <AnimatePresence initial={false}>
        {rows.length === 0 && gapAt === -1 && (
          <motion.li
            className="env-cat-empty"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={gapTransition}
          >
            <div className="env-cat env-cat--empty">Nothing in here yet.</div>
          </motion.li>
        )}
      </AnimatePresence>
      {active && dragged &&
        createPortal(
          <motion.div
            className={`env-cat env-cat-ghost${active.landing ? " is-landing" : ""}`}
            aria-hidden="true"
            style={{ x: drag.x, y: drag.y, width: active.rect.width, height: active.rect.height }}
          >
            {renderRow(dragged, <CategoryGripShape />)}
          </motion.div>,
          active.host,
        )}
    </ul>
  );
}

export function EnvelopesPage() {
  const { theme, setTheme } = useAppearance();

  const categoriesQuery = useCategories();
  const groupsQuery = useGroups();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();
  const addGroup = useAddGroup();
  const updateGroup = useUpdateGroup();
  const groupIcons = useGroupIcons();
  const groupColors = useGroupColors();
  const deleteGroup = useDeleteGroup();
  const moveCategory = useMoveCategory();
  const moveGroup = useMoveGroup();

  const categories: CategoryRow[] = categoriesQuery.data ?? EMPTY;
  const groups: string[] = groupsQuery.data ?? EMPTY;

  const [collapsed, setCollapsed] = useCollapsedGroups("envelopes");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftText, setDraftText] = useState("");
  // Null on a new group until picked: its icon follows the name.
  const [draftIcon, setDraftIcon] = useState<CategoryIconKey | null>(null);
  // Null until the user picks one (or the row already has one): until then
  // the colour follows the name, as everywhere else.
  const [pickedColor, setPickedColor] = useState<CategoryColor | null>(null);
  // A category's goal as typed; null is "no goal" (and clears one on save).
  const [goalDraft, setGoalDraft] = useState<GoalDraft | null>(null);
  const [addCategoryGroup, setAddCategoryGroup] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [draftPcts, setDraftPcts] = useState<number[]>(DEFAULT_ALERT_PCTS);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const readOnlyError = useReadOnlyError();
  // A lapsed shared budget: the list stays, every write control goes.
  const { readOnly } = useSpaces();

  const grouped = useMemo(
    () => groupCategories(categories, groups),
    [categories, groups],
  );
  const groupDrag = useDragOrder(groups, (name, toIndex) =>
    moveGroup.mutate(
      { name, toIndex },
      { onError: (e) => setError(readOnlyError(e) ?? "That didn't save. Try again.") },
    ),
  );
  const moveCategoryTo = (name: string, toIndex: number, group?: string) =>
    moveCategory.mutate(
      { name, toIndex, group },
      { onError: (e) => setError(readOnlyError(e) ?? "That didn't save. Try again.") },
    );
  const categoryDrag = useCategoryDrag(categories, (name, slot) => {
    const current = categories.find((c) => c.name === name);
    moveCategoryTo(name, slot.index, (current?.group || "") === slot.group ? undefined : slot.group);
  });
  // Named groups follow the drag's live order; ungrouped "Other" stays pinned last.
  const byGroupName = new Map(grouped.map((g) => [g.name, g]));
  const ungrouped = byGroupName.get("");
  const orderedGroups = [
    ...groupDrag.order.flatMap((name) => byGroupName.get(name) ?? []),
    ...(ungrouped ? [ungrouped] : []),
  ];
  /** Keyboard move: one slot within the group, past its edge into the next group over. */
  function nudgeCategory(name: string, by: number) {
    const at = orderedGroups.findIndex((g) => g.items.some((c) => c.name === name));
    if (at === -1) return;
    const to = orderedGroups[at].items.findIndex((c) => c.name === name) + by;
    if (to >= 0 && to < orderedGroups[at].items.length) return moveCategoryTo(name, to);
    const next = orderedGroups[at + by];
    if (!next) return;
    setCollapsed((prev) => {
      const open = new Set(prev);
      open.delete(next.label);
      return open;
    });
    categoryDrag.focusAfterMove(name, next.name);
    moveCategoryTo(name, by < 0 ? next.items.length : 0, next.name);
  }
  const allKeys = useMemo(() => grouped.map((g) => g.label), [grouped]);
  const allCollapsed =
    allKeys.length > 0 && allKeys.every((k) => collapsed.has(k));

  function toggleGroup(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function beginDraft(
    next: Draft | { kind: "new-category"; group: string },
    initial = "",
  ) {
    setError(null);
    if (next.kind === "new-category") {
      setAddCategoryGroup(next.group);
      return;
    }
    setDraft(next);
    // Renames edit the words only. A legacy name's leading emoji stays on the
    // stored name (Mobile still reads it) and commitDraft puts it back.
    setDraftText(next.kind === "new-group" ? initial : splitEmoji(initial).text);
    if (next.kind === "rename-category") {
      setDraftIcon(categoryIconKey(next.name, next.icon, next.group));
      setGoalDraft(next.goal ? draftOf(next.goal) : null);
    }
    if (next.kind === "rename-group")
      setDraftIcon(groupIconKey(next.name, next.icon));
    if (next.kind === "new-group") {
      setDraftIcon(null);
      setPickedColor(null);
    } else setPickedColor(isCategoryColor(next.color) ? next.color : null);
  }

  /** The stored name for draft text: the old name's emoji, if any, then the words. */
  function withOldEmoji(oldName: string, text: string) {
    const { icon } = splitEmoji(oldName);
    return icon ? `${icon} ${text}` : text;
  }

  async function run(action: () => Promise<unknown>, whenBusy: string) {
    setError(null);
    try {
      await action();
      return true;
    } catch (e) {
      // Never the raw server text: match a case we have written, else a
      // generic line the reader can act on.
      const message = e instanceof Error ? e.message : "";
      setError(
        readOnlyError(e) ??
          (/already exists/i.test(message)
            ? `That ${whenBusy} already exists.`
            : "That didn't save. Try again."),
      );
      return false;
    }
  }

  async function commitDraft() {
    const name = draftText.trim();
    if (!draft || !name) return setDraft(null);
    setSubmitting(true);
    let ok = false;
    if (draft.kind === "new-group")
      ok = await run(
        () =>
          addGroup.mutateAsync({
            name,
            ...(draftIcon ? { icon: draftIcon } : {}),
            ...(pickedColor ? { color: pickedColor } : {}),
          }),
        "group",
      );
    else if (draft.kind === "rename-group") {
      const newName = withOldEmoji(draft.name, name);
      const icon = draftIcon ?? groupIconKey(draft.name, draft.icon);
      const iconChanged = icon !== groupIconKey(draft.name, draft.icon);
      const colorChanged = pickedColor !== null && pickedColor !== draft.color;
      ok =
        (newName === draft.name && !iconChanged && !colorChanged) ||
        (await run(
          () =>
            updateGroup.mutateAsync({
              name: draft.name,
              ...(newName !== draft.name ? { newName } : {}),
              ...(iconChanged ? { icon } : {}),
              ...(colorChanged ? { color: pickedColor } : {}),
            }),
          "group",
        ));
    }
    else {
      const newName = withOldEmoji(draft.name, name);
      const icon = draftIcon ?? categoryIconKey(draft.name, draft.icon, draft.group);
      const iconChanged = icon !== categoryIconKey(draft.name, draft.icon, draft.group);
      const colorChanged = pickedColor !== null && pickedColor !== draft.color;
      const goal = goalDraft ? goalOf(goalDraft) : null;
      const goalChanged = JSON.stringify(goal) !== JSON.stringify(draft.goal ?? null);
      ok =
        (newName === draft.name && !iconChanged && !colorChanged && !goalChanged) ||
        (await run(
          () =>
            updateCategory.mutateAsync({
              name: draft.name,
              updates: {
                ...(newName !== draft.name ? { newName } : {}),
                ...(iconChanged ? { icon } : {}),
                ...(colorChanged ? { color: pickedColor } : {}),
                ...(goalChanged ? { goal } : {}),
              },
            }),
          "category",
        ));
    }
    setSubmitting(false);
    if (ok) setDraft(null);
  }

  async function saveThresholds() {
    if (!editing) return;
    const current = editing.alertPcts
      ? sorted(editing.alertPcts)
      : DEFAULT_ALERT_PCTS;
    const next = sorted(draftPcts);
    if (sameThresholds(current, next)) return setEditing(null);
    // null restores the server-side default set rather than pinning a copy of
    // it, so a later change to the defaults still reaches this category.
    const alertPcts = sameThresholds(next, DEFAULT_ALERT_PCTS) ? null : next;
    const ok = await run(
      () =>
        updateCategory.mutateAsync({
          name: editing.name,
          updates: { alertPcts },
        }),
      "category",
    );
    if (ok) setEditing(null);
  }

  /** Server sends the group's categories to Archive along with it. */
  async function removeGroup(name: string) {
    await run(() => deleteGroup.mutateAsync(name), "group");
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    if (target.kind === "category")
      await run(() => deleteCategory.mutateAsync(target.name), "category");
    else await removeGroup(target.name);
  }

  const loading = categoriesQuery.isLoading || groupsQuery.isLoading;
  // The same colour the row wears on the list, so the sheet's tile matches it.
  const draftColor: CategoryColor =
    draft?.kind === "rename-category"
      ? categoryColor(draftText.trim(), pickedColor ?? undefined)
      : groupColor(pickedColor ?? undefined);
  const draftTint = colorStyle(draftColor);
  const shownIcon: CategoryIconKey = draftIcon ?? groupIconKey(draftText.trim());

  const nameInput = (
    <input
      id="env-sheet-name"
      className="env-input"
      aria-label={draft?.kind === "new-group" ? undefined : "Name"}
      autoFocus
      placeholder={
        draft?.kind === "rename-category"
          ? "Groceries, fuel, gym…"
          : "Transport, Health…"
      }
      value={draftText}
      onChange={(e) => setDraftText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") void commitDraft();
        if (e.key === "Escape") setDraft(null);
      }}
    />
  );

  return (
    <section className="expense-redesign">
      <button
        type="button"
        className="erd-theme-toggle"
        onClick={() => setTheme(theme === "light" ? "dark" : "light")}
        aria-label="Toggle theme"
      >
        {theme === "dark" ? <SunIcon aria-hidden /> : <MoonIcon aria-hidden />}
      </button>

      <header className="erd-mobile-header">
        <div className="erd-mobile-greet">
          Categories <SquaresFourIcon aria-hidden />
        </div>
        <div className="erd-mobile-sub">
          <span>Every category, and the group it lives in</span>
        </div>
      </header>

      <div className="erd-main">
        <ExpenseSidebar />
        <div className="erd-content env-page">
          <header className="txn-page-header env-page-header">
            <div className="txn-page-heading">
              <span className="txn-page-eyebrow">Your spending, organized</span>
              <h1>Categories</h1>
              <p>
                A place for all your money. A heads-up before you overspend.
              </p>
            </div>
            {!readOnly && (
              <div className="txn-page-actions">
                <button
                  type="button"
                  className="erd-log-btn txn-page-log-btn"
                  onClick={() => beginDraft({ kind: "new-group" })}
                >
                  <PlusIcon size={14} aria-hidden="true" />
                  New group
                </button>
              </div>
            )}
          </header>

          <div className="env-page-toolbar">
            <p className="env-page-summary">
              <strong>{categories.length}</strong>{" "}
              {categories.length === 1 ? "category" : "categories"}
              <span aria-hidden="true"> / </span>
              <strong>{groups.length}</strong>{" "}
              {groups.length === 1 ? "group" : "groups"}
            </p>
            <button
              type="button"
              className="erd-manage-btn env-collapse-btn"
              onClick={() =>
                setCollapsed(
                  allCollapsed ? new Set<string>() : new Set(allKeys),
                )
              }
            >
              <ArrowsInLineVerticalIcon size={14} aria-hidden="true" />
              {allCollapsed ? "Expand all" : "Collapse all"}
            </button>
          </div>

          {error && (
            <div className="erd-action-error" role="alert">
              {error}
            </div>
          )}

          {loading && <EnvelopesSkeleton />}

          {!loading && grouped.length === 0 && (
            <BirdEmptyState
              subject="envelopes"
              title="Your categories are waiting"
              description="Make a group, add a category, and give all your money a place to land."
              action={readOnly ? undefined : {
                label: "Create your first group",
                onClick: () => beginDraft({ kind: "new-group" }),
              }}
            />
          )}

          <DragList
            drag={groupDrag}
            className="env-group-list"
            label="Category groups"
          >
            {orderedGroups.map((group) => {
              // Like Mobile, every group folds to its header while one is dragged, so each
              // slot is one header tall. The bodies unmount outright rather than spring shut:
              // Reorder measures rows on render, and a body still animating out keeps the old,
              // tall positions, so the drag never finds a swap.
              const dragging = groupDrag.active !== null;
              const isCollapsed = dragging || collapsed.has(group.label);
              const catMove = categoryDrag.active;
              const isDropTarget = catMove !== null && catMove.to.group === group.name && catMove.from.group !== group.name;
              // Counts the dragged row wherever it would land, not where it came from.
              const count = catMove
                ? group.items.filter((c) => c.name !== catMove.name).length + (catMove.to.group === group.name ? 1 : 0)
                : group.items.length;
              const groupClass = isDropTarget ? "env-group is-drop-target" : "env-group";
              const text = group.name
                ? splitEmoji(group.name).text
                : OTHER_LABEL;
              const body = (grip: ReactNode) => (
                <>
                  <div
                    className="env-group-head"
                    data-cat-group={group.name}
                    data-cat-count={group.items.length}
                  >
                    {!readOnly && grip}
                    <button
                      type="button"
                      className="env-group-toggle"
                      onClick={() => toggleGroup(group.label)}
                      aria-expanded={!isCollapsed}
                    >
                      <SpringChevron
                        open={!isCollapsed}
                        size={14}
                        className="env-group-chevron"
                      />
                      <Pop
                        value={`${groupColors.get(group.name)}|${groupIcons.get(group.name)}`}
                        className="env-group-icon"
                        style={colorStyle(groupColor(groupColors.get(group.name)))}
                        aria-hidden="true"
                      >
                        <CategoryIcon kind="group" name={group.name} icon={groupIcons.get(group.name)} />
                      </Pop>
                      <span className="env-group-name">{text}</span>
                      <span className="env-group-count">{count}</span>
                    </button>
                    {!readOnly && <div className="env-group-actions">
                      <IconTip label="Add category">
                        <button
                          type="button"
                          className="env-icon-btn"
                          onClick={() =>
                            beginDraft({
                              kind: "new-category",
                              group: group.name,
                            })
                          }
                          aria-label={`Add a category to ${text}`}
                        >
                          <PlusIcon size={14} aria-hidden="true" />
                        </button>
                      </IconTip>
                      {group.name && (
                        <IconTip label="Edit group">
                          <button
                            type="button"
                            className="env-icon-btn"
                            onClick={() =>
                              beginDraft(
                                {
                                  kind: "rename-group",
                                  name: group.name,
                                  icon: groupIcons.get(group.name),
                                  color: groupColors.get(group.name),
                                },
                                group.name,
                              )
                            }
                            aria-label={`Edit ${text}`}
                          >
                            <PencilSimpleIcon size={14} aria-hidden="true" />
                          </button>
                        </IconTip>
                      )}
                      {group.name && (
                        <IconTip label="Delete group">
                          <button
                            type="button"
                            className="env-icon-btn env-icon-btn--danger"
                            onClick={() =>
                              setDeleteTarget({
                                kind: "group",
                                name: group.name,
                              })
                            }
                            aria-label={`Delete ${text}`}
                          >
                            <TrashIcon size={14} aria-hidden="true" />
                          </button>
                        </IconTip>
                      )}
                    </div>}
                  </div>

                  {!dragging && (
                    <SpringCollapse open={!isCollapsed}>
                      <CategoryList
                        group={group.name}
                        items={group.items}
                        drag={categoryDrag}
                        onNudge={nudgeCategory}
                        renderRow={(category, catGrip) => {
                          const parts = splitEmoji(category.name);
                          const thresholds = category.alertPcts
                            ? sorted(category.alertPcts)
                            : DEFAULT_ALERT_PCTS;
                          return (
                            <>
                              {!readOnly && catGrip}
                              <Pop
                                value={`${category.color}|${category.icon}`}
                                className="env-cat-icon"
                                style={avatarStyleFor(parts.text, category.color)}
                                aria-hidden="true"
                              >
                                <CategoryIcon
                                  name={category.name}
                                  icon={category.icon}
                                  group={group.name}
                                />
                              </Pop>
                              <span className="env-cat-name">{parts.text}</span>
                              {/* Goals get no threshold alerts (lib/notifications/rules.ts): spending their money is the plan. */}
                              {category.goal ? (
                                <span className="env-cat-alerts">
                                  <BellIcon size={14} aria-hidden="true" />
                                  <span className="env-alert-copy">
                                    <span className="env-alert-label">Spending alerts</span>
                                    <span className="env-alert-values">Off for goals</span>
                                  </span>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  className="env-cat-alerts"
                                  disabled={readOnly}
                                  onClick={() => {
                                    setEditing(category);
                                    setDraftPcts(thresholds);
                                  }}
                                  title="Get notified when spending in this category reaches these points"
                                  aria-label={`Spending alerts for ${parts.text}: ${thresholds.map((p) => `${p}%`).join(", ")}`}
                                >
                                  <BellIcon size={14} aria-hidden="true" />
                                  <span className="env-alert-copy">
                                    <span className="env-alert-label">
                                      Spending alerts
                                    </span>
                                    <span className="env-alert-values">
                                      {thresholds.map((p) => `${p}%`).join(" · ")}
                                    </span>
                                  </span>
                                </button>
                              )}
                              <div className="env-cat-actions">
                                <IconTip label="View transactions">
                                  <Link
                                    className="env-icon-btn"
                                    href={`/expense/transactions?category=${encodeURIComponent(category.name)}`}
                                    aria-label={`View transactions for ${parts.text}`}
                                  >
                                    <ReceiptIcon size={14} aria-hidden="true" />
                                  </Link>
                                </IconTip>
                                {!readOnly && <>
                                <IconTip label="Edit category">
                                  <button
                                    type="button"
                                    className="env-icon-btn"
                                    onClick={() => beginDraft(editDraft(category, group.name), category.name)}
                                    aria-label={`Edit ${parts.text}`}
                                  >
                                    <PencilSimpleIcon size={14} aria-hidden="true" />
                                  </button>
                                </IconTip>
                                <IconTip label="Delete category">
                                  <button
                                    type="button"
                                    className="env-icon-btn env-icon-btn--danger"
                                    onClick={() =>
                                      setDeleteTarget({
                                        kind: "category",
                                        name: category.name,
                                      })
                                    }
                                    aria-label={`Delete ${parts.text}`}
                                  >
                                    <TrashIcon size={14} aria-hidden="true" />
                                  </button>
                                </IconTip>
                                </>}
                              </div>
                            </>
                          );
                        }}
                      />
                    </SpringCollapse>
                  )}
                </>
              );
              // Ungrouped "Other" isn't a stored group, so it has no slot to move to.
              return group.name ? (
                <DragItem
                  key={group.label}
                  value={group.name}
                  drag={groupDrag}
                  label={text}
                  className={groupClass}
                >
                  {body}
                </DragItem>
              ) : (
                <motion.li
                  key={group.label}
                  layout="position"
                  className={groupClass}
                >
                  {body(null)}
                </motion.li>
              );
            })}
          </DragList>
        </div>
      </div>

      <AnimatePresence>
        {addCategoryGroup !== null && (
          <AddCategoryModal
            key="add-category"
            initialGroup={addCategoryGroup}
            onClose={() => setAddCategoryGroup(null)}
            onCreated={() => setAddCategoryGroup(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {draft && (
          <Scrim
            key="scrim"
            className="erd-modal-overlay"
            onClick={() => setDraft(null)}
          >
            <Sheet
              className={`erd-modal-card env-sheet${draft.kind.startsWith("rename-") ? " env-sheet--rename" : ""}`}
              role="dialog"
              aria-modal="true"
              aria-label={
                draft.kind === "rename-category"
                  ? "Edit category"
                  : draft.kind === "new-group"
                    ? "Add group"
                    : "Edit group"
              }
              onClick={(e) => e.stopPropagation()}
            >
              {draft.kind.startsWith("rename-") ? (
                <div className="env-sheet-rename-head">
                  <CategoryIconPicker
                    className="env-sheet-rename-icon"
                    value={shownIcon}
                    onChange={setDraftIcon}
                    tint={draftTint}
                    disabled={submitting}
                  />
                  <div className="env-sheet-rename-heading">
                    <span className="env-sheet-eyebrow">
                      {draft.kind === "rename-category" ? "CATEGORY" : "GROUP"}
                    </span>
                    <h2 className="env-sheet-title">
                      {draft.kind === "rename-category"
                        ? "Edit category"
                        : "Edit group"}
                    </h2>
                  </div>
                  <button
                    type="button"
                    className="env-sheet-close"
                    onClick={() => setDraft(null)}
                    aria-label="Close dialog"
                  >
                    <XIcon size={18} aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="env-sheet-title">Add group</div>
                  <p className="env-sheet-copy">
                    Groups gather related categories: Food, Home, Transport.
                  </p>
                </>
              )}

              {draft.kind === "new-group" && (
                <label
                  className="env-sheet-section-label"
                  htmlFor="env-sheet-name"
                >
                  Name
                </label>
              )}
              {draft.kind === "new-group" ? (
                <CategoryIconPicker
                  value={shownIcon}
                  onChange={setDraftIcon}
                  tint={draftTint}
                  disabled={submitting}
                >
                  {nameInput}
                </CategoryIconPicker>
              ) : (
                <div className="env-sheet-name-row">{nameInput}</div>
              )}
              <ColorSwatches value={draftColor} onChange={setPickedColor} disabled={submitting} />

              {draft.kind === "rename-category" && (
                <div className="env-sheet-goal">
                  <p className="env-sheet-section-label">Saving for something?</p>
                  <div className="env-pct-row">
                    <button type="button" className={`env-pct${goalDraft ? "" : " is-on"}`} aria-pressed={!goalDraft}
                      disabled={submitting} onClick={() => setGoalDraft(null)}>No goal</button>
                    <button type="button" className={`env-pct${goalDraft ? " is-on" : ""}`} aria-pressed={!!goalDraft}
                      disabled={submitting} onClick={() => setGoalDraft((d) => d ?? draftOf(draft.goal))}>Goal</button>
                  </div>
                  {goalDraft && <GoalFields compact draft={goalDraft} onChange={setGoalDraft} />}
                </div>
              )}

              {error && (
                <p className="env-sheet-hint" role="alert">
                  {error}
                </p>
              )}

              <div className="env-sheet-actions">
                <button
                  type="button"
                  className={
                    draft.kind.startsWith("rename-")
                      ? "env-sheet-action env-sheet-action--cancel"
                      : "auth-btn auth-btn--outline"
                  }
                  onClick={() => setDraft(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={
                    draft.kind.startsWith("rename-")
                      ? "env-sheet-action env-sheet-action--save"
                      : "auth-btn auth-btn--primary"
                  }
                  onClick={() => void commitDraft()}
                  disabled={submitting || !draftText.trim() || (!!goalDraft && !goalOf(goalDraft))}
                >
                  {submitting
                    ? "Saving…"
                    : draft.kind === "new-group"
                      ? "Create group"
                      : "Save"}
                </button>
              </div>
            </Sheet>
          </Scrim>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editing && (
          <AlertThresholdPicker
            key="alerts"
            categoryName={splitEmoji(editing.name).text}
            value={draftPcts}
            onChange={setDraftPcts}
            onClose={() => setEditing(null)}
            onSave={() => void saveThresholds()}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteTarget && (
          <ConfirmDialog
            key="delete"
            title={`Delete ${splitEmoji(deleteTarget.name).text}?`}
            body={
              deleteTarget.kind === "group"
                ? groupDeleteBody(orphanedBy(categories, deleteTarget.name).length)
                : "It will move to Archive. You can restore it for 7 days."
            }
            cancelLabel="Cancel"
            onCancel={() => setDeleteTarget(null)}
          >
            <button
              type="button"
              className="account-danger-btn"
             
              onClick={() => void confirmDelete()}
            >
              Delete
            </button>
          </ConfirmDialog>
        )}
      </AnimatePresence>

      <EnvelopeTabbar />
    </section>
  );
}

function IconTip({ label, children }: { label: string; children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
