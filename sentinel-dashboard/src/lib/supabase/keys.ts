/**
 * Le dashboard tourne côté navigateur : seule la clé publishable est autorisée.
 * Ne jamais utiliser sb_secret_… ni une JWT service_role.
 */
export function assertPublishableSupabaseKey(key: string): void {
  if (key.startsWith("sb_secret_")) {
    throw new Error(
      "Clé secrète Supabase (sb_secret_…) interdite côté client. Renseigne la clé publishable (sb_publishable_…) dans NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  const role = jwtRole(key);
  if (role === "service_role") {
    throw new Error(
      "Clé service_role interdite côté client. Utilise la clé publishable (sb_publishable_…) — elle est visible dans le navigateur."
    );
  }
}

function jwtRole(key: string): string | null {
  if (!key.startsWith("eyJ")) return null;
  const parts = key.split(".");
  if (parts.length < 2) return null;

  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json =
      typeof atob !== "undefined"
        ? atob(b64)
        : Buffer.from(b64, "base64").toString("utf8");
    const payload = JSON.parse(json) as { role?: string };
    return payload.role ?? null;
  } catch {
    return null;
  }
}
