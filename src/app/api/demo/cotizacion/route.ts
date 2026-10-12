import { z } from "zod";
import { demoRaffles } from "@/domain/demo";
import { priceDemo } from "@/lib/reservations/demo-pricing";
import { failure, json, readJson, sameOrigin } from "@/lib/reservations/http";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { raffleId, quantity } = z.object({ raffleId: z.string(), quantity: z.number().int().min(0).max(20) }).strict().parse(await readJson(request));
    const raffle = demoRaffles.find(r => r.id === raffleId); if (!raffle) throw new Error("RAFFLE_UNAVAILABLE");
    return json(priceDemo(raffle, quantity));
  } catch (error) { return failure(error); }
}
