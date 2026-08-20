"use client";

import { useEffect, useState } from "react";

export function StatusBar() {
  const [clock, setClock] = useState("");

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setClock(
        `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`
      );
    };
    tick();
    const id = window.setInterval(tick, 20000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="flex shrink-0 items-end justify-between px-6 pb-1 pt-3.5 font-mono text-[11px] text-ice">
      <span>{clock}</span>
      <span className="text-[10px] opacity-70">▲ ▮▮▮ 84%</span>
    </div>
  );
}
