"use client";

import { FormEvent, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { alertsPerWeekEstimate } from "@/lib/utils";
import { useAppShell } from "@/components/shell/AppProviders";

export function AddPortfolioSheet({
  existingSymbols,
  onAdded,
}: {
  existingSymbols: string[];
  onAdded: () => void;
}) {
  const { addSheetOpen, closeAddSheet, showToast } = useAppShell();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!addSheetOpen) return null;

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    const fd = new FormData(e.currentTarget);
    const sym = String(fd.get("symbol") || "")
      .trim()
      .toUpperCase();
    const name = String(fd.get("name") || "").trim();
    const weight = parseFloat(String(fd.get("weight") || ""));
    const threshold = parseInt(String(fd.get("threshold") || ""), 10);

    if (!sym || !name) {
      setError("Ticker et nom sont requis.");
      return;
    }
    if (existingSymbols.includes(sym)) {
      setError("Ce ticker est déjà suivi.");
      return;
    }
    if (!weight || weight <= 0 || weight > 100) {
      setError("Poids invalide (0–100).");
      return;
    }
    if (!threshold || threshold < 20 || threshold > 95) {
      setError("Seuil invalide (20–95).");
      return;
    }

    setSubmitting(true);
    const supabase = createBrowserClient();
    const sortOrder = existingSymbols.length + 1;
    const est = alertsPerWeekEstimate(threshold);

    const { error: dbError } = await supabase.from("portfolio").insert({
      symbol: sym,
      name,
      weight_pct: weight,
      alert_threshold: threshold,
      max_alerts_per_day: 3,
      alerts_per_week_est: est,
      is_active: true,
      sort_order: sortOrder,
      position_side: "long",
      news_query: name,
      finnhub_symbol: sym,
      sentiment_spark: [],
    });

    setSubmitting(false);

    if (dbError) {
      setError(dbError.message);
      return;
    }

    closeAddSheet();
    showToast(`${sym} ajouté au portefeuille.`);
    onAdded();
    e.currentTarget.reset();
  };

  return (
    <div
      className="absolute inset-0 z-[80] bg-[rgba(5,7,15,0.72)] backdrop-blur-[2px]"
      onClick={(ev) => {
        if (ev.target === ev.currentTarget) closeAddSheet();
      }}
    >
      <div className="absolute bottom-0 left-0 right-0 flex max-h-[86%] flex-col rounded-t-[22px] border border-line bg-deep">
        <div className="mx-auto mb-1 mt-2.5 h-1 w-9 shrink-0 rounded-full bg-line" />
        <div className="flex shrink-0 items-center justify-between px-5 pb-3 pt-2.5">
          <h2 className="text-[17px] font-semibold">Ajouter une ligne</h2>
          <button
            type="button"
            onClick={closeAddSheet}
            className="grid h-7 w-7 place-items-center rounded-[9px] bg-panel2 text-[13px] text-muted"
          >
            ✕
          </button>
        </div>
        <form
          onSubmit={submit}
          className="overflow-y-auto px-5 pb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div className="mb-3">
            <label className="mb-1.5 block font-mono text-[8.5px] uppercase tracking-[0.12em] text-muted">
              Ticker
            </label>
            <input
              name="symbol"
              maxLength={8}
              placeholder="ex : MC, AAPL, AI.PA"
              className="w-full rounded-[10px] border border-line bg-panel px-3 py-2.5 text-[13px] text-white outline-none focus:border-ice"
            />
          </div>
          <div className="mb-3">
            <label className="mb-1.5 block font-mono text-[8.5px] uppercase tracking-[0.12em] text-muted">
              Nom de la société
            </label>
            <input
              name="name"
              placeholder="ex : LVMH"
              className="w-full rounded-[10px] border border-line bg-panel px-3 py-2.5 text-[13px] text-white outline-none focus:border-ice"
            />
          </div>
          <div className="mb-3 flex gap-2">
            <div className="flex-1">
              <label className="mb-1.5 block font-mono text-[8.5px] uppercase tracking-[0.12em] text-muted">
                Poids dans le portefeuille
              </label>
              <input
                name="weight"
                type="number"
                min={0}
                max={100}
                step={0.5}
                placeholder="%"
                className="w-full rounded-[10px] border border-line bg-panel px-3 py-2.5 text-[13px] text-white outline-none focus:border-ice"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1.5 block font-mono text-[8.5px] uppercase tracking-[0.12em] text-muted">
                Seuil d&apos;alerte initial
              </label>
              <input
                name="threshold"
                type="number"
                min={20}
                max={95}
                defaultValue={70}
                className="w-full rounded-[10px] border border-line bg-panel px-3 py-2.5 text-[13px] text-white outline-none focus:border-ice"
              />
            </div>
          </div>
          {error ? (
            <p className="mb-2 text-[10.5px] text-signal">{error}</p>
          ) : null}
          <button
            type="submit"
            disabled={submitting}
            className="mt-1 w-full rounded-xl bg-ice py-3 text-center text-[13px] font-semibold text-deep active:scale-[0.98] disabled:opacity-60"
          >
            {submitting ? "Ajout…" : "Ajouter au portefeuille"}
          </button>
          <p className="mt-2.5 text-center text-[10px] leading-relaxed text-muted">
            La ligne apparaît sans historique — sentiment et arbitrages se
            construisent au fil des événements captés.
          </p>
        </form>
      </div>
    </div>
  );
}
