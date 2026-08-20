"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAppShell } from "./AppProviders";

const TITLES: Record<string, string> = {
  "/": "SENTINEL",
  "/portfolio": "SENTINEL",
  "/brief": "BRIEF",
};

export function AppBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { openTutorial, showToast } = useAppShell();
  const [spinning, setSpinning] = useState(false);

  const title =
    pathname.startsWith("/alert/") ? "ALERTE" : TITLES[pathname] ?? "SENTINEL";

  const refresh = () => {
    setSpinning(true);
    window.setTimeout(() => setSpinning(false), 700);
    router.refresh();
    window.setTimeout(
      () => showToast("Fil à jour — dernier cycle il y a quelques secondes."),
      500
    );
  };

  return (
    <header className="flex shrink-0 items-center justify-between px-5 pb-2.5 pt-1">
      <div className="flex items-center gap-2">
        <div className="h-[11px] w-[11px] rotate-45 rounded-[2px] bg-signal" />
        <span className="font-mono text-[13px] font-semibold tracking-[0.16em]">
          {title}
        </span>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          title="Comprendre les données"
          onClick={() => openTutorial(null)}
          className="grid h-[30px] w-[30px] place-items-center rounded-[9px] bg-panel2 text-[13px] text-ice active:bg-line"
        >
          💡
        </button>
        <button
          type="button"
          title="Rafraîchir le fil"
          onClick={refresh}
          className={`grid h-[30px] w-[30px] place-items-center rounded-[9px] bg-panel2 text-[13px] text-ice active:bg-line ${
            spinning ? "animate-spin" : ""
          }`}
        >
          ⟳
        </button>
      </div>
    </header>
  );
}
