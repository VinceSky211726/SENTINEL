"use client";

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { assertPublishableSupabaseKey } from "@/lib/supabase/keys";

let client: SupabaseClient<Database> | null = null;

export function createBrowserClient() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  assertPublishableSupabaseKey(key);
  client = createClient<Database>(url, key);
  return client;
}
