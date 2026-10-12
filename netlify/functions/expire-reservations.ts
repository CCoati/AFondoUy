import { createClient } from "@supabase/supabase-js";
export const config = { schedule: "* * * * *" };
export default async function handler() {
  if (process.env.RESERVATIONS_ENABLED !== "true") return;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Reservation scheduler is not configured");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.rpc("expire_reservations", { p_limit: 100 });
  if (error) throw new Error("Reservation cleanup failed");
  console.info("Reservation cleanup", { processed: Array.isArray(data) ? data.length : 0 });
}
