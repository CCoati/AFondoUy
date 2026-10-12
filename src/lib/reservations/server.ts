import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { receiptSchema } from "@/domain/reservation";
const cookieName = "afondo_guest";
export function reservationDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (process.env.RESERVATIONS_ENABLED !== "true" || !url || !key) throw new Error("UNCONFIGURED");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export async function guestHash(create = false) {
  const jar = await cookies(); let token = jar.get(cookieName)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    if (!create) throw new Error("SESSION_REQUIRED"); token = randomBytes(32).toString("hex");
    jar.set(cookieName, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 60 * 60 * 24 * 7 });
  }
  return digest(token);
}
export async function getReceipt(id: string) {
  const hash = await guestHash();
  const { data, error } = await reservationDatabase().rpc("reservation_receipt", { p_order_id: id, p_guest_hash: hash });
  if (error) throw error; return receiptSchema.parse(data);
}
