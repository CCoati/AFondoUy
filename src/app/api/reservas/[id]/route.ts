import { z } from "zod";
import { failure, json } from "@/lib/reservations/http";
import { getReceipt } from "@/lib/reservations/server";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { return json(await getReceipt(z.uuid().parse((await params).id))); }
  catch (error) { return failure(error); }
}
