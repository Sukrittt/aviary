// The old hand-rolled menus' shape, applied to shadcn's Select / Combobox /
// DropdownMenu popups. Colours come from the token mapping in app/globals.css.
// w-auto: shadcn sizes popups to the trigger, and the row menus' trigger is
// the whole row. Select puts the trigger width back.
export const MENU_POPUP =
  "w-auto min-w-[220px] rounded-2xl p-1.5 ring-(--tk-border-strong) shadow-[0_18px_48px_-12px_oklch(0%_0_0/0.55)] backdrop-blur-xl"
export const MENU_ITEM =
  "gap-2 rounded-[10px] px-2.5 py-2 text-sm font-medium data-highlighted:bg-(--tk-pill-bg)"
