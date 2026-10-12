import { NextResponse } from "next/server";
import { verifyParticipationToken } from "@/lib/participation/access";
import { reservationDatabase } from "@/lib/reservations/server";
import { participationReceiptSchema } from "@/domain/reservation";
import { getSiteUrl } from "@/lib/env";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? undefined;
  const claims = verifyParticipationToken(token);
  if (!claims || !token) return NextResponse.redirect(new URL("/participacion?estado=enlace-invalido", getSiteUrl()), 303);

  try {
    const db = reservationDatabase();
    const { data, error } = await db.rpc("secure_order_receipt", { p_order_id: claims.orderId });
    if (error) throw error;
    const receipt = participationReceiptSchema.parse(data);
    if (!["paid", "refunded", "review"].includes(receipt.status)) return NextResponse.redirect(new URL("/participacion?estado=no-disponible", getSiteUrl()), 303);
    const response = NextResponse.redirect(new URL(`/participacion?referencia=${claims.orderId}`, getSiteUrl()), 303);
    response.cookies.set("afondo_participation_access", token, {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/participacion", expires: new Date(claims.expiresAt * 1000),
    });
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return NextResponse.redirect(new URL("/participacion?estado=no-disponible", getSiteUrl()), 303);
  }
}
