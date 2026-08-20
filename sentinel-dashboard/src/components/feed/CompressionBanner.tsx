import type { CompressionStats } from "@/lib/types";

export function CompressionBanner({
  stats,
  alertsAboveThreshold,
}: {
  stats: CompressionStats;
  alertsAboveThreshold: number;
}) {
  const { rawToday, ratioLabel } = stats;
  const outWidth = Math.max(4, alertsAboveThreshold * 2.6);

  const segments = [
    { w: 46, h: 34, bg: "#F2F5FC", label: String(rawToday || "—") },
    { w: 22, h: 24, bg: "#C6D6F5", label: String(Math.round(rawToday * 0.18) || "") },
    { w: 14, h: 17, bg: "#7E9AD8", label: String(Math.round(rawToday * 0.06) || "") },
    { w: 10, h: 12, bg: "#4A63A8", label: String(Math.round(rawToday * 0.03) || ""), light: true },
    { w: outWidth, h: 8, bg: "#E8542F", label: "" },
  ];

  return (
    <div className="mb-3.5 rounded-[14px] border border-line bg-gradient-to-br from-panel to-deep p-3.5 pb-3">
      <div className="mb-2.5 flex items-baseline justify-between">
        <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
          Filtrage du jour
        </span>
        <span className="font-mono text-xs font-medium text-ice">{ratioLabel}</span>
      </div>
      <div className="flex h-[34px] items-end gap-[3px]">
        {segments.map((seg, i) => (
          <div
            key={i}
            className="relative rounded-t-[3px] transition-[width] duration-500"
            style={{
              width: `${seg.w}%`,
              height: `${seg.h}px`,
              background: seg.bg,
            }}
          >
            {seg.label ? (
              <span
                className={`absolute left-0 top-[-1px] w-full text-center font-mono text-[8px] font-semibold ${
                  seg.light ? "text-white" : "text-deep"
                }`}
              >
                {seg.label}
              </span>
            ) : null}
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between font-mono text-[9px] text-muted">
        <span>flux brut</span>
        <span>alertes · 0,00 €</span>
      </div>
    </div>
  );
}
