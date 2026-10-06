"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import {
  ReceiptText,
  Bell,
  ChevronsDownUp,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useAppearance } from "../../components/AppearanceProvider";
import { ExpenseSidebar } from "../components/ExpenseSidebar";
import { LoadingCaption } from "../components/LoadingCaption";
import { EnvelopeTabbar } from "../components/EnvelopeTabbar";
import { SpringChevron, SpringCollapse } from "../components/SpringCollapse";
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
  useDeleteGroup,
  useMoveGroup,
} from "../hooks/useGroups";
import { useCollapsedGroups } from "../hooks/useCollapsedGroups";
import {
  groupCategories,
  orphanedBy,
  ARCHIVED_GROUP,
  OTHER_LABEL,
} from "../lib/envelopeGroups";
import {
  splitEmoji,
  groupEmoji,
  categoryEmoji,
  avatarColorFor,
} from "../lib/emoji";
import { DEFAULT_ALERT_PCTS } from "../lib/alerts";
import { EMPTY } from "../lib/constants";
import type { CategoryRow } from "../types";
import { BirdEmptyState } from "../components/BirdEmptyState";
import { DragItem, DragList, useDragOrder } from "../components/DragReorder";

/** A pending rename or creation, in whichever place the row sits. */
type Draft =
  | { kind: "new-group" }
  | { kind: "rename-category"; name: string; group: string }
  | { kind: "rename-group"; name: string };

type DeleteTarget =
  { kind: "category"; name: string } | { kind: "group"; name: string };

function sorted(pcts: number[]): number[] {
  return [...pcts].sort((a, b) => a - b);
}

