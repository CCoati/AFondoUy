import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getSupabaseConfig } from "@/lib/env";
import { authCookieOptions } from "./cookie-options";

export function publicDatabase() {
  const config = getSupabaseConfig();
  return config ? createClient(config.url, config.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }) : null;
}

export async function authDatabase() {
  const config = getSupabaseConfig();
  if (!config) return null;
  const jar = await cookies();
  return createServerClient(config.url, config.key, { cookieOptions: authCookieOptions, cookies: {
    getAll() { return jar.getAll(); },
    setAll(values) {
      // Server Components cannot write cookies; proxy.ts refreshes those sessions.
      try { values.forEach(({ name, value, options }) => jar.set(name, value, options)); } catch { /* Read-only render. */ }
    },
  } });
}
