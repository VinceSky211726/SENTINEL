import type { PortfolioRow, SentinelEvent } from "./types";
import { eventSummary, eventTitle } from "./utils";

export type ArbActionClass = "buy" | "hold" | "trim" | "take";

export type ArbitrageSuggestion = {
  id: string;
  symbol: string;
  eventId: string;
  action: string;
  actionClass: ArbActionClass;
  confidence: 1 | 2 | 3;
  confidenceLabel: string;
  teaser: string;
  chain: [string, string][];
  caveat: string;
  sourceEvent: SentinelEvent;
};

function confidenceLevel(pct: number | null): 1 | 2 | 3 {
  if ((pct ?? 0) >= 80) return 3;
  if ((pct ?? 0) >= 60) return 2;
  return 1;
}

function confidenceLabel(level: 1 | 2 | 3): string {
  if (level === 3) return "Élevée";
  if (level === 2) return "Modérée";
  return "Faible";
}

function suggestAction(
  event: SentinelEvent,
  line: PortfolioRow
): { action: string; actionClass: ArbActionClass } {
  const sent = event.sentiment ?? 0;
  const impact = event.impact_score ?? 0;
  const short = line.position_side === "short";

  if (impact < 40) {
    return { action: "Maintien", actionClass: "hold" };
  }

  if (short) {
    if (sent <= -0.15) return { action: "Renforcement", actionClass: "buy" };
    if (sent >= 0.15) return { action: "Allègement", actionClass: "trim" };
    return { action: "Maintien", actionClass: "hold" };
  }

  if (sent >= 0.25 && impact >= 55) {
    return { action: "Renforcement", actionClass: "buy" };
  }
  if (sent <= -0.25 && impact >= 55) {
    return { action: "Allègement", actionClass: "trim" };
  }
  if (sent >= 0.1 && impact < 55) {
    return { action: "Prise de bénéfices", actionClass: "take" };
  }
  return { action: "Maintien", actionClass: "hold" };
}

function buildChain(
  event: SentinelEvent,
  line: PortfolioRow
): [string, string][] {
  const rationale = event.scoring_rationale || eventSummary(event);
  const parts = rationale.split(/(?<=[.!?])\s+/).filter(Boolean);

  return [
    [
      "Événement déclencheur",
      eventTitle(event),
    ],
    [
      "Mécanisme",
      parts[0] || eventSummary(event) || "Signal détecté par le pipeline Sentinel.",
    ],
    [
      "Lecture sur ta position",
      parts.slice(1).join(" ") ||
        `${line.symbol} (${line.weight_pct} % du portefeuille, ${line.position_side}) — impact ${event.impact_score ?? "?"}/100.`,
    ],
  ];
}

export function buildArbitrages(
  events: SentinelEvent[],
  portfolio: PortfolioRow[]
): ArbitrageSuggestion[] {
  const active = portfolio.filter((p) => p.is_active);
  const bySymbol = new Map(active.map((p) => [p.symbol, p]));
  const suggestions: ArbitrageSuggestion[] = [];

  const candidates = events
    .filter((e) => e.llm_processed !== false && (e.impact_score ?? 0) >= 35)
    .sort((a, b) => (b.impact_score ?? 0) - (a.impact_score ?? 0));

  for (const event of candidates) {
    const targets = new Set<string>();

    if (bySymbol.has(event.symbol)) targets.add(event.symbol);
    if (
      event.contagion_symbol &&
      event.contagion_symbol !== "—" &&
      bySymbol.has(event.contagion_symbol)
    ) {
      targets.add(event.contagion_symbol);
    }

    for (const sym of Array.from(targets)) {
      const line = bySymbol.get(sym);
      if (!line) continue;

      const { action, actionClass } = suggestAction(event, line);
      const conf = confidenceLevel(event.confidence_pct);

      suggestions.push({
        id: `${event.id}-${sym}`,
        symbol: sym,
        eventId: event.id,
        action,
        actionClass,
        confidence: conf,
        confidenceLabel: confidenceLabel(conf),
        teaser: eventSummary(event).slice(0, 160) || eventTitle(event),
        chain: buildChain(event, line),
        caveat:
          event.scoring_rationale?.split(/(?<=[.!?])\s+/).slice(-1)[0] ||
          "Lecture indicative — vérifie les sources primaires avant d'agir.",
        sourceEvent: event,
      });
    }
  }

  const seen = new Set<string>();
  return suggestions.filter((s) => {
    if (seen.has(s.symbol)) return false;
    seen.add(s.symbol);
    return true;
  });
}

export function contagionForSymbol(
  symbol: string,
  events: SentinelEvent[],
  portfolioSymbols: Set<string>
): string[] {
  const out = new Set<string>();

  for (const ev of events) {
    if (
      ev.symbol === symbol &&
      ev.contagion_symbol &&
      ev.contagion_symbol !== "—" &&
      portfolioSymbols.has(ev.contagion_symbol)
    ) {
      out.add(ev.contagion_symbol);
    }
    if (
      ev.contagion_symbol === symbol &&
      ev.symbol !== symbol &&
      portfolioSymbols.has(ev.symbol)
    ) {
      out.add(ev.symbol);
    }
  }

  return Array.from(out);
}
