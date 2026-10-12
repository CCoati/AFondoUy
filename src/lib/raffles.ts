import "server-only";
import { z } from "zod";
import { publicDatabase } from "@/lib/supabase/server";
import { raffleSchema, type Raffle } from "@/domain/raffle";

export type RaffleListing = { state: "ready" | "unconfigured" | "unavailable"; raffles: Raffle[] };
const fields = "id,slug,title,description,status,number_count,price_minor,currency,terms,is_demo";
export async function listRaffles(history = false): Promise<RaffleListing> {
  try {
    const db = publicDatabase();
    if (!db) return { state: "unconfigured", raffles: [] };
    const { data, error } = await db.from("raffles").select(fields)
      .in("status", history ? ["drawn", "closed"] : ["active"]).order("created_at", { ascending: false }).limit(50);
    if (error) return { state: "unavailable", raffles: [] };
    const parsed = z.array(raffleSchema).safeParse(data);
    return parsed.success ? { state: "ready", raffles: parsed.data } : { state: "unavailable", raffles: [] };
  } catch { return { state: "unavailable", raffles: [] }; }
}

export async function findRaffle(slug: string) {
  const db = publicDatabase();
  if (!db) return null;
  const { data, error } = await db.from("raffles").select(fields).eq("slug", slug).maybeSingle();
  if (error) throw new Error("No se pudo consultar el sorteo.");
  return data ? raffleSchema.parse(data) : null;
}
