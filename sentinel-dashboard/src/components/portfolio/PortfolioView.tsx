"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import {
  buildArbitrages,
  contagionForSymbol,
} from "@/lib/arbitrage";
import { computeSymbolSentiment } from "@/lib/sentiment";
import type { PortfolioRow, SentinelEvent } from "@/lib/types";
import {
  alertsPerWeekEstimate,
  formatSentiment,
  sentimentClass,
} from "@/lib/utils";
import { InfoButton } from "@/components/tutorial/TutorialSheet";
import { useAppShell } from "@/components/shell/AppProviders";
import {
  ArbitrageHeader,
  ArbitrageList,
} from "@/components/portfolio/ArbitrageList";
import { AddPortfolioSheet } from "@/components/portfolio/AddPortfolioSheet";

function Sparkline({
  values,
  sentiment,
}: {
  values: number[];
  sentiment: number | null;
}) {
  const data = values.length > 0 ? values : [30, 30, 30, 30, 30, 30, 30];
  const colored = sentiment != null;
  return (
    <div className="flex h-5 flex-1 items-end gap-0.5">
      {data.map((h, i) => {
        const last = i === data.length - 1;
        const height = `${Math.max(12, Math.min(100, h))}%`;
        if (last && colored) {
          const bg = sentiment < 0 ? "var(--down)" : "var(--up)";
          return (
            <span
              key={i}
              className="block flex-1 rounded-[1.5px]"
              style={{ height, background: bg }}
            />
          );
        }
        return (
          <span
            key={i}
            className="block flex-1 rounded-[1.5px] bg-ice/40"
            style={{ height }}
          />
        );
      })}
    </div>
  );
}

const SPARK_LEN = 7;

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className={`relative h-[19px] w-[34px] shrink-0 rounded-full transition-colors ${
        on ? "bg-ice" : "bg-line"
      }`}
    >
      <span
        className={`absolute top-0.5 h-[15px] w-[15px] rounded-full transition-all ${
          on ? "left-[17px] bg-deep" : "left-0.5 bg-muted"
        }`}
      />
    </button>
  );
}

export function PortfolioView({
  initialRows,
  events,
}: {
  initialRows: PortfolioRow[];
  events: SentinelEvent[];
}) {
  const router = useRouter();
  const { openAddSheet, showToast } = useAppShell();
  const [rows, setRows] = useState(initialRows);

  const portfolioSymbols = useMemo(
    () => new Set(rows.map((r) => r.symbol)),
    [rows]
  );

  const arbitrages = useMemo(
    () => buildArbitrages(events, rows),
    [events, rows]
  );

  const displayRows = useMemo(
    () =>
      rows.map((row) => {
        if (
          row.sentiment_score != null &&
          row.sentiment_spark.length >= SPARK_LEN
        ) {
          return row;
        }
        const computed = computeSymbolSentiment(row.symbol, events);
        return {
          ...row,
          sentiment_score: row.sentiment_score ?? computed.score,
          sentiment_spark:
            row.sentiment_spark.length > 0
              ? row.sentiment_spark
              : computed.spark,
        };
      }),
    [rows, events]
  );

  const activeArbs = arbitrages.filter((a) => {
    const line = rows.find((r) => r.symbol === a.symbol);
    return line?.is_active;
  });

  const updateRow = async (
    id: string,
    patch: Partial<
      Pick<PortfolioRow, "alert_threshold" | "is_active" | "alerts_per_week_est">
    >
  ) => {
    const supabase = createBrowserClient();
    await supabase
      .from("portfolio")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
  };

  const handleThreshold = (id: string, value: number) => {
    const est = alertsPerWeekEstimate(value);
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, alert_threshold: value, alerts_per_week_est: est }
          : r
      )
    );
  };

  const commitThreshold = (row: PortfolioRow) => {
    updateRow(row.id, {
      alert_threshold: row.alert_threshold,
      alerts_per_week_est: row.alerts_per_week_est,
    });
    showToast(
      `${row.symbol} : seuil ${row.alert_threshold} · environ ${row.alerts_per_week_est ?? alertsPerWeekEstimate(row.alert_threshold)} alertes par semaine.`
    );
  };

  const toggleActive = (id: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const next = !r.is_active;
        updateRow(id, { is_active: next });
        showToast(
          next
            ? `${r.symbol} réactivé.`
            : `${r.symbol} mis en pause — plus aucune notification.`
        );
        return { ...r, is_active: next };
      })
    );
  };

  return (
    <div className="animate-fade pb-2">
      <div className="mb-3.5 flex items-baseline justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Portefeuille</h2>
        <button
          type="button"
          onClick={openAddSheet}
          className="font-mono text-[10px] tracking-[0.08em] text-signal"
        >
          + AJOUTER
        </button>
      </div>

      <ArbitrageHeader count={activeArbs.length} />
      <ArbitrageList items={activeArbs} events={events} />

      <div className="mb-2 mt-4 font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
        Lignes suivies
      </div>

      {displayRows.map((row) => {
        const est =
          row.alerts_per_week_est ?? alertsPerWeekEstimate(row.alert_threshold);
        const contagion = contagionForSymbol(
          row.symbol,
          events,
          portfolioSymbols
        );

        return (
          <div
            key={row.id}
            className={`mb-2 rounded-[13px] border border-line bg-panel p-3 transition-opacity ${
              row.is_active ? "" : "opacity-40"
            }`}
          >
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded bg-line px-1.5 py-0.5 font-mono text-[11px] font-semibold text-ice">
                {row.symbol}
              </span>
              <span className="text-[12.5px] font-medium">{row.name}</span>
              <span className="ml-auto font-mono text-[11px] text-muted">
                {row.weight_pct} %
              </span>
              <Toggle
                on={row.is_active}
                onToggle={() => toggleActive(row.id)}
              />
            </div>

            <div className="mb-2.5 flex items-center gap-2.5">
              <Sparkline
                values={row.sentiment_spark}
                sentiment={row.sentiment_score}
              />
              <span
                className={`w-[46px] text-right font-mono text-[11px] font-semibold ${sentimentClass(row.sentiment_score)}`}
              >
                {formatSentiment(row.sentiment_score)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="flex w-[74px] shrink-0 items-center font-mono text-[9px] text-muted">
                SEUIL {row.alert_threshold}
                <InfoButton term="thr" />
              </span>
              <input
                type="range"
                min={20}
                max={95}
                value={row.alert_threshold}
                onChange={(e) =>
                  handleThreshold(row.id, Number(e.target.value))
                }
                onMouseUp={() => commitThreshold(row)}
                onTouchEnd={() => commitThreshold(row)}
                className="flex-1"
              />
              <span className="w-[52px] shrink-0 text-right font-mono text-[9px] text-ice">
                ≈{est}/sem
              </span>
            </div>

            <div
              className={`mt-1.5 flex items-center gap-1 border-t border-line pt-1.5 font-mono text-[9px] ${
                contagion.length ? "text-muted" : "text-muted opacity-45"
              }`}
            >
              <span className="shrink-0 text-[#7A5A2C]">↝</span>
              {contagion.length ? (
                <>
                  Contagion détectée avec{" "}
                  <b className="font-semibold text-ice">
                    {contagion.join(", ")}
                  </b>
                </>
              ) : (
                "Aucune contagion détectée sur cette ligne"
              )}
              <InfoButton term="cont" />
            </div>
          </div>
        );
      })}

      <AddPortfolioSheet
        existingSymbols={rows.map((r) => r.symbol)}
        onAdded={() => router.refresh()}
      />
    </div>
  );
}
