"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase/client";
import type { FeedbackVerdict, PortfolioRow, SentinelEvent } from "@/lib/types";
import { ImpactRing } from "@/components/feed/AlertCard";
import { useAppShell } from "@/components/shell/AppProviders";
import { InfoButton } from "@/components/tutorial/TutorialSheet";
import {
  formatAgo,
  formatSentiment,
  formatSourceTime,
  sentimentClass,
  eventContagionSymbols,
} from "@/lib/utils";

export function AlertDetail({
  event,
  portfolio,
}: {
  event: SentinelEvent;
  portfolio: PortfolioRow | null;
}) {
  const [verdict, setVerdict] = useState<FeedbackVerdict | null>(null);
  const { showToast } = useAppShell();

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase
      .from("events")
      .update({ is_read: true, updated_at: new Date().toISOString() })
      .eq("id", event.id)
      .then();
  }, [event.id]);

  const submitFeedback = async (v: FeedbackVerdict) => {
    const supabase = createBrowserClient();
    const { error } = await supabase.from("feedback").upsert(
      {
        event_id: event.id,
        verdict: v,
        source_weights_adjusted: v === "relevant",
      },
      { onConflict: "event_id,verdict" }
    );

    if (error) {
      showToast("Erreur lors de l'enregistrement du feedback.");
    } else {
      setVerdict(v);
      showToast(
        v === "relevant"
          ? "Noté. Le poids de ces sources augmente."
          : "Noté. Ce type d'événement sera moins prioritaire."
      );
    }
  };

  const body = event.body || event.summary || "";
  const sources = event.sources ?? [];

  return (
    <div className="animate-fade pb-2">
      <Link
        href="/"
        className="mb-3.5 flex items-center gap-1.5 text-xs text-muted active:text-ice"
      >
        ← Retour au fil · {formatAgo(event.published_at || event.detected_at)}
      </Link>

      <div className="mb-3 rounded-2xl border border-line bg-panel2 p-4">
        <div className="mb-3 flex items-center gap-3">
          <ImpactRing score={event.impact_score} size="lg" />
          <div>
            <div className="text-[15px] font-semibold">
              {portfolio ? `${portfolio.name} · ${event.symbol}` : event.symbol}
            </div>
            <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-signal">
              {event.event_type || "—"} — {event.horizon || "—"}
              <InfoButton term="type" />
            </div>
          </div>
        </div>
        <p className="text-xs leading-relaxed text-ice/85">{body}</p>
        <p className="mt-2 text-[10.5px] opacity-60">
          Score d&apos;impact <InfoButton term="impact" /> — voir le tutoriel
          pour l&apos;interprétation.
        </p>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <Stat
          label="Sentiment"
          term="senti"
          value={formatSentiment(event.sentiment)}
          className={sentimentClass(event.sentiment)}
        />
        <Stat
          label="Confiance"
          term="conf"
          value={
            event.confidence_pct != null ? `${event.confidence_pct} %` : "—"
          }
        />
        <Stat
          label="Ta position"
          term="pos"
          value={portfolio ? `${portfolio.weight_pct} %` : "—"}
        />
        <Stat
          label="Contagion"
          term="cont"
          value={
            eventContagionSymbols(event).join(", ") || "—"
          }
          small
        />
      </div>

      {event.mecanisme ? (
        <div className="mb-3 rounded-xl border border-line bg-panel p-3">
          <div className="mb-1.5 font-mono text-[8.5px] uppercase tracking-[0.14em] text-muted">
            Mécanisme
          </div>
          <p className="text-[11.5px] leading-relaxed text-ice/85">
            {event.mecanisme}
          </p>
        </div>
      ) : null}

      {event.lecture_position ? (
        <div className="mb-3 rounded-xl border border-line bg-panel p-3">
          <div className="mb-1.5 font-mono text-[8.5px] uppercase tracking-[0.14em] text-muted">
            Lecture sur ta position
          </div>
          <p className="text-[11.5px] leading-relaxed text-ice/85">
            {event.lecture_position}
          </p>
        </div>
      ) : null}

      {event.reserve ? (
        <div className="mb-3 rounded-xl border border-line bg-panel p-3">
          <div className="mb-1.5 font-mono text-[8.5px] uppercase tracking-[0.14em] text-muted">
            Réserve
          </div>
          <p className="text-[11.5px] leading-relaxed text-ice/85">
            {event.reserve}
          </p>
        </div>
      ) : null}

      {event.scoring_rationale ? (
        <div className="mb-3 rounded-xl border border-line bg-panel p-3">
          <div className="mb-1.5 font-mono text-[8.5px] uppercase tracking-[0.14em] text-muted">
            Pourquoi ce score
          </div>
          <p className="text-[11.5px] leading-relaxed text-ice/85">
            {event.scoring_rationale}
          </p>
        </div>
      ) : null}

      <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
        Sources · ordre de détection
      </div>
      {sources.length === 0 ? (
        <p className="mb-3 text-xs text-muted">Aucune source.</p>
      ) : (
        sources.map((src, i) => (
          <div
            key={`${src.url}-${i}`}
            className="mb-1.5 flex items-center gap-2 rounded-[10px] border border-line px-2.5 py-2 text-[11.5px]"
          >
            <span className="shrink-0 font-mono text-[9px] text-muted">
              {formatSourceTime(src.detected_at || event.detected_at)}
            </span>
            <span className="min-w-0 truncate">{src.name || src.authority || "Source"}</span>
            <span className="ml-auto shrink-0 font-mono text-[9px] text-muted">
              {src.authority || "—"}
            </span>
          </div>
        ))
      )}

      <div className="mb-1 mt-3.5 flex gap-2">
        <button
          type="button"
          onClick={() => submitFeedback("relevant")}
          className={`flex-1 rounded-[11px] border px-3 py-2.5 text-xs font-semibold transition active:scale-[0.97] ${
            verdict === "relevant"
              ? "border-up bg-up text-[#04170D]"
              : "border-line text-ice"
          }`}
        >
          {verdict === "relevant" ? "Noté ✓" : "Pertinent"}
        </button>
        <button
          type="button"
          onClick={() => submitFeedback("noise")}
          className={`flex-1 rounded-[11px] border px-3 py-2.5 text-xs font-semibold transition active:scale-[0.97] ${
            verdict === "noise"
              ? "border-line bg-line text-muted"
              : "border-line text-ice"
          }`}
        >
          {verdict === "noise" ? "Ignoré" : "Bruit"}
        </button>
        {sources[0]?.url ? (
          <a
            href={sources[0].url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 rounded-[11px] border border-ice bg-ice px-3 py-2.5 text-center text-xs font-semibold text-deep active:scale-[0.97]"
            onClick={() => submitFeedback("opened")}
          >
            Ouvrir
          </a>
        ) : null}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  className = "",
  small = false,
  term,
}: {
  label: string;
  value: string;
  className?: string;
  small?: boolean;
  term?: "senti" | "conf" | "pos" | "cont";
}) {
  return (
    <div className="rounded-xl border border-line bg-panel p-2.5">
      <div className="mb-1 font-mono text-[8.5px] uppercase tracking-[0.14em] text-muted">
        {label}
        {term ? <InfoButton term={term} /> : null}
      </div>
      <div
        className={`font-mono font-semibold ${small ? "pt-0.5 text-xs" : "text-base"} ${className}`}
      >
        {value}
      </div>
    </div>
  );
}
