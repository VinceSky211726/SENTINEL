import { createServerClient } from "./supabase/server";
import type {
  BriefStats,
  CompressionStats,
  PortfolioRow,
  SentinelEvent,
  SourceRegistryRow,
} from "./types";
import { EVENT_FEED_SELECT } from "./types";
import { compressionRatioLabel, startOfTodayIso } from "./utils";

export async function fetchFeedEvents(): Promise<SentinelEvent[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("events")
    .select(EVENT_FEED_SELECT)
    .eq("filter_passed", true)
    .order("impact_score", { ascending: false });

  if (error) throw error;
  return normalizeEvents(data ?? []);
}

export async function fetchEventById(id: string): Promise<SentinelEvent | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("events")
    .select(EVENT_FEED_SELECT)
    .eq("id", id)
    .eq("filter_passed", true)
    .maybeSingle();

  if (error) throw error;
  return data ? normalizeEvent(data) : null;
}

export async function fetchPortfolio(): Promise<PortfolioRow[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("portfolio")
    .select(
      "id, symbol, name, weight_pct, alert_threshold, is_active, sentiment_score, sentiment_spark, alerts_per_week_est, position_side, sort_order"
    )
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(normalizePortfolio);
}

export async function fetchSources(): Promise<SourceRegistryRow[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("source_registry")
    .select("id, source_key, name, poll_interval_minutes, is_active, is_paused, last_error_message")
    .order("name");

  if (error) throw error;
  return (data ?? []) as SourceRegistryRow[];
}

export async function fetchUnreadCount(): Promise<number> {
  const supabase = createServerClient();
  const { count, error } = await supabase
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("filter_passed", true)
    .eq("is_read", false);

  if (error) throw error;
  return count ?? 0;
}

export async function fetchCompressionStats(): Promise<CompressionStats> {
  const supabase = createServerClient();
  const since = startOfTodayIso();

  const [rawRes, passedRes] = await Promise.all([
    supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .gte("detected_at", since),
    supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("filter_passed", true)
      .gte("detected_at", since),
  ]);

  const rawToday = rawRes.count ?? 0;
  const passedToday = passedRes.count ?? 0;

  return {
    rawToday,
    passedToday,
    ratioLabel: compressionRatioLabel(rawToday, passedToday),
  };
}

export async function fetchBriefStats(
  portfolio: PortfolioRow[]
): Promise<BriefStats> {
  const supabase = createServerClient();
  const since = startOfTodayIso();

  const [todayEventsRes, watchRes, filteredRes, alertsRes] = await Promise.all([
    supabase
      .from("events")
      .select("sentiment")
      .eq("filter_passed", true)
      .gte("detected_at", since)
      .not("sentiment", "is", null),
    supabase
      .from("events")
      .select(EVENT_FEED_SELECT)
      .eq("filter_passed", true)
      .eq("is_read", false)
      .gte("impact_score", 40)
      .order("impact_score", { ascending: false })
      .limit(5),
    supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("filter_passed", false)
      .gte("detected_at", since),
    supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("filter_passed", true)
      .eq("notified", true)
      .gte("notified_at", since),
  ]);

  const sentiments = (todayEventsRes.data ?? [])
    .map((r) => Number(r.sentiment))
    .filter((n) => !Number.isNaN(n));

  const avgSentiment =
    sentiments.length > 0
      ? sentiments.reduce((a, b) => a + b, 0) / sentiments.length
      : null;

  const activeSymbols = new Set(
    portfolio.filter((p) => p.is_active).map((p) => p.symbol)
  );
  const alertedSymbols = new Set(
    (watchRes.data ?? []).map((e) => e.symbol as string)
  );
  const calmSymbols = Array.from(activeSymbols).filter(
    (s) => !alertedSymbols.has(s)
  );

  return {
    avgSentiment,
    watchItems: normalizeEvents(watchRes.data ?? []),
    calmSymbols,
    filteredToday: filteredRes.count ?? 0,
    alertsToday: alertsRes.count ?? 0,
  };
}

export async function fetchArbitrageEvents(): Promise<SentinelEvent[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("events")
    .select(EVENT_FEED_SELECT)
    .eq("filter_passed", true)
    .eq("llm_processed", true)
    .gte("impact_score", 35)
    .order("impact_score", { ascending: false })
    .limit(50);

  if (error) throw error;
  return normalizeEvents(data ?? []);
}

export async function fetchEventTypeKeys(): Promise<
  { key: string; label: string }[]
> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("events")
    .select("event_type_key, event_type")
    .eq("filter_passed", true)
    .not("event_type_key", "is", null);

  if (error) throw error;

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    const key = row.event_type_key as string | null;
    const label = row.event_type as string | null;
    if (key) {
      map.set(key, label || key);
    }
  }
  return Array.from(map.entries())
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));
}

function normalizeEvents(rows: Record<string, unknown>[]): SentinelEvent[] {
  return rows.map(normalizeEvent);
}

function normalizeEvent(row: Record<string, unknown>): SentinelEvent {
  return {
    ...(row as unknown as SentinelEvent),
    sources: Array.isArray(row.sources) ? (row.sources as SentinelEvent["sources"]) : [],
    sentiment: row.sentiment != null ? Number(row.sentiment) : null,
    impact_score: row.impact_score != null ? Number(row.impact_score) : null,
  };
}

function normalizePortfolio(row: Record<string, unknown>): PortfolioRow {
  const spark = row.sentiment_spark;
  return {
    ...(row as unknown as PortfolioRow),
    weight_pct: Number(row.weight_pct),
    alert_threshold: Number(row.alert_threshold),
    sentiment_score:
      row.sentiment_score != null ? Number(row.sentiment_score) : null,
    sentiment_spark: Array.isArray(spark) ? spark.map(Number) : [],
    alerts_per_week_est:
      row.alerts_per_week_est != null
        ? Number(row.alerts_per_week_est)
        : null,
  };
}
