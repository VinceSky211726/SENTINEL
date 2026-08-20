"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import type { CompressionStats, PortfolioRow, SentinelEvent } from "@/lib/types";
import { EVENT_FEED_SELECT, isFeedReady } from "@/lib/types";
import { CompressionBanner } from "./CompressionBanner";
import {
  FilterChips,
  matchesFilter,
  type FeedFilter,
} from "./FilterChips";
import { AlertCard } from "./AlertCard";

function normalizeRow(row: Record<string, unknown>): SentinelEvent {
  return {
    ...(row as unknown as SentinelEvent),
    sources: Array.isArray(row.sources)
      ? (row.sources as SentinelEvent["sources"])
      : [],
    sentiment: row.sentiment != null ? Number(row.sentiment) : null,
    impact_score: row.impact_score != null ? Number(row.impact_score) : null,
  };
}

export function AlertFeed({
  initialEvents,
  portfolio,
  compression,
  typeKeys,
  alertsAboveThreshold,
}: {
  initialEvents: SentinelEvent[];
  portfolio: PortfolioRow[];
  compression: CompressionStats;
  typeKeys: { key: string; label: string }[];
  alertsAboveThreshold: number;
}) {
  const [events, setEvents] = useState(initialEvents);
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setEvents(initialEvents);
  }, [initialEvents]);

  const portfolioBySymbol = useMemo(() => {
    const map = new Map<string, PortfolioRow>();
    portfolio.forEach((p) => map.set(p.symbol, p));
    return map;
  }, [portfolio]);

  const visible = useMemo(
    () => events.filter((e) => matchesFilter(filter, e)),
    [events, filter]
  );

  const prependEvent = useCallback((row: SentinelEvent) => {
    setEvents((prev) => {
      if (prev.some((e) => e.id === row.id)) {
        return prev.map((e) => (e.id === row.id ? row : e));
      }
      return [row, ...prev];
    });
    setFreshIds((prev) => new Set(prev).add(row.id));
    window.setTimeout(() => {
      setFreshIds((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
    }, 500);
  }, []);

  useEffect(() => {
    const supabase = createBrowserClient();
    const channel = supabase
      .channel("feed-events")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "events" },
        (payload) => {
          const row = normalizeRow(payload.new as Record<string, unknown>);
          if (isFeedReady(row)) prependEvent(row);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "events" },
        (payload) => {
          const row = normalizeRow(payload.new as Record<string, unknown>);
          if (isFeedReady(row)) prependEvent(row);
          else {
            setEvents((prev) => prev.filter((e) => e.id !== row.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [prependEvent]);

  return (
    <div className="animate-fade">
      <CompressionBanner
        stats={compression}
        alertsAboveThreshold={alertsAboveThreshold}
      />
      <FilterChips active={filter} onChange={setFilter} typeKeys={typeKeys} />

      {visible.length === 0 ? (
        <div className="px-5 py-11 text-center text-muted">
          <div className="mb-3 text-[26px] opacity-50">◆</div>
          <b className="mb-1.5 block text-[13.5px] font-medium text-ice">
            Rien ne passe ce filtre
          </b>
          <p className="text-xs leading-relaxed">
            Le fil ne se remplit que si un événement dépasse tes critères.
          </p>
        </div>
      ) : (
        visible.map((event) => (
          <AlertCard
            key={event.id}
            event={event}
            portfolio={portfolioBySymbol.get(event.symbol)}
            fresh={freshIds.has(event.id)}
          />
        ))
      )}
    </div>
  );
}

export { EVENT_FEED_SELECT };
