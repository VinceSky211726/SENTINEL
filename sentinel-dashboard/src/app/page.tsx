import {
  fetchCompressionStats,
  fetchEventTypeKeys,
  fetchFeedEvents,
  fetchPortfolio,
} from "@/lib/queries";
import { compressionRatioLabel, countAlertsAboveThreshold, startOfTodayIso } from "@/lib/utils";
import { AlertFeed } from "@/components/feed/AlertFeed";

export default async function HomePage() {
  try {
    const [events, portfolio, compression, typeKeys] = await Promise.all([
      fetchFeedEvents(),
      fetchPortfolio(),
      fetchCompressionStats(),
      fetchEventTypeKeys(),
    ]);

    const since = startOfTodayIso();
    const alertsAbove = countAlertsAboveThreshold(
      events.filter((e) => e.detected_at >= since),
      portfolio
    );

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
          <code className="text-ice">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{" "}
          (clé publishable <code className="text-ice">sb_publishable_…</code>, pas
          la service key) dans <code className="text-ice">.env.local</code>.
        </p>
        <p className="mt-2 font-mono text-[10px] text-muted">
          {err instanceof Error ? err.message : "Erreur inconnue"}
        </p>
      </div>
    );
  }
}
