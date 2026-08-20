import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { assertPublishableSupabaseKey } from "@/lib/supabase/keys";

export function createServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY requis (clé publishable sb_publishable_…, pas la service key)"
    );
  }
  assertPublishableSupabaseKey(key);
  return createClient<Database>(url, key, {
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: "no-store" }),
    },
  });
}
