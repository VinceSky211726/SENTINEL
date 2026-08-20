"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ArbitrageSuggestion } from "@/lib/arbitrage";
import {
  computeSignalConsensus,
  formatMovePct,
} from "@/lib/sentiment";
import type { SentinelEvent } from "@/lib/types";
import { InfoButton } from "@/components/tutorial/TutorialSheet";

const ACTION_STYLES: Record<
  ArbitrageSuggestion["actionClass"],
  string
> = {
  buy: "bg-[rgba(43,163,107,0.16)] text-up border border-[rgba(43,163,107,0.4)]",
  hold: "bg-line text-ice border border-line",
  trim: "bg-[rgba(232,84,47,0.14)] text-signal border border-[rgba(232,84,47,0.4)]",
  take: "bg-[rgba(200,160,60,0.14)] text-[#D9AE4E] border border-[rgba(200,160,60,0.4)]",
};

export function ArbitrageList({
  items,
  events,
}: {
  items: ArbitrageSuggestion[];
  events: SentinelEvent[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  const consensusById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeSignalConsensus>>();
    for (const arb of items) {
      map.set(
        arb.id,
        computeSignalConsensus(arb.symbol, events, arb.sourceEvent)
      );
    }
    return map;
  }, [items, events]);

  if (items.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-muted">
        <b className="mb-1 block text-ice">Aucun arbitrage suggéré</b>
        <p className="text-xs leading-relaxed">
          Le moteur ne propose une lecture que lorsqu&apos;un événement capté
          touche une ligne active.
        </p>
      </div>
    );
  }

  return (
    <>
      {items.map((arb) => {
        const open = openId === arb.id;
        const strong = arb.confidence === 3;
        const consensus = consensusById.get(arb.id)!;
        const buyPct = (consensus.buy / consensus.total) * 100;
        const holdPct = (consensus.hold / consensus.total) * 100;
        const sellPct = (consensus.sell / consensus.total) * 100;
        return (
          <div
            key={arb.id}
            role="button"
            tabIndex={0}
            onClick={() => setOpenId(open ? null : arb.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setOpenId(open ? null : arb.id);
            }}
            className={`mb-2.5 cursor-pointer rounded-[14px] border border-line p-3 transition active:scale-[0.99] ${
              strong ? "bg-panel2" : "bg-panel"
            }`}
          >
            <div className={`flex items-center gap-2 ${open ? "mb-2.5" : ""}`}>
              <span className="rounded bg-line px-1.5 py-0.5 font-mono text-[11px] font-semibold text-ice">
                {arb.symbol}
              </span>
              <span
                className={`whitespace-nowrap rounded-md px-2 py-1 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] ${ACTION_STYLES[arb.actionClass]}`}
              >
                {arb.action}
              </span>
              <span className="ml-auto flex items-center gap-1 font-mono text-[9px] text-muted">
                <span className="flex gap-0.5">
                  {[1, 2, 3].map((n) => (
                    <span
                      key={n}
                      className={`block h-[9px] w-1 rounded-[1px] ${
                        n <= arb.confidence ? "bg-ice" : "bg-line"
                      }`}
                    />
                  ))}
                </span>
                {arb.confidenceLabel}
                <span
                  className={`ml-2 inline-block text-[10px] transition-transform ${
                    open ? "rotate-180" : ""
                  }`}
                >
                  ▾
                </span>
              </span>
            </div>

            {!open ? (
              <>
                <p className="mt-2 line-clamp-2 text-[11px] leading-snug text-muted">
                  {arb.teaser}
                </p>
                <div className="mt-2 flex items-center gap-1.5 font-mono text-[9px] text-muted">
                  <span className="flex h-[3px] w-[46px] shrink-0 overflow-hidden rounded-full">
                    {buyPct > 0 ? (
                      <span
                        className="block h-full"
                        style={{
                          width: `${buyPct}%`,
                          background: "var(--up)",
                        }}
                      />
                    ) : null}
                    {holdPct > 0 ? (
                      <span
                        className="block h-full"
                        style={{
                          width: `${holdPct}%`,
                          background: "#4A63A8",
                        }}
                      />
                    ) : null}
                    {sellPct > 0 ? (
                      <span
                        className="block h-full"
                        style={{
                          width: `${sellPct}%`,
                          background: "var(--signal)",
                        }}
                      />
                    ) : null}
                  </span>
                  <span>
                    consensus {consensus.buy}/{consensus.total} achat
                  </span>
                  <span
                    className={`ml-auto font-semibold ${
                      consensus.upsidePct >= 0 ? "text-up" : "text-signal"
                    }`}
                  >
                    {formatMovePct(consensus.upsidePct)}
                  </span>
                </div>
              </>
            ) : null}

            <div
              className={`overflow-hidden transition-all duration-300 ${
                open ? "max-h-[900px] opacity-100" : "max-h-0 opacity-0"
              }`}
            >
              <div className="mb-2.5">
                {arb.chain.map(([label, text], i) => (
                  <div
                    key={label}
                    className={`flex gap-2 pb-2 ${i === arb.chain.length - 1 ? "pb-0" : ""}`}
                  >
                    <div className="flex w-[7px] shrink-0 flex-col items-center pt-1">
                      <b
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                          i === arb.chain.length - 1 ? "bg-signal" : "bg-muted"
                        }`}
                      />
                      {i < arb.chain.length - 1 ? (
                        <em className="mt-0.5 w-px flex-1 bg-line not-italic" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 font-mono text-[8px] uppercase tracking-[0.14em] text-muted">
                        {label}
                      </div>
                      <p className="text-[11.5px] leading-relaxed text-ice/90">
                        {text}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mb-2.5 text-[10.5px] leading-relaxed text-muted">
                <b className="font-medium text-ice">Réserve —</b> {arb.caveat}
              </p>
              <Link
                href={`/alert/${arb.eventId}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1.5 font-mono text-[9.5px] text-ice/75 active:opacity-100"
              >
                → Ouvrir l&apos;alerte source
              </Link>
            </div>
          </div>
        );
      })}
    </>
  );
}

export function ArbitrageHeader({ count }: { count: number }) {
  return (
    <div className="mb-2.5 flex items-center gap-2">
      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
        Arbitrages suggérés
      </span>
      {count > 0 ? (
        <span className="font-mono text-[9px] text-signal">
          {count} actif{count > 1 ? "s" : ""}
        </span>
      ) : null}
      <span className="ml-auto">
        <InfoButton term="arb" />
      </span>
    </div>
  );
}
