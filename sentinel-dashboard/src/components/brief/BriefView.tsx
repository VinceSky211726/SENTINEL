import Link from "next/link";
import type { BriefStats } from "@/lib/types";
import { formatSentiment, sentimentClass, eventTitle } from "@/lib/utils";

export function BriefView({ stats }: { stats: BriefStats }) {
  const today = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="animate-fade pb-2">
      <div className="mb-3 rounded-[15px] border border-line bg-gradient-to-br from-panel2 to-panel p-4">
        <h2 className="text-[17px] font-semibold">Brief du matin</h2>
        <div className="mb-3.5 mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted">
          {today} · {new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
        </div>
        <div className="mb-2.5 flex items-baseline gap-2.5">
          <span
            className={`font-mono text-[32px] font-semibold ${sentimentClass(stats.avgSentiment)}`}
          >
            {formatSentiment(stats.avgSentiment)}
          </span>
          <span className="text-[11px] leading-snug text-muted">
            sentiment global
            <br />
            du portefeuille
          </span>
        </div>
      </div>

      <section className="mb-3">
        <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
          À surveiller aujourd&apos;hui
        </div>
        {stats.watchItems.length === 0 ? (
          <p className="rounded-xl border border-line bg-panel p-3 text-xs text-muted">
            Aucune alerte non lue à fort impact.
          </p>
        ) : (
          stats.watchItems.map((item, i) => (
            <Link
              key={item.id}
              href={`/alert/${item.id}`}
              className="mb-2 flex gap-2.5 rounded-xl border border-line bg-panel p-3 active:scale-[0.99]"
            >
              <span className="shrink-0 font-mono text-xs text-signal">
                {String(i + 1).padStart(2, "0")}
              </span>
              <p className="text-[11.5px] leading-relaxed text-ice/90">
                <b className="text-white">{item.symbol}</b> — {eventTitle(item)}
              </p>
            </Link>
          ))
        )}
      </section>

      {stats.calmSymbols.length > 0 ? (
        <section className="mb-3">
          <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
            Rien à signaler
          </div>
          <div className="flex flex-wrap gap-1.5">
            {stats.calmSymbols.map((sym) => (
              <span
                key={sym}
                className="rounded-md border border-line bg-panel px-2 py-1 font-mono text-[10px] text-muted"
              >
                {sym}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <div className="flex items-center gap-3 rounded-xl border border-line bg-panel px-3 py-3">
        <div className="min-w-0 flex-1">
          <b className="block text-[12.5px] font-medium">Pipeline du jour</b>
          <span className="text-[10.5px] leading-snug text-muted">
            {stats.filteredToday} items filtrés · {stats.alertsToday} alertes
            · 0,00 € consommés
          </span>
        </div>
      </div>
    </div>
  );
}
