"use client";

export type FeedFilter =
  | "all"
  | "high"
  | "unread"
  | { type: "event_type_key"; key: string; label: string };

type Chip = { id: string; label: string; filter: FeedFilter };

export function FilterChips({
  active,
  onChange,
  typeKeys,
}: {
  active: FeedFilter;
  onChange: (filter: FeedFilter) => void;
  typeKeys: { key: string; label: string }[];
}) {
  const chips: Chip[] = [
    { id: "all", label: "Tout", filter: "all" },
    { id: "high", label: "Impact > 60", filter: "high" },
    { id: "unread", label: "Non lu", filter: "unread" },
    ...typeKeys.slice(0, 4).map((t) => ({
      id: t.key,
      label: t.label,
      filter: { type: "event_type_key" as const, key: t.key, label: t.label },
    })),
  ];

  const isActive = (chip: Chip) => {
    if (typeof active === "string" && typeof chip.filter === "string") {
      return active === chip.filter;
    }
    if (
      typeof active === "object" &&
      typeof chip.filter === "object" &&
      active.type === "event_type_key" &&
      chip.filter.type === "event_type_key"
    ) {
      return active.key === chip.filter.key;
    }
    return false;
  };

  return (
    <div className="chips-scroll mb-3 flex gap-1.5 overflow-x-auto pb-0.5">
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          onClick={() => onChange(chip.filter)}
          className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[11px] transition-colors ${
            isActive(chip)
              ? "border-ice bg-ice font-semibold text-deep"
              : "border-line text-muted"
          }`}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}

export function matchesFilter(
  filter: FeedFilter,
  event: {
    impact_score: number | null;
    is_read: boolean;
    event_type_key: string | null;
  }
): boolean {
  if (filter === "high") {
    return (event.impact_score ?? 0) > 60;
  }
  if (filter === "unread") {
    return !event.is_read;
  }
  if (typeof filter === "object" && filter.type === "event_type_key") {
    return event.event_type_key === filter.key;
  }
  return true;
}
