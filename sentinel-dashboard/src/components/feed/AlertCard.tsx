import Link from "next/link";
import type { PortfolioRow, SentinelEvent } from "@/lib/types";
import {
  formatAgo,
  formatSentiment,
  ringColor,
  sentimentClass,
  sourceCount,
  eventSummary,
  eventTitle,
} from "@/lib/utils";

export function ImpactRing({
  score,
  size = "md",
}: {
  score: number | null;
  size?: "md" | "lg";
}) {
  const display = score ?? "—";
  const border = ringColor(score);
  const dim = size === "lg" ? "h-[58px] w-[58px] text-[21px] border-[3px]" : "h-11 w-11 text-base border-[2.5px]";

  return (
    <div
      className={`grid place-items-center rounded-full font-mono font-semibold text-white ${dim}`}
      style={{ borderColor: border, borderStyle: "solid" }}
    >
      {display}
    </div>
  );
}

export function AlertCard({
  event,
  portfolio,
  fresh = false,
}: {
  event: SentinelEvent;
  portfolio?: PortfolioRow;
  fresh?: boolean;
}) {
  const score = event.impact_score ?? 0;
  const crit = score >= 75;
  const belowThreshold =
    portfolio?.is_active &&
    event.impact_score != null &&
    event.impact_score < portfolio.alert_threshold;

  return (
    <Link
      href={`/alert/${event.id}`}
      className={`mb-2.5 flex cursor-pointer gap-3 rounded-[15px] border border-line bg-panel p-3.5 transition active:scale-[0.985] active:border-muted ${
        crit ? "bg-panel2" : ""
      } ${!event.is_read ? "relative after:absolute after:right-3 after:top-3 after:h-1.5 after:w-1.5 after:rounded-full after:bg-signal" : ""} ${
        fresh ? "animate-pop" : ""
      }`}
    >
      <div className="w-11 shrink-0 text-center">
        <ImpactRing score={event.impact_score} />
        <small className="mt-1 block font-mono text-[8px] tracking-[0.1em] text-muted">
          IMPACT
        </small>
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5 font-mono text-[9.5px] text-muted">
          <span className="rounded bg-line px-1.5 py-0.5 font-semibold text-ice">
            {event.symbol}
          </span>
          <span className="text-[9px] uppercase tracking-[0.1em] text-signal">
            {event.event_type || "—"}
          </span>
          <span>· {formatAgo(event.published_at || event.detected_at)}</span>
        </div>
        <h3 className="mb-1.5 line-clamp-2 pr-2 text-[13.5px] font-semibold leading-snug">
          {eventTitle(event)}
        </h3>
        <p className="line-clamp-3 text-[11.5px] leading-relaxed text-ice/80">
          {eventSummary(event)}
        </p>
        {belowThreshold && portfolio ? (
          <p className="mt-1.5 text-[10.5px] text-muted/70">
            Sous ton seuil {portfolio.alert_threshold} — pas de notification
            envoyée.
          </p>
        ) : null}
        <div className="mt-2 flex items-center gap-2 font-mono text-[9.5px] text-muted">
          <span className="flex gap-[2.5px]">
            {Array.from({ length: Math.min(sourceCount(event.sources), 5) }).map(
              (_, i) => (
                <i key={i} className="block h-[5px] w-[5px] rounded-full bg-ice/50" />
              )
            )}
          </span>
          <span>
            {sourceCount(event.sources)} source
            {sourceCount(event.sources) > 1 ? "s" : ""}
          </span>
          <span
            className={`ml-auto font-semibold ${sentimentClass(event.sentiment)}`}
          >
            {formatSentiment(event.sentiment)}
          </span>
        </div>
      </div>
    </Link>
  );
}
