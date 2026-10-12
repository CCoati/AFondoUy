import { checkoutInput, receiptSchema } from "@/domain/reservation";
import { failure, json, readJson, sameOrigin } from "@/lib/reservations/http";
import { digest, guestHash, reservationDatabase } from "@/lib/reservations/server";
import { z } from "zod";
export async function GET(request: Request) {
  try {
    const raffleId = z.uuid().parse(new URL(request.url).searchParams.get("raffleId"));
    const db=reservationDatabase(), hash=await guestHash();
    const {data,error}=await db.from("orders").select("id,reservations!inner(status)").eq("guest_hash",hash).eq("raffle_id",raffleId).eq("reservations.status","active").order("created_at",{ascending:false}).limit(1).maybeSingle();
    if(error) throw error;
    return json({orderId:data?.id ?? null});
  } catch(error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request); const db = reservationDatabase();
    const input = checkoutInput.parse(await readJson(request)), hash = await guestHash();
    const numbers = [...input.numbers].sort((a,b) => a-b);
    const { data, error } = await db.rpc("reserve_numbers", {
      p_raffle_id: input.raffleId, p_numbers: numbers, p_guest_hash: hash,
      p_idempotency_key: input.idempotencyKey, p_fingerprint: digest(JSON.stringify({ ...input, numbers })), p_expected_total: input.expectedTotalMinor,
      p_name: input.fullName, p_email: input.email, p_phone: input.phone,
    });
    if (error) throw error; return json(receiptSchema.parse(data), 201);
  } catch (error) { return failure(error); }
}
