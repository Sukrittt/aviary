"use client";

import { useState, type ReactNode } from "react";
import { Reorder, useDragControls } from "motion/react";
import { GripVertical } from "lucide-react";

/**
 * Local order while a drag runs. Motion's Reorder needs `values` updated on every swap, but
 * the server order should only change once, on drop. `order` is the live list; `drop(name)`
 * hands the final index to `onMove` and goes back to `items`, which by then carries the same
 * order through the move hook's optimistic write, so nothing flashes. `base` is `items` as
 * the drag found it: if a refetch replaced it mid-drag, the indexes the user saw no longer
 * mean anything, so the drop is dropped and the row snaps to the fresh order.
 */
export function useDragOrder(
  items: string[],
  onMove: (name: string, toIndex: number) => void,
) {
  const [live, setLive] = useState<{ base: string[]; order: string[] } | null>(
    null,
  );
  // The row being dragged, from its first move until drop. Groups read it to fold to headers.
  const [active, setActive] = useState<string | null>(null);
  const order = live?.order ?? items;
  return {
    order,
    active,
    start: setActive,
    setOrder: (next: string[]) =>
      setLive((prev) => ({ base: prev?.base ?? items, order: next })),
    drop(name: string) {
      setLive(null);
      setActive(null);
      if (!live || live.base.join("\0") !== items.join("\0")) return;
      const from = items.indexOf(name);
      const to = live.order.indexOf(name);
      if (from !== -1 && to !== -1 && from !== to) onMove(name, to);
    },
    /** Keyboard fallback for the grip: arrow keys move one slot. */
    nudge(name: string, by: number) {
      const to = items.indexOf(name) + by;
      if (to >= 0 && to < items.length) onMove(name, to);
    },
  };
}

type DragOrder = ReturnType<typeof useDragOrder>;

/**
 * One row that only drags from its grip, so clicks on the rest of the row still work.
 * `children` gets the grip to place wherever the row wants it.
 */
export function DragItem({
  value,
  drag,
  label,
  className,
  children,
}: {
  value: string;
  drag: DragOrder;
  /** What the grip moves, for screen readers: "Move Rent". */
  label: string;
  className?: string;
  children: (grip: ReactNode) => ReactNode;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      as="li"
      value={value}
      // Position only: animating size too would squash a row's contents while its height changes.
      layout="position"
      className={drag.active === value ? `${className ?? ""} is-dragging` : className}
      dragListener={false}
      dragControls={controls}
      onDragStart={() => drag.start(value)}
      onDragEnd={() => drag.drop(value)}
      whileDrag={{
        scale: 1.01,
        boxShadow: "0 12px 28px rgba(0, 0, 0, 0.18)",
        zIndex: 2,
      }}
      style={{ position: "relative" }}
    >
      {children(
        <button
          type="button"
          className="env-drag-handle"
          aria-label={`Move ${label}`}
          title="Drag to reorder"
          onPointerDown={(e) => {
            e.preventDefault();
            controls.start(e);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              drag.nudge(value, e.key === "ArrowUp" ? -1 : 1);
            }
          }}
        >
          <GripVertical size={14} aria-hidden="true" />
        </button>,
      )}
    </Reorder.Item>
  );
}

/** The list a set of DragItems reorder within. Extra children (non-draggable rows) render after. */
export function DragList({
  drag,
  className,
  label,
  children,
}: {
  drag: DragOrder;
  className?: string;
  label?: string;
  children: ReactNode;
}) {
  return (
    <Reorder.Group
      as="ul"
      axis="y"
      values={drag.order}
      onReorder={drag.setOrder}
      className={className}
      aria-label={label}
    >
      {children}
    </Reorder.Group>
  );
}
