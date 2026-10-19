import type { CSSProperties, ReactNode } from 'react'

/**
 * A page's first load, drawn in the shape of the page it's about to become,
 * so the data fills in without the layout jumping. Mirrors Mobile's
 * TabSkeleton. Long waits (bill scan, Money Brain, Wrapped) keep LoadingCaption.
 */

function Bone({ w = '100%', h, r = 8, style }: { w?: CSSProperties['width']; h: number; r?: number; style?: CSSProperties }) {
  return <span className="sk-bone" style={{ width: w, height: h, borderRadius: r, ...style }} />
}

/** One pulse for the whole body, so every bone breathes in step. */
function Pulse({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`sk-pulse${className ? ` ${className}` : ''}`} data-testid="tab-skeleton" role="status" aria-label="Loading">
      {children}
    </div>
  )
}

/** Icon, two lines and an amount: a transaction row. */
function Row({ icon = 40, r = 13 }: { icon?: number; r?: number }) {
  return (
    <div className="sk-row">
      <Bone w={icon} h={icon} r={r} />
      <span className="sk-row-text">
        <Bone w="55%" h={14} />
        <Bone w="30%" h={11} />
      </span>
      <Bone w={56} h={14} />
    </div>
  )
}

/** Home's category row: icon, name and spent/of, progress bar, then the available pill. */
function CategoryRow() {
  return (
    <div className="sk-cat-row">
      <span className="sk-row-text">
        <span className="sk-inline">
          <Bone w={26} h={26} r={9} />
          <Bone w="35%" h={14} />
          <Bone w={90} h={12} style={{ marginLeft: 'auto' }} />
        </span>
        <Bone h={6} r={3} />
      </span>
      <Bone w={64} h={22} r={6} />
    </div>
  )
}

function CategoryGroup({ count }: { count: number }) {
  return (
    <div className="env2-group sk-group">
      <div className="sk-head">
        <span className="sk-inline">
          <Bone w={16} h={16} r={4} />
          <Bone w={100} h={14} />
        </span>
        <Bone w={90} h={13} />
      </div>
      <div className="env2-group-rows">
        {Array.from({ length: count }, (_, i) => <CategoryRow key={i} />)}
      </div>
    </div>
  )
}

/** Mirrors Home with everything assigned: month, slim Ready to Assign row, three category groups, and the rail. */
export function HomeSkeleton() {
  return (
    <Pulse className="erd-home">
      <div className="erd-home-main">
        <div className="erd-home-month">
          <Bone w={110} h={22} />
          <Bone w={80} h={12} />
        </div>
        <div className="erd-card sk-card sk-rta">
          <span className="sk-inline">
            <Bone w={30} h={30} r={9} />
            <Bone w={130} h={16} />
          </span>
          <Bone w={48} h={16} />
        </div>
        <div className="erd-card sk-card">
          <div className="sk-head">
            <Bone w={120} h={20} />
            <Bone w={84} h={30} r={999} />
          </div>
          {[3, 2, 2].map((count, i) => <CategoryGroup key={i} count={count} />)}
        </div>
      </div>
      <div className="erd-home-rail">
        <div className="erd-card sk-card">
          <Bone w={130} h={18} />
          <Row icon={36} r={12} />
          <Row icon={36} r={12} />
        </div>
        <div className="erd-card sk-card">
          <div className="sk-head">
            <Bone w={130} h={18} />
            <Bone w={70} h={28} r={999} />
          </div>
          <Row icon={36} r={12} />
          <Row icon={36} r={12} />
          <Row icon={36} r={12} />
        </div>
      </div>
    </Pulse>
  )
}

/** Activity's timeline: two day groups of rows. */
export function ActivitySkeleton() {
  return (
    <Pulse className="sk-timeline">
      {[3, 2].map((count, i) => (
        <div key={i}>
          <div className="sk-head sk-day-head">
            <Bone w={110} h={14} />
            <Bone w={70} h={13} />
          </div>
          {Array.from({ length: count }, (_, j) => <Row key={j} icon={44} r={15} />)}
        </div>
      ))}
    </Pulse>
  )
}

/** Categories page: group cards with category rows. */
export function EnvelopesSkeleton() {
  return (
    <Pulse className="sk-env-list">
      {[3, 2].map((count, i) => (
        <div key={i} className="env-group">
          <div className="env-group-head">
            <Bone w={16} h={16} r={4} />
            <Bone w={110} h={15} />
          </div>
          <div className="env-cat-list">
            {Array.from({ length: count }, (_, j) => (
              <div key={j} className="env-cat">
                <Bone w={40} h={40} r={13} />
                <Bone w="40%" h={15} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </Pulse>
  )
}

/** Insights' month-end forecast: heading, total, then four envelope rows. */
export function ForecastSkeleton() {
  return (
    <article className="erd-card ins-card ins-top-card">
      <Pulse>
        <div className="sk-inline" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <span className="sk-row-text">
            <Bone w={170} h={18} />
            <Bone w={130} h={11} />
          </span>
          <Bone w={64} h={18} />
        </div>
        {Array.from({ length: 4 }, (_, i) => <Row key={i} icon={44} r={22} />)}
      </Pulse>
    </article>
  )
}
