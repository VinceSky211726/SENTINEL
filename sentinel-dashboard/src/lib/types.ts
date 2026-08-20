export type EventSource = {
  url?: string;
  name?: string;
  authority?: string;
  detected_at?: string;
};

export type SentinelEvent = {
  id: string;
  symbol: string;
  event_type: string | null;
  event_type_key: string | null;
  title: string | null;
  summary: string | null;
  body: string | null;
  scoring_rationale: string | null;
  impact_score: number | null;
  sentiment: number | null;
  confidence_pct: number | null;
  horizon: string | null;
  contagion_symbol: string | null;
  sources: EventSource[];
  is_read: boolean;
  filter_passed: boolean;
  llm_processed?: boolean;
  published_at: string | null;
  detected_at: string;
  created_at: string;
};

export type PortfolioRow = {
  id: string;
  symbol: string;
  name: string;
  weight_pct: number;
  alert_threshold: number;
  is_active: boolean;
  sentiment_score: number | null;
  sentiment_spark: number[];
  alerts_per_week_est: number | null;
  position_side: string;
  sort_order: number;
};

export type SourceRegistryRow = {
  id: string;
  source_key: string;
  name: string;
  poll_interval_minutes: number;
  is_active: boolean;
  is_paused: boolean;
  last_error_message: string | null;
};

export type FeedbackVerdict = "relevant" | "noise" | "opened";

export type CompressionStats = {
  rawToday: number;
  passedToday: number;
  ratioLabel: string;
};

export type BriefStats = {
  avgSentiment: number | null;
  watchItems: SentinelEvent[];
  calmSymbols: string[];
  filteredToday: number;
  alertsToday: number;
};

export const EVENT_FEED_SELECT =
  "id, symbol, event_type, event_type_key, title, summary, body, scoring_rationale, impact_score, sentiment, confidence_pct, horizon, contagion_symbol, sources, is_read, filter_passed, published_at, detected_at, created_at";
