import type { SentinelEvent } from "./types";

const SPARK_LEN = 7;

/** Hauteur de barre spark (14–100) à partir d'un sentiment −1…+1. */
export function sentimentToBarHeight(sentiment: number): number {
  return Math.round(14 + ((sentiment + 1) / 2) * 86);
}

export function computeSymbolSentiment(
  symbol: string,
  events: SentinelEvent[]
): { score: number | null; spark: number[] } {
  const recent = events
    .filter((e) => e.symbol === symbol && e.sentiment != null)
    .sort(
      (a, b) =>
        new Date(a.detected_at).getTime() - new Date(b.detected_at).getTime()
    )
    .slice(-SPARK_LEN);

  if (recent.length === 0) {
    return { score: null, spark: [] };
  }

  const values = recent.map((e) => e.sentiment!);
  const score = values.reduce((a, b) => a + b, 0) / values.length;
  const spark = values.map(sentimentToBarHeight);

  while (spark.length < SPARK_LEN) {
    spark.unshift(30);
  }

  return { score, spark };
}

export type SignalConsensus = {
  buy: number;
  hold: number;
  sell: number;
  total: number;
  upsidePct: number;
};

/** Barre consensus dérivée des events (proxy buy/hold/sell sur le sentiment). */
export function computeSignalConsensus(
  symbol: string,
  events: SentinelEvent[],
  sourceEvent?: SentinelEvent
): SignalConsensus {
  const relevant = events.filter(
    (e) =>
      (e.symbol === symbol || e.contagion_symbol === symbol) &&
      e.sentiment != null
  );

  let buy = 0;
  let hold = 0;
  let sell = 0;

  for (const e of relevant) {
    const s = e.sentiment!;
    if (s > 0.1) buy += 1;
    else if (s < -0.1) sell += 1;
    else hold += 1;
  }

  const total = buy + hold + sell;

  const upsidePct = sourceEvent
    ? impliedMovePct(sourceEvent)
    : relevant.length > 0
      ? relevant.reduce(
          (acc, e) => acc + (e.sentiment! * (e.impact_score ?? 50)),
          0
        ) /
        relevant.length /
        4
      : 0;

  return { buy, hold, sell, total: total || 1, upsidePct };
}

/** Mouvement implicite (%) à partir du sentiment × impact de l'event source. */
export function impliedMovePct(event: SentinelEvent): number {
  const sentiment = event.sentiment ?? 0;
  const impact = (event.impact_score ?? 50) / 100;
  return sentiment * impact * 25;
}

export function formatMovePct(value: number): string {
  const sign = value >= 0 ? "+" : "−";
  return `${sign}${Math.abs(value).toFixed(1).replace(".", ",")} %`;
}
