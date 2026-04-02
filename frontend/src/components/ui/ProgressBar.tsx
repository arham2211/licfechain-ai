"use client";

export function ProgressBar({
  value,
  label,
  max = 100,
}: {
  value: number;
  label?: string;
  max?: number;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const colorClass =
    pct <= 25 ? "progress-green" : pct <= 50 ? "progress-yellow" : pct <= 75 ? "progress-orange" : "progress-red";

  return (
    <div>
      {label && (
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-muted">{label}</span>
          <span className="font-semibold tabular-nums">{Math.round(pct)}%</span>
        </div>
      )}
      <div className="progress-bar">
        <div className={`progress-bar-fill ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
