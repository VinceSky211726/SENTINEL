"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";

const TABS = [
  { href: "/", label: "Fil", icon: "◆" },
  { href: "/portfolio", label: "Portefeuille", icon: "▦" },
  { href: "/brief", label: "Brief", icon: "◷" },
] as const;

export function TabBar({ initialUnread }: { initialUnread: number }) {
  const pathname = usePathname();
  const [unread, setUnread] = useState(initialUnread);

  useEffect(() => {
    setUnread(initialUnread);
  }, [initialUnread]);

  useEffect(() => {
    const supabase = createBrowserClient();
    const channel = supabase
      .channel("unread-count")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events" },
        async () => {
          const { count } = await supabase
            .from("events")
            .select("id", { count: "exact", head: true })
            .eq("filter_passed", true)
            .eq("llm_processed", true)
            .eq("is_read", false);
          setUnread(count ?? 0);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const isFeedActive = pathname === "/" || pathname.startsWith("/alert/");

  return (
    <nav className="flex shrink-0 justify-around border-t border-line bg-deep pb-[22px] pt-2.5">
      {TABS.map((tab) => {
        const active =
          tab.href === "/"
            ? isFeedActive
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`relative flex flex-col items-center gap-1 px-3.5 py-0.5 text-[9.5px] transition-colors ${
              active ? "text-white" : "text-muted"
            }`}
          >
            <span
              className={`text-[15px] leading-none ${
                active ? "text-signal" : ""
              }`}
            >
              {tab.icon}
            </span>
            {tab.label}
            {tab.href === "/" && unread > 0 && (
              <span className="absolute -top-0.5 right-2 grid min-h-[15px] min-w-[15px] place-items-center rounded-full bg-signal px-1 font-mono text-[9px] font-semibold text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
