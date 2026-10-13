import { useMemo, useState, useRef, useEffect } from "react";
import { animate } from "motion";
import { parseLocalDate } from "../lib/date";

interface SparkBarDatum {
  date: string;
  value: number;
  categories?: Record<string, number>;
}

interface SparkBarsProps {
  data: Array<SparkBarDatum>;
  formatValue?: (value: number) => string;
  size?: "compact" | "default" | "expanded";
  capOutliers?: boolean;
  outlierThreshold?: number;
  outlierPercentile?: number;
  onBarClick?: (index: number) => void;
  enableFluidInteractions?: boolean;
  variant?: "area" | "bar";
}

function smoothPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const cx = (p0.x + p1.x) / 2;
    d += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  return d;
}

export function SparkBars({
  data,
  formatValue = (value) => `${value}`,
  size = "default",
  capOutliers = false,
  outlierThreshold = 1.6,
  outlierPercentile = 0.9,
  onBarClick,
  enableFluidInteractions = true,
  variant = "bar",
}: SparkBarsProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [isPointerDown, setIsPointerDown] = useState(false);
  const barRefs = useRef<Array<HTMLDivElement | null>>([]);
  const animationRefs = useRef<
    Array<{ animation?: ReturnType<typeof animate> }>
  >([]);

  // Track pointer position for direct manipulation
  const [pointerPosition, setPointerPosition] = useState<{
    x: number;
    y: number;
    time: number;
  } | null>(null);
  const [activeBarIndex, setActiveBarIndex] = useState<number | null>(null);

  const values = data
    .map((row) => row.value)
    .filter((value) => Number.isFinite(value));

  const rawMax = values.length ? Math.max(...values, 0) : 0;

  const scaleMax = useMemo(() => {
    if (!capOutliers || values.length < 3) return Math.max(rawMax, 0);
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.max(
      0,
      Math.min(
        sorted.length - 1,
        Math.floor((sorted.length - 1) * outlierPercentile),
      ),
    );
    const percentileValue = sorted[idx] ?? rawMax;
    if (!percentileValue) return Math.max(rawMax, 0);
    return rawMax > percentileValue * outlierThreshold
      ? percentileValue
      : Math.max(rawMax, 0);
  }, [capOutliers, outlierPercentile, outlierThreshold, rawMax, values]);

  const maxValue = Math.max(scaleMax, 0);

  const avg = useMemo(() => {
    if (!data.length) return 0;
    return data.reduce((sum, row) => sum + row.value, 0) / data.length;
  }, [data]);

  const avgNormalized = maxValue ? Math.max(0, Math.min(1, avg / maxValue)) : 0;
  const avgOffset = avgNormalized * 100;

  const labelEvery =
    data.length > 8 ? Math.max(1, Math.floor(data.length / 6)) : 1;

  // Handle pointer down for immediate feedback
  const handlePointerDown = (index: number, e: React.PointerEvent) => {
    if (!enableFluidInteractions) return;
    setIsPointerDown(true);
    setActiveBarIndex(index);
    setPointerPosition({ x: e.clientX, y: e.clientY, time: Date.now() });

    // Immediate feedback on pointer down
    const barElement = barRefs.current[index];
    if (barElement) {
      barElement.style.transform = "scale(0.98)";
      barElement.style.transition = "transform 0.05s ease-out";
    }
  };

  // Handle pointer move for direct manipulation
  const handlePointerMove = (index: number, e: React.PointerEvent) => {
    if (!enableFluidInteractions || !isPointerDown || activeBarIndex !== index)
      return;
    setPointerPosition({ x: e.clientX, y: e.clientY, time: Date.now() });
  };

  // Handle pointer up for velocity handoff
  const handlePointerUp = (index: number, e: React.PointerEvent) => {
    if (!enableFluidInteractions) return;
    setIsPointerDown(false);
    setActiveBarIndex(null);

    const barElement = barRefs.current[index];
    if (barElement) {
      // Reset transform immediately
      barElement.style.transform = "";

      // Interrupt any running spring for this bar before starting a new one
      animationRefs.current[index]?.animation?.cancel();

      // Reduced motion: bar returns to rest instantly, no release spring
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
      }

      // Calculate velocity based on pointer movement
      let velocityY = 0;
      if (pointerPosition) {
        const currentTime = Date.now();
        const timeDiff = currentTime - pointerPosition.time;
        if (timeDiff > 0 && timeDiff < 100) {
          const yDiff = e.clientY - pointerPosition.y;
          velocityY = (yDiff / timeDiff) * 1000; // px/s
        }
      }

      // Spring animation back to original position
      const animation = animate(
        barElement,
        { transform: ["scale(0.98)", "scale(1)"] },
        {
          type: "spring",
          bounce: 0.4,
          duration: 0.6,
          velocity: velocityY,
        },
      );

      // Store animation reference for interruptibility
      animationRefs.current[index] = { animation };
    }
  };

  // Cleanup animations on unmount
  useEffect(() => {
    const refs = animationRefs.current;
    return () => {
      refs.forEach((ref) => {
        ref.animation?.cancel();
      });
    };
  }, []);

  function getLabel(input: string): string {
    if (/^\d{4}-\d{2}$/.test(input)) {
      const d = new Date(`${input}-01`);
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleDateString("en-IN", { month: "short" });
      }
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
      const d = new Date(input);
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
        });
      }
    }

    return input;
  }

  function getDateRange(index: number): string {
    const current = data[index];
    if (!current) return "";
    const next = data[index + 1];
    if (next) {
      const start = parseLocalDate(current.date);
      const end = parseLocalDate(next.date);
      end.setDate(end.getDate() - 1);
      const fmt = (d: Date) =>
        d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
      return `${fmt(start)} – ${fmt(end)}`;
    }
    return getLabel(current.date);
  }

  // ── Area variant geometry ─────────────────────────────────
  const W = 800;
  const H = 240;
  const PAD_X = 12;
  const PAD_TOP = 24;
  const PAD_BOTTOM = 28;
  const plotH = H - PAD_TOP - PAD_BOTTOM;
  const n = data.length;
  const points = data.map((row, index) => {
    const normalized = maxValue
      ? Math.max(0, Math.min(1, row.value / maxValue))
      : 0;
    return {
      x: n > 1 ? PAD_X + (index / (n - 1)) * (W - PAD_X * 2) : W / 2,
      y: PAD_TOP + (1 - normalized) * plotH,
    };
  });
  const lineD = smoothPath(points);
  const areaD = points.length
    ? `${lineD} L ${points[points.length - 1].x} ${H - PAD_BOTTOM} L ${points[0].x} ${H - PAD_BOTTOM} Z`
    : "";
  const gradientId = "erd-area-grad";

  return (
    <div
      className={`spark-bars spark-bars--${size} spark-bars--${variant}`}
      role="img"
      aria-label="Expense trend chart"
      onMouseLeave={() => setHoveredIndex(null)}
    >
      {variant === "area" && n > 0 && (
        <>
          <div style={{ position: "relative" }}>
            <svg
              className="spark-area-svg"
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.4" />
                  <stop
                    offset="100%"
                    stopColor="var(--gold)"
                    stopOpacity="0.02"
                  />
                </linearGradient>
              </defs>
              {avg > 0 && avgNormalized > 0 && (
                <line
                  x1={PAD_X}
                  x2={W - PAD_X}
                  y1={PAD_TOP + (1 - avgNormalized) * plotH}
                  y2={PAD_TOP + (1 - avgNormalized) * plotH}
                  stroke="var(--erd-text3)"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
              )}
              <path
                d={areaD}
                fill={`url(#${gradientId})`}
                className="spark-area-fill"
              />
              <path d={lineD} className="spark-area-line" />
              {points.map((p, i) => (
                <circle
                  key={i}
                  className="spark-area-dot"
                  cx={p.x}
                  cy={p.y}
                  r={hoveredIndex === i ? 5 : 2.5}
                  style={
                    hoveredIndex === i ? { fill: "var(--gold)" } : undefined
                  }
                />
              ))}
            </svg>
            <div
              className="spark-bars-inner"
              style={{ position: "absolute", inset: 0 }}
            >
              {data.map((row, index) => {
                const p = points[index];
                const columnWidth = (W - PAD_X * 2) / Math.max(n - 1, 1);
                return (
                  <div
                    key={`${row.date}-${index}`}
                    style={{
                      position: "absolute",
                      left: `${(p.x / W) * 100}%`,
                      top: "0",
                      width: `${(columnWidth / W) * 100}%`,
                      height: "100%",
                      transform: "translateX(-50%)",
                      cursor: onBarClick ? "pointer" : "default",
                    }}
                    onMouseEnter={() => setHoveredIndex(index)}
                    onClick={() => onBarClick?.(index)}
                  />
                );
              })}
            </div>
            {hoveredIndex != null &&
              points[hoveredIndex] &&
              (() => {
                const p = points[hoveredIndex];
                const row = data[hoveredIndex];
                const prev = data[hoveredIndex - 1];
                const delta = prev ? row.value - prev.value : 0;
                const deltaPct = prev
                  ? ((row.value - prev.value) / prev.value) * 100
                  : 0;
                return (
                  <div
                    className="spark-tooltip spark-area-tooltip"
                    style={{
                      left: `${(p.x / W) * 100}%`,
                      top: `${(p.y / H) * 100}%`,
                    }}
                  >
                    <strong>{getDateRange(hoveredIndex)}</strong>
                    <span>Total: {formatValue(row.value)}</span>
                    {prev && prev.value !== 0 && (
                      <span
                        className={
                          delta > 0 ? "spark-tooltip-down" : "spark-tooltip-up"
                        }
                      >
                        vs previous: {delta > 0 ? "▲" : "▼"}{" "}
                        {Math.abs(deltaPct).toFixed(1)}%
                      </span>
                    )}
                  </div>
                );
              })()}
          </div>
          <div className="spark-bars-labels">
            {data.map((row, index) => (
              <span key={row.date}>
                {index % labelEvery === 0 || index === data.length - 1
                  ? getLabel(row.date)
                  : ""}
              </span>
            ))}
          </div>
        </>
      )}
      {variant === "bar" && (
        <div
          className="spark-bars-inner"
          onMouseLeave={() => setHoveredIndex(null)}
        >
          {avg > 0 && (
            <div
              className="spark-avg-line"
              style={{ bottom: `${avgOffset}%` }}
            />
          )}
          {data.map((row, index) => {
            const normalized = maxValue
              ? Math.max(0, Math.min(1, row.value / maxValue))
              : 0;
            const height = normalized * 100;
            const prev = data[index - 1];
            const delta = prev ? row.value - prev.value : 0;
            const deltaPct = prev
              ? ((row.value - prev.value) / prev.value) * 100
              : 0;
            const isCurrent = index === data.length - 1;
            const isHovered = hoveredIndex === index;
            const isActive = activeBarIndex === index;

            const isZero = row.value === 0;
            const isToday = row.date === new Date().toISOString().slice(0, 10);

            return (
              <div
                key={`${row.date}-${index}`}
                className={`spark-bar-wrap ${isCurrent ? "is-current" : ""} ${isHovered ? "is-hovered" : ""} ${isToday ? "is-today" : ""} ${onBarClick ? "is-clickable" : ""} ${isActive ? "is-active" : ""}`}
                onMouseEnter={() => setHoveredIndex(index)}
                onClick={() => onBarClick?.(index)}
                onPointerDown={(e: React.PointerEvent) =>
                  handlePointerDown(index, e)
                }
                onPointerMove={(e: React.PointerEvent) =>
                  handlePointerMove(index, e)
                }
                onPointerUp={(e: React.PointerEvent) =>
                  handlePointerUp(index, e)
                }
                onPointerLeave={(e: React.PointerEvent) => {
                  if (isPointerDown && activeBarIndex === index) {
                    handlePointerUp(index, e);
                  }
                }}
                style={{ touchAction: "none" }}
              >
                <div className="spark-bar-track">
                  <div
                    ref={(el) => {
                      barRefs.current[index] = el;
                    }}
                    className={`spark-bar ${isZero ? "spark-bar-zero" : ""}`}
                    style={{ height: isZero ? "2px" : `${height}%` }}
                  />
                </div>
                <span>
                  {index % labelEvery === 0 || index === data.length - 1
                    ? getLabel(row.date)
                    : ""}
                </span>

                {isHovered && (
                  <div className="spark-tooltip">
                    <strong>{getDateRange(index)}</strong>
                    <span>Total: {formatValue(row.value)}</span>
                    {prev && prev.value !== 0 && (
                      <span
                        className={
                          delta > 0 ? "spark-tooltip-down" : "spark-tooltip-up"
                        }
                      >
                        vs previous: {delta > 0 ? "▲" : "▼"}{" "}
                        {Math.abs(deltaPct).toFixed(1)}%
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
