import {
  fetchCompressionStats,
  fetchEventTypeKeys,
  fetchFeedEvents,
  fetchPortfolio,
} from "@/lib/queries";
import { compressionRatioLabel } from "@/lib/utils";
import { AlertFeed } from "@/components/feed/AlertFeed";

export default async function HomePage() {
  try {
    const [events, portfolio, compression, typeKeys] = await Promise.all([
      fetchFeedEvents(),
      fetchPortfolio(),
      fetchCompressionStats(),
      fetchEventTypeKeys(),
    ]);

    const portfolioBySymbol = new Map(portfolio.map((p) => [p.symbol, p]));
    const alertsAbove = events.filter((e) => {
      const line = portfolioBySymbol.get(e.symbol);
      return (
        line?.is_active &&
        (e.impact_score ?? 0) >= line.alert_threshold
      );
    }).length;

    return (
      <AlertFeed
        initialEvents={events}
        portfolio={portfolio}
        compression={{
          ...compression,
          ratioLabel: compressionRatioLabel(
            compression.rawToday,
            alertsAbove
          ),
        }}
        alertsAboveThreshold={alertsAbove}
        typeKeys={typeKeys}
      />
    );
  } catch (err) {
    return (
      <div className="rounded-[14px] border border-signal/40 bg-panel p-4 text-sm text-ice">
        <p className="font-semibold text-signal">Connexion Supabase impossible</p>
        <p className="mt-2 text-muted">
          Vérifie{" "}
          <code className="text-ice">NEXT_PUBLIC_SUPABASE_URL</code> et{" "}
          <code className="text-ice">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> dans{" "}
          <code className="text-ice">.env.local</code>.
        </p>
        <p className="mt-2 font-mono text-[10px] text-muted">
          {err instanceof Error ? err.message : "Erreur inconnue"}
        </p>
      </div>
    );
  }
}
