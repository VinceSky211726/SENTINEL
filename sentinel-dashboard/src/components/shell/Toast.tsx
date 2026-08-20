"use client";

import { useAppShell } from "./AppProviders";

export function Toast() {
  const { toast } = useAppShell();
  if (!toast) return null;

  return (
    <div className="absolute bottom-[86px] left-5 right-5 z-50 flex items-center gap-2 rounded-xl bg-ice px-3.5 py-2.5 text-xs font-medium text-deep shadow-lg">
      <span className="h-2 w-2 shrink-0 rotate-45 rounded-[1px] bg-signal" />
      {toast.message}
    </div>
  );
}
