"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useMotionValue, useReducedMotion } from "motion/react";
import { DotsSixVerticalIcon } from "@/src/components/icons";

/** Where a dragged category would land: a position among its new group's other rows. */
export type CategorySlot = { group: string; index: number };
type DropTarget = CategorySlot & { collapsed: boolean };

export type DropCard = {
  group: string;
  bottom: number;
  /** Vertical middles of the rows, without the dragged one. Null when the group is collapsed. */
  rowMids: number[] | null;
  /** How many rows the group has, for a drop onto a collapsed header. */
  count: number;
};

/**
 * The slot under the pointer. The gap between two cards counts as the lower one. A move across a
 * row's middle shifts that row away from the pointer, so a slot can't flicker between two answers.
 */
export function dropSlot(y: number, cards: DropCard[]): DropTarget | null {
  const card = cards.find((c) => y < c.bottom) ?? cards[cards.length - 1];
  if (!card) return null;
  return {
    group: card.group,
    index: card.rowMids ? card.rowMids.filter((mid) => mid < y).length : card.count,
    collapsed: !card.rowMids,
  };
}

function readCards(root: Element): DropCard[] {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-cat-group]")).map((head) => {
    const card = head.parentElement as HTMLElement;
    return {
      group: head.dataset.catGroup ?? "",
      bottom: card.getBoundingClientRect().bottom,
      rowMids: card.querySelector(".env-cat-list")
        ? Array.from(card.querySelectorAll("[data-cat]")).map((row) => {
            const r = row.getBoundingClientRect();
            return r.top + r.height / 2;
          })
        : null,
      count: Number(head.dataset.catCount),
    };
  });
}

export const slotKey = (slot: CategorySlot) => `${slot.group}\0${slot.index}`;

