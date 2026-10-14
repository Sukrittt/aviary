'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import {
  Select as SelectRoot,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from '@/components/ui/combobox'
import { MENU_ITEM, MENU_POPUP } from './menuStyles'
import './Select.css'

export interface SelectOption {
  value: string
  label: string
  /** Muted second line, e.g. a balance or a code. */
  hint?: string
  /** Leading glyph, e.g. a category icon, shown in both the trigger and the row. */
  icon?: ReactNode
  disabled?: boolean
}

interface Props {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  /** Shown when `value` matches no option (e.g. the empty "Assign to" state). */
  placeholder?: string
  'aria-label'?: string
  id?: string
  disabled?: boolean
  className?: string
  /** Adds a search box pinned to the top of the menu that filters by label. */
  searchable?: boolean
}

// The trigger keeps the app's .ui-select look (Select.css); the menu is shadcn's.
const TRIGGER = 'data-[size=default]:h-auto'
// The selected row keeps the accent tint; check sits in shadcn's right gutter.
// `!` so the focus highlight on open doesn't paint over the selected tint;
// data-[selected], not shadcn's data-selected: (that one wants ="true", Base UI sets "").
const ITEM = cn(MENU_ITEM, 'pr-8 data-[selected]:bg-(--tk-accent-soft)! data-[selected]:text-(--tk-accent-ink)!')

function OptionLabel({ option }: { option: SelectOption }) {
  return (
    <>
      {option.icon && <span className="ui-select-icon" aria-hidden="true">{option.icon}</span>}
      <span className="min-w-0">
        {option.label}
        {option.hint && <small className="mt-px block text-xs font-medium text-muted-foreground">{option.hint}</small>}
      </span>
    </>
  )
}

function TriggerLabel({ selected, placeholder }: { selected: SelectOption | null; placeholder: string }) {
  if (!selected) return <>{placeholder}</>
  return (
    <>
      {selected.icon && <span className="ui-select-icon" aria-hidden="true">{selected.icon}</span>}
      {selected.label}
    </>
  )
}

/**
 * The app's dropdown: shadcn Select, or shadcn Combobox when `searchable` (a
 * filter box at the top of the menu). Same props as the hand-rolled listbox it
 * replaced, so call sites didn't change.
 */
export function Select({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  'aria-label': ariaLabel,
  id,
  disabled = false,
  className = '',
  searchable = false,
}: Props) {
  const selected = options.find((o) => o.value === value) ?? null
  const triggerClass = cn(TRIGGER, 'ui-select', !selected && 'is-placeholder', className)

  if (searchable) {
    return (
      <Combobox
        items={options}
        value={selected}
        onValueChange={(o: SelectOption | null) => o && onChange(o.value)}
        itemToStringLabel={(o: SelectOption) => o.label}
        isItemEqualToValue={(a: SelectOption, b: SelectOption) => a.value === b.value}
        disabled={disabled}
      >
        <ComboboxTrigger id={id} aria-label={ariaLabel} className={triggerClass}>
          <span className="ui-select-value">
            <ComboboxValue>{() => <TriggerLabel selected={selected} placeholder={placeholder} />}</ComboboxValue>
          </span>
        </ComboboxTrigger>
        <ComboboxContent className={cn(MENU_POPUP, 'w-(--anchor-width)')}>
          <ComboboxInput showTrigger={false} placeholder="Search…" aria-label={ariaLabel ? `Search ${ariaLabel}` : 'Search'} />
          <ComboboxEmpty>No matches</ComboboxEmpty>
          <ComboboxList>
            {(o: SelectOption) => (
              <ComboboxItem key={o.value} value={o} disabled={o.disabled} className={ITEM}>
                <OptionLabel option={o} />
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    )
  }

  return (
    <SelectRoot
      value={selected ? value : null}
      onValueChange={(v: string | null) => v != null && onChange(v)}
      disabled={disabled}
    >
      <SelectTrigger id={id} aria-label={ariaLabel} className={triggerClass}>
        <SelectValue className="ui-select-value">
          {() => <TriggerLabel selected={selected} placeholder={placeholder} />}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className={cn(MENU_POPUP, 'w-(--anchor-width) max-h-[min(280px,var(--available-height))]')} alignItemWithTrigger={false} align="start">
        {options.length === 0 && <div className="py-2 text-center text-sm text-muted-foreground">No options</div>}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} disabled={o.disabled} className={ITEM}>
            <OptionLabel option={o} />
          </SelectItem>
        ))}
      </SelectContent>
    </SelectRoot>
  )
}
