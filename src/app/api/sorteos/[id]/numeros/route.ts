import { z } from "zod";
import { publicDatabase } from "@/lib/supabase/server";
import { inventorySchema } from "@/domain/reservation";
import { failure, json } from "@/lib/reservations/http";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = z.uuid().parse((await params).id), db = publicDatabase(); if (!db) throw new Error("UNCONFIGURED");
    const { data: raffle, error: raffleError } = await db.from("raffles").select("number_count,status").eq("id",id).single();
    if (raffleError || !raffle) throw new Error("RAFFLE_UNAVAILABLE");
    const numbers = [];
    for (let from = 0; from < raffle.number_count; from += 1000) {
      const { data, error } = await db.from("number_availability").select("number,state").eq("raffle_id",id).order("number").range(from,from+999);
      if (error) throw error; numbers.push(...inventorySchema.parse(data));
    }
    return json({ numbers, active: raffle.status === "active", count: raffle.number_count, checkedAt: new Date().toISOString() });
  } catch (error) { return failure(error); }
}