function scrollParent(el: Element): Element {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p);
    if ((overflowY === "auto" || overflowY === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return document.scrollingElement ?? document.documentElement;
}

const START_DISTANCE = 3;
const SCROLL_EDGE = 72;
const SCROLL_SPEED = 14;
const LAND_MS = 60;
const LAND_TIMEOUT_MS = 500;

export type ActiveCategoryDrag = {
  name: string;
  from: CategorySlot;
  to: CategorySlot;
  /**
   * Where the gap sits, which is `to` except over a collapsed group. That card has no rows to open
   * a gap between, and closing the one elsewhere would pull the card out from under the pointer,
   * so the gap waits where it was until the drop.
   */
  gap: CategorySlot | null;
  rect: { width: number; height: number };
  /** False until the pointer picks a slot of its own: the first gap takes the row's place unanimated. */
  moved: boolean;
  /** Released and flying to the gap. */
  landing: boolean;
  /** Where the floating row is portaled: inside the page, so it keeps the page's colours. */
  host: Element;
};

/**
 * Drags a category between groups. Motion's Reorder only works inside one list, so the row lifts
 * into a floating copy under the pointer while a gap opens where it would land. Rows and cards just
 * reflow around the gap's animated height, with nothing to measure or project, and the drag survives
 * the row changing lists because the copy never does.
 *
 * `version` is the category list as the drag can see it. It decides two things: a drop is thrown
 * away if a refetch replaced the list mid-drag (the slots the user saw no longer mean anything), and
 * after a drop the gap stays until the move's optimistic write arrives, so nothing flashes.
 */
export function useCategoryDrag(version: unknown, onDrop: (name: string, slot: CategorySlot) => void) {
  const [raw, setRaw] = useState<(ActiveCategoryDrag & { droppedOn?: unknown }) | null>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const reduce = useReducedMotion();
  const latest = useRef({ version, onDrop, reduce });
  // The row a keyboard move sends to another group remounts there; its grip takes the focus back.
  const refocus = useRef<{ name: string; group: string } | null>(null);
  const stop = useRef<(() => void) | null>(null);

  useEffect(() => {
    latest.current = { version, onDrop, reduce };
  });
  useEffect(() => () => stop.current?.(), []);

  function begin(e: ReactPointerEvent, name: string, from: CategorySlot) {
    if (e.button !== 0 || stop.current) return;
    const row = e.currentTarget.closest("[data-cat]");
    const root = e.currentTarget.closest(".env-group-list");
    const host = e.currentTarget.closest(".expense-redesign");
    if (!row || !root || !host) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const pointerId = e.pointerId;
    const scroller = scrollParent(row);
    const rect = row.getBoundingClientRect();
    const grabX = startX - rect.left;
    const grabY = startY - rect.top;
    const startVersion = latest.current.version;
    let pointerX = startX;
    let pointerY = startY;
    let to = from;
    let gap: CategorySlot | null = from;
    let phase: "pending" | "drag" | "land" = "pending";
    let keep = false;
    let landStart = 0;
    let lastFrame = 0;
    let frame = 0;

    const finish = () => {
      const stale = latest.current.version !== startVersion;
      const unchanged = slotKey(to) === slotKey(from);
      stop.current?.();
      if (!keep || stale || unchanged) return setRaw(null);
      latest.current.onDrop(name, to);
      // Holds until `version` changes, which the write above guarantees.
      setRaw((a) => a && { ...a, droppedOn: startVersion });
    };

    const pickSlot = () => {
      const slot = dropSlot(pointerY, readCards(root));
      if (!slot || slotKey(slot) === slotKey(to)) return;
      to = { group: slot.group, index: slot.index };
      if (!slot.collapsed) gap = to;
      setRaw((a) => a && { ...a, to, gap, moved: true });
    };

    const tick = (now: number) => {
      if (phase === "drag") {
        const box = scroller === document.scrollingElement
          ? { top: 0, bottom: window.innerHeight }
          : scroller.getBoundingClientRect();
        const above = box.top + SCROLL_EDGE - pointerY;
        const below = pointerY - (box.bottom - SCROLL_EDGE);
        if (above > 0) scroller.scrollTop -= (Math.min(above, SCROLL_EDGE) / SCROLL_EDGE) * SCROLL_SPEED;
        else if (below > 0) scroller.scrollTop += (Math.min(below, SCROLL_EDGE) / SCROLL_EDGE) * SCROLL_SPEED;

        pickSlot();
      } else if (phase === "land") {
        // Chases the gap rather than a fixed point: it may still be opening when the row arrives.
        const key = slotKey(to);
        const gap = Array.from(root.querySelectorAll<HTMLElement>("[data-cat-slot]")).find(
          (el) => el.dataset.catSlot === key,
        );
        const head = Array.from(root.querySelectorAll<HTMLElement>("[data-cat-group]")).find(
          (el) => el.dataset.catGroup === to.group,
        );
        const target = (gap ?? head)?.getBoundingClientRect();
        if (!target) return finish();
        const ease = 1 - Math.exp(-(now - lastFrame) / LAND_MS);
        x.set(x.get() + (target.left - x.get()) * ease);
        y.set(y.get() + (target.top - y.get()) * ease);
        const close = Math.abs(target.left - x.get()) < 0.5 && Math.abs(target.top - y.get()) < 0.5;
        if (close || now - landStart > LAND_TIMEOUT_MS) return finish();
      }
      lastFrame = now;
      frame = requestAnimationFrame(tick);
    };

    const land = (commit: boolean) => {
      keep = commit;
      if (commit) pickSlot();
      else to = gap = from;
      // Over a collapsed group the gap has nothing left to wait for: it closes as the row flies in.
      if (gap && slotKey(gap) !== slotKey(to)) gap = null;
      setRaw((a) => a && { ...a, to, gap, landing: true });
      if (latest.current.reduce) return finish();
      phase = "land";
      landStart = lastFrame = performance.now();
    };

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      pointerX = ev.clientX;
      pointerY = ev.clientY;
      if (phase === "pending") {
        if (Math.hypot(pointerX - startX, pointerY - startY) < START_DISTANCE) return;
        phase = "drag";
        document.documentElement.classList.add("is-cat-dragging");
        setRaw({
          name,
          from,
          to,
          gap,
          rect: { width: rect.width, height: rect.height },
          moved: false,
          landing: false,
          host,
        });
        lastFrame = performance.now();
        frame = requestAnimationFrame(tick);
      }
      if (phase === "drag") {
        x.set(pointerX - grabX);
        y.set(pointerY - grabY);
      }
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (phase === "pending") stop.current?.();
      else if (phase === "drag") land(true);
    };
    const onCancel = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (phase === "pending") stop.current?.();
      else if (phase === "drag") land(false);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape" && phase === "drag") land(false);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    stop.current = () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
      document.documentElement.classList.remove("is-cat-dragging");
      stop.current = null;
    };
  }

  // Past a drop, the new list is the answer: the row is back in a list and the gap has no job left.
  const active = raw?.droppedOn !== undefined && raw.droppedOn !== version ? null : raw;
  return {
    active,
    x,
    y,
    begin,
    focusAfterMove: (name: string, group: string) => {
      refocus.current = { name, group };
    },
    /** Called by a grip as it mounts: true once, for the row a keyboard move just sent here. */
    claimFocus: (name: string, group: string) => {
      if (refocus.current?.name !== name || refocus.current.group !== group) return false;
      refocus.current = null;
      return true;
    },
  };
}

export type CategoryDrag = ReturnType<typeof useCategoryDrag>;

/** The handle: drags with a pointer, and arrow keys move one slot, across group edges too. */
export function CategoryGrip({
  name,
  group,
  index,
  label,
  drag,
  onNudge,
}: {
  name: string;
  group: string;
  index: number;
  label: string;
  drag: CategoryDrag;
  onNudge: (name: string, by: number) => void;
}) {
  return (
    <button
      type="button"
      className="env-drag-handle"
      aria-label={`Move ${label}`}
      title="Drag to move"
      ref={(el) => {
        if (el && drag.claimFocus(name, group)) el.focus();
      }}
      onPointerDown={(e) => drag.begin(e, name, { group, index })}
      onMouseDown={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          onNudge(name, e.key === "ArrowUp" ? -1 : 1);
        }
      }}
    >
      <DotsSixVerticalIcon size={14} aria-hidden="true" />
    </button>
  );
}

/** The grip's look on the floating copy, which takes no input. */
export function CategoryGripShape() {
  return (
    <span className="env-drag-handle" aria-hidden="true">
      <DotsSixVerticalIcon size={14} aria-hidden="true" />
    </span>
  );
}
