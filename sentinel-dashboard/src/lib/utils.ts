import type { PortfolioRow, SentinelEvent } from "./types";

export function ringColor(score: number | null): string {
  if (score === null) return "var(--line)";
  if (score >= 75) return "var(--signal)";
  if (score >= 55) return "#7E9AD8";
  return "var(--line)";
}

export function formatSentiment(value: number | null): string {
  if (value === null) return "—";
  const sign = value >= 0 ? "+" : "−";
  return `${sign}${Math.abs(value).toFixed(2).replace(".", ",")}`;
}

export function sentimentClass(value: number | null): string {
  if (value === null) return "text-muted";
  return value < 0 ? "text-down" : "text-up";
}

export function formatAgo(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} j`;
}

export function alertsPerWeekEstimate(threshold: number): number {
  return Math.max(0, Math.round((100 - threshold) / 11));
}

export function sourceCount(sources: SentinelEvent["sources"]): number {
  if (!sources?.length) return 0;
  const names = new Set<string>();
  for (const src of sources) {
    const label = (src.name || src.authority || "").trim();
    if (label) names.add(label);
  }
  return names.size || sources.length;
}

export function formatSourceTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function eventTitle(event: SentinelEvent): string {
  return event.title || event.summary || "Sans titre";
}

export function eventSummary(event: SentinelEvent): string {
  return event.summary || event.body || "";
}

export function compressionRatioLabel(raw: number, passed: number): string {
  if (passed <= 0) return `${raw} → 0`;
  const ratio = Math.round(raw / passed);
  return `${raw} → ${passed} · ${ratio}:1`;
}

export function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function eventContagionSymbols(event: SentinelEvent): string[] {
  const fromArr = (event.contagion_symbols ?? []).filter(
    (s) => Boolean(s) && s !== "—"
  );
  if (fromArr.length > 0) {
    return Array.from(new Set(fromArr));
  }
  if (event.contagion_symbol && event.contagion_symbol !== "—") {
    return [event.contagion_symbol];
  }
  return [];
}

export function countAlertsAboveThreshold(
  events: Pick<SentinelEvent, "symbol" | "impact_score">[],
  portfolio: Pick<PortfolioRow, "symbol" | "is_active" | "alert_threshold">[]
): number {
  const bySymbol = new Map(portfolio.map((p) => [p.symbol, p]));
  return events.filter((e) => {
    const line = bySymbol.get(e.symbol);
    return Boolean(
      line?.is_active && (e.impact_score ?? 0) >= line.alert_threshold
    );
  }).length;
}

export function eventTypeLabel(key: string, label?: string | null): string {
  return label || key.toUpperCase();
}
