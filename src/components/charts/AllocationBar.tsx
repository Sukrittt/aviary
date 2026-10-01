'use client'

export interface AllocationSegment {
  label: string
  value: number
  color: string
}

export function AllocationBar({ segments }: { segments: AllocationSegment[] }) {
  const positive = segments.filter((segment) => segment.value > 0)
  const total = positive.reduce((sum, segment) => sum + segment.value, 0)
  if (total <= 0) return null

  const laidOut = positive.reduce<Array<AllocationSegment & { x: number; width: number }>>((result, segment) => {
    const width = (segment.value / total) * 100
    const previous = result.at(-1)
    const x = previous ? previous.x + previous.width : 0
    return [...result, { ...segment, x, width }]
  }, [])

  return (
    <div className="ins-allocation">
      <svg viewBox="0 0 100 10" preserveAspectRatio="none" role="img" aria-label="Allocation by category">
        <rect width="100" height="10" rx="5" fill="var(--erd-border)" />
        {laidOut.map((segment) => (
          <rect
            key={segment.label}
            x={segment.x}
            width={segment.width}
            height="10"
            fill={segment.color}
            className="ins-allocation-segment"
          >
            <title>{segment.label} · {segment.width.toFixed(1)}%</title>
          </rect>
        ))}
      </svg>
      <div className="ins-allocation-legend">
        {laidOut.map((segment) => (
          <div key={segment.label}>
            <i style={{ background: segment.color }} />
            <span>{segment.label}</span>
            <strong>{segment.width.toFixed(1)}%</strong>
          </div>
        ))}
      </div>
    </div>
  )
}