function sameThresholds(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** One group's categories, draggable within the group like Mobile's DraggableCategoryList. */
function CategoryList({
  items,
  onMove,
  renderRow,
}: {
  items: CategoryRow[];
  onMove: (name: string, toIndex: number) => void;
  renderRow: (category: CategoryRow, grip: ReactNode) => ReactNode;
}) {
  const names = useMemo(() => items.map((c) => c.name), [items]);
  const drag = useDragOrder(names, onMove);
  const byName = new Map(items.map((c) => [c.name, c]));
  return (
    <DragList drag={drag} className="env-cat-list">
      {drag.order.map((name) => {
        const category = byName.get(name);
        if (!category) return null;
        return (
          <DragItem
            key={name}
            value={name}
            drag={drag}
            label={splitEmoji(name).text}
            className="env-cat"
          >
            {(grip) => renderRow(category, grip)}
          </DragItem>
        );
      })}
      {items.length === 0 && (
        <li className="env-cat env-cat--empty">Nothing in here yet.</li>
      )}
    </DragList>
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
  const deleteGroup = useDeleteGroup();
  const moveCategory = useMoveCategory();
  const moveGroup = useMoveGroup();

  const categories: CategoryRow[] = categoriesQuery.data ?? EMPTY;
  const groups: string[] = groupsQuery.data ?? EMPTY;

  const [collapsed, setCollapsed] = useCollapsedGroups("envelopes");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftText, setDraftText] = useState("");
  const [addCategoryGroup, setAddCategoryGroup] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [draftPcts, setDraftPcts] = useState<number[]>(DEFAULT_ALERT_PCTS);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [error, setError] = useState<string | null>(null);

  const grouped = useMemo(
    () => groupCategories(categories, groups),
    [categories, groups],
  );
  const groupDrag = useDragOrder(groups, (name, toIndex) =>
    moveGroup.mutate(
      { name, toIndex },
      { onError: () => setError("That didn't save. Try again.") },
    ),
  );
  const moveCategoryTo = (name: string, toIndex: number) =>
    moveCategory.mutate(
      { name, toIndex },
      { onError: () => setError("That didn't save. Try again.") },
    );
  // Named groups follow the drag's live order; ungrouped "Other" stays pinned last.
  const byGroupName = new Map(grouped.map((g) => [g.name, g]));
  const ungrouped = byGroupName.get("");
  const orderedGroups = [
    ...groupDrag.order.flatMap((name) => byGroupName.get(name) ?? []),
    ...(ungrouped ? [ungrouped] : []),
  ];
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
    setDraftText(initial);
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
        /already exists/i.test(message)
          ? `That ${whenBusy} already exists.`
          : "That did not save. Try again.",
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
      ok = await run(() => addGroup.mutateAsync(name), "group");
    else if (draft.kind === "rename-group")
      ok = await run(
        () => updateGroup.mutateAsync({ name: draft.name, newName: name }),
        "group",
      );
    else
      ok = await run(
        () =>
          updateCategory.mutateAsync({
            name: draft.name,
            updates: { newName: name },
          }),
        "category",
      );
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

  /**
   * Deleting a group would strand its categories, so they are re-homed into
   * Archived first — the same order Mobile uses, and the reason Archived can
   * never itself be deleted.
   */
  async function removeGroup(name: string) {
    if (name === ARCHIVED_GROUP) return;
    const orphans = orphanedBy(categories, name);
    await run(async () => {
      if (orphans.length > 0) {
        if (!groups.includes(ARCHIVED_GROUP))
          await addGroup.mutateAsync(ARCHIVED_GROUP);
        await Promise.all(
          orphans.map((c) =>
            updateCategory.mutateAsync({
              name: c.name,
              updates: { group: ARCHIVED_GROUP },
            }),
          ),
        );
      }
      await deleteGroup.mutateAsync(name);
    }, "group");
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

  return (
    <section className="expense-redesign">
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
          Envelopes <span>✉️</span>
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
              <h1>Envelopes</h1>
              <p>
                A place for every category. A heads-up before you overspend.
              </p>
            </div>
            <div className="txn-page-actions">
              <button
                type="button"
                className="erd-log-btn txn-page-log-btn"
                onClick={() => beginDraft({ kind: "new-group" })}
              >
                <Plus size={14} aria-hidden="true" />
                New group
              </button>
            </div>
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
              <ChevronsDownUp size={14} aria-hidden="true" />
              {allCollapsed ? "Expand all" : "Collapse all"}
            </button>
          </div>

          {error && (
            <div className="erd-action-error" role="alert">
              {error}
            </div>
          )}

          {loading && <LoadingCaption placement="page" />}

          {!loading && grouped.length === 0 && (
            <BirdEmptyState
              subject="envelopes"
              title="Your envelopes are waiting"
              description="Make a group, add a category, and give every rupee a place to land."
              action={{
                label: "Create your first group",
                onClick: () => beginDraft({ kind: "new-group" }),
              }}
            />
          )}

          <DragList
            drag={groupDrag}
            className="env-group-list"
            label="Envelope groups"
          >
            {orderedGroups.map((group) => {
              // Like Mobile, every group folds to its header while one is dragged, so each
              // slot is one header tall. The bodies unmount outright rather than spring shut:
              // Reorder measures rows on render, and a body still animating out keeps the old,
              // tall positions, so the drag never finds a swap.
              const dragging = groupDrag.active !== null;
              const isCollapsed = dragging || collapsed.has(group.label);
              const { icon, text } = group.name
                ? splitEmoji(group.name)
                : { icon: "🗂️", text: OTHER_LABEL };
              const body = (grip: ReactNode) => (
                <>
                  <div className="env-group-head">
                    {grip}
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
                      <span className="env-group-icon" aria-hidden="true">
                        {icon}
                      </span>
                      <span className="env-group-name">{text}</span>
                      <span className="env-group-count">
                        {group.items.length}
                      </span>
                    </button>
                    <div className="env-group-actions">
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
                        title="Add category"
                      >
                        <Plus size={14} aria-hidden="true" />
                      </button>
                      {group.name && (
                        <button
                          type="button"
                          className="env-icon-btn"
                          onClick={() =>
                            beginDraft(
                              { kind: "rename-group", name: group.name },
                              group.name,
                            )
                          }
                          aria-label={`Rename ${text}`}
                          title="Rename group"
                        >
                          <Pencil size={14} aria-hidden="true" />
                        </button>
                      )}
                      {group.name && group.name !== ARCHIVED_GROUP && (
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
                          title="Delete group"
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>

                  {!dragging && (
                    <SpringCollapse open={!isCollapsed}>
                      <CategoryList
                        items={group.items}
                        onMove={moveCategoryTo}
                        renderRow={(category, catGrip) => {
                          const parts = splitEmoji(category.name);
                          const thresholds = category.alertPcts
                            ? sorted(category.alertPcts)
                            : DEFAULT_ALERT_PCTS;
                          return (
                            <>
                              {catGrip}
                              <span
                                className="env-cat-icon"
                                style={{
                                  background: avatarColorFor(parts.text),
                                }}
                                aria-hidden="true"
                              >
                                {categoryEmoji(category.name)}
                              </span>
                              <span className="env-cat-name">{parts.text}</span>
                              <button
                                type="button"
                                className="env-cat-alerts"
                                onClick={() => {
                                  setEditing(category);
                                  setDraftPcts(thresholds);
                                }}
                                title="Get notified when spending in this envelope reaches these points"
                                aria-label={`Spending alerts for ${parts.text}: ${thresholds.map((p) => `${p}%`).join(", ")}`}
                              >
                                <Bell size={14} aria-hidden="true" />
                                <span className="env-alert-copy">
                                  <span className="env-alert-label">
                                    Spending alerts
                                  </span>
                                  <span className="env-alert-values">
                                    {thresholds.map((p) => `${p}%`).join(" · ")}
                                  </span>
                                </span>
                              </button>
                              <div className="env-cat-actions">
                                <Link
                                  className="env-icon-btn"
                                  href={`/expense/transactions?category=${encodeURIComponent(category.name)}`}
                                  aria-label={`View transactions for ${parts.text}`}
                                  title="View transactions"
                                >
                                  <ReceiptText size={14} aria-hidden="true" />
                                </Link>
                                <button
                                  type="button"
                                  className="env-icon-btn"
                                  onClick={() =>
                                    beginDraft(
                                      {
                                        kind: "rename-category",
                                        name: category.name,
                                        group: group.name,
                                      },
                                      category.name,
                                    )
                                  }
                                  aria-label={`Rename ${parts.text}`}
                                  title="Rename category"
                                >
                                  <Pencil size={14} aria-hidden="true" />
                                </button>
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
                                  title="Delete category"
                                >
                                  <Trash2 size={14} aria-hidden="true" />
                                </button>
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
                  className="env-group"
                >
                  {body}
                </DragItem>
              ) : (
                <motion.li
                  key={group.label}
                  layout="position"
                  className="env-group"
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
                  ? "Rename category"
                  : draft.kind === "new-group"
                    ? "Add group"
                    : "Rename group"
              }
              onClick={(e) => e.stopPropagation()}
            >
              {draft.kind.startsWith("rename-") ? (
                <div className="env-sheet-rename-head">
                  <div className="env-sheet-rename-icon" aria-hidden="true">
                    {draft.kind === "rename-category"
                      ? categoryEmoji(draftText, draft.group)
                      : groupEmoji(draftText)}
                  </div>
                  <div className="env-sheet-rename-heading">
                    <span className="env-sheet-eyebrow">
                      {draft.kind === "rename-category" ? "CATEGORY" : "GROUP"}
                    </span>
                    <h2 className="env-sheet-title">
                      {draft.kind === "rename-category"
                        ? "Rename category"
                        : "Rename group"}
                    </h2>
                  </div>
                  <button
                    type="button"
                    className="env-sheet-close"
                    onClick={() => setDraft(null)}
                    aria-label="Close dialog"
                  >
                    <X size={18} aria-hidden="true" />
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

              <label
                className="env-sheet-section-label"
                htmlFor="env-sheet-name"
              >
                {draft.kind.startsWith("rename-") ? "New name" : "Name"}
              </label>
              <div className="env-sheet-name-row">
                {!draft.kind.startsWith("rename-") && (
                  <div className="env-sheet-icon-swatch" aria-hidden="true">
                    {groupEmoji(draftText)}
                  </div>
                )}
                <input
                  id="env-sheet-name"
                  className="env-input"
                  autoFocus
                  aria-describedby={
                    draft.kind.startsWith("rename-")
                      ? "env-sheet-emoji-help"
                      : undefined
                  }
                  placeholder={
                    draft.kind === "rename-category"
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
              </div>
              {draft.kind.startsWith("rename-") ? (
                <p className="env-sheet-emoji-help" id="env-sheet-emoji-help">
                  The first emoji becomes the icon for this{" "}
                  {draft.kind === "rename-category" ? "category" : "group"}.
                </p>
              ) : (
                draftText.trim() !== "" &&
                splitEmoji(draftText).icon === "" && (
                  <p className="env-sheet-hint">
                    💡 Tip: start the name with an emoji, like 🚗 Transport , to
                    give it its own icon.
                  </p>
                )
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
                  disabled={submitting || !draftText.trim()}
                >
                  {submitting
                    ? "Saving…"
                    : draft.kind === "rename-category"
                      ? "Rename"
                      : draft.kind === "new-group"
                        ? "Create group"
                        : "Rename"}
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
                ? "Its categories move to the Archived group. You can restore the group from Archive for 7 days."
                : "It will move to Archive. You can restore it for 7 days."
            }
            cancelLabel="Cancel"
            onCancel={() => setDeleteTarget(null)}
          >
            <button
              type="button"
              className="account-danger-btn"
              style={{ marginTop: 0 }}
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
