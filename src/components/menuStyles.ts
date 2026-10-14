// The old hand-rolled menus' shape, applied to shadcn's Select / Combobox /
// DropdownMenu popups. Colours come from the token mapping in app/globals.css.
// w-auto: shadcn sizes popups to the trigger, and the row menus' trigger is
// the whole row. Select puts the trigger width back. Fixed 14px radius to match
// the .ui-select trigger (rounded-2xl scales with --radius and came out ~25px);
// items are 14px minus the 6px padding so the corners stay concentric.
// Highlight uses chip-active-bg: pill-bg is ~90% of the popup colour, so it
// was invisible on hover in both themes.
export const MENU_POPUP =
  "w-auto min-w-[220px] rounded-[14px] p-1.5 ring-(--tk-border-strong) shadow-[0_18px_48px_-12px_oklch(0%_0_0/0.55)] backdrop-blur-xl"
export const MENU_ITEM =
  "gap-2 rounded-[8px] px-2.5 py-2 text-sm font-medium focus:bg-(--tk-chip-active-bg) data-highlighted:bg-(--tk-chip-active-bg)"
