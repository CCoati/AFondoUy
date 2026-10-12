import { failure, json, sameOrigin } from "@/lib/reservations/http";
import { guestHash, reservationDatabase } from "@/lib/reservations/server";
export async function POST(request: Request) {
  try { sameOrigin(request); reservationDatabase(); await guestHash(true); return json({ ready: true }); }
  catch (error) { return failure(error); }
}
