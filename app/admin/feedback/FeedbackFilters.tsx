'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Select, type SelectOption } from '@/src/components/Select'

const TYPE_OPTIONS: SelectOption[] = [
  { value: '', label: 'All types' },
  { value: 'bug', label: 'Bug' },
  { value: 'idea', label: 'Idea' },
]

export function FeedbackFilters({
  q: initialQ,
  type: initialType,
  area: initialArea,
  severity: initialSeverity,
  areas,
  severityLabels,
}: {
  q: string
  type: string
  area: string
  severity: string
  areas: readonly string[]
  severityLabels: readonly string[]
}) {
  const router = useRouter()
  const [q, setQ] = useState(initialQ)
  const [type, setType] = useState(initialType)
  const [area, setArea] = useState(initialArea)
  const [severity, setSeverity] = useState(initialSeverity)

  const areaOptions: SelectOption[] = [{ value: '', label: 'All areas' }, ...areas.map((a) => ({ value: a, label: a }))]
  const severityOptions: SelectOption[] = [{ value: '', label: 'All severities' }, ...severityLabels.map((label, i) => ({ value: String(i), label }))]

  const filtered = !!(q || type || area || severity)

  function apply(e: FormEvent) {
    e.preventDefault()
    router.push(`/admin/feedback?${new URLSearchParams({ q, type, area, severity })}`)
  }

  return (
    <form className="adm-form adm-filters" onSubmit={apply}>
      <input className="adm-input adm-search" name="q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title or description" aria-label="Search" />
      <Select value={type} onChange={setType} options={TYPE_OPTIONS} aria-label="Type" />
      <Select value={area} onChange={setArea} options={areaOptions} aria-label="Area" />
      <Select value={severity} onChange={setSeverity} options={severityOptions} aria-label="Severity" />
      <button className="adm-btn is-primary" type="submit">
        Apply
      </button>
      {filtered && (
        <Link className="adm-btn" href="/admin/feedback">
          Clear
        </Link>
      )}
    </form>
  )
}
