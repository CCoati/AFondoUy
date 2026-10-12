import { z } from "zod";
import { quoteSchema } from "@/domain/reservation";
import { failure, json, readJson, sameOrigin } from "@/lib/reservations/http";
import { reservationDatabase } from "@/lib/reservations/server";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { raffleId, quantity } = z.object({ raffleId: z.uuid(), quantity: z.number().int().min(0).max(20) }).strict().parse(await readJson(request));
    const { data, error } = await reservationDatabase().rpc("quote_numbers", { p_raffle_id: raffleId, p_quantity: quantity });
    if (error) throw error; return json(quoteSchema.parse(data));
  } catch (error) { return failure(error); }
}
