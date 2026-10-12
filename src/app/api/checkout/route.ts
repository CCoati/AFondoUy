import { z } from "zod";
import { receiptSchema } from "@/domain/reservation";
import { getSiteUrl } from "@/lib/env";
import { mercadopagoClients, getSandboxPaymentConfig } from "@/lib/payments";
import { failure, json, readJson, sameOrigin } from "@/lib/reservations/http";
import { guestHash, reservationDatabase } from "@/lib/reservations/server";

export const runtime = "nodejs";
const requestSchema = z.object({ orderId: z.uuid() }).strict();
const attemptSchema = z.object({ id: z.uuid(), external_reference: z.string().min(1), provider_preference_id: z.string().nullable() });

function sandboxUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const validHost = url.hostname.endsWith(".mercadopago.com.uy") || url.hostname.endsWith(".mercadopago.com");
    return url.protocol === "https:" && validHost ? url.toString() : null;
  } catch { return null; }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { orderId } = requestSchema.parse(await readJson(request));
    const config = getSandboxPaymentConfig();
    if (!config) return json({ code: "SANDBOX_NOT_CONFIGURED", message: "El checkout de pruebas todavía no está configurado. No se realizó ningún cobro." }, 503);

    const db = reservationDatabase();
    const owner = await guestHash();
    const { data: receiptData, error: receiptError } = await db.rpc("reservation_receipt", { p_order_id: orderId, p_guest_hash: owner });
    if (receiptError) throw receiptError;
    const receipt = receiptSchema.parse(receiptData);
    if (receipt.status !== "pending" || receipt.reservationStatus !== "active" || Date.parse(receipt.expiresAt) <= Date.parse(receipt.serverNow)) {
      return json({ code: "RESERVATION_NOT_PAYABLE", message: "La reserva venció o ya cambió de estado. Actualizá la página para ver su situación." }, 409);
    }

    // The database calculates and stores the amount. No browser amount is accepted here.
    const { data: attemptId, error: attemptError } = await db.rpc("begin_payment_attempt", { p_order_id: orderId });
    if (attemptError || typeof attemptId !== "string") throw attemptError ?? new Error("PAYMENT_ATTEMPT_UNAVAILABLE");
    const { data: attemptData, error: loadAttemptError } = await db.from("payment_attempts")
      .select("id,external_reference,provider_preference_id").eq("id", attemptId).single();
    if (loadAttemptError) throw loadAttemptError;
    const attempt = attemptSchema.parse(attemptData);
    const { preference } = mercadopagoClients(config.token);
    let preferenceId = attempt.provider_preference_id;
    let paymentUrl: string | null = null;

    if (preferenceId) {
      const existing = await preference.get({ preferenceId });
      paymentUrl = sandboxUrl(existing.sandbox_init_point);
    } else {
      const origin = new URL(getSiteUrl()).origin;
      const response = await preference.create({
        body: {
          items: [{ id: orderId, title: `Participación A FONDO UY · ${receipt.numbers.length} números`, quantity: 1, currency_id: "UYU", unit_price: receipt.totalMinor / 100 }],
          external_reference: attempt.external_reference,
          notification_url: `${origin}/api/webhooks/mercadopago`,
          back_urls: {
            success: `${origin}/checkout/${orderId}?return=approved`,
            pending: `${origin}/checkout/${orderId}?return=pending`,
            failure: `${origin}/checkout/${orderId}?return=rejected`,
          },
          auto_return: "approved",
          expires: true,
          expiration_date_to: receipt.expiresAt,
          statement_descriptor: "AFONDO UY",
        },
        requestOptions: { idempotencyKey: `afondo-preference-${attempt.id}` },
      });
      preferenceId = response.id ?? null;
      paymentUrl = sandboxUrl(response.sandbox_init_point);
      if (!preferenceId || !paymentUrl) throw new Error("SANDBOX_CHECKOUT_URL_UNAVAILABLE");
      const { error: saveError } = await db.rpc("save_sandbox_preference", { p_attempt_id: attempt.id, p_preference_id: preferenceId });
      if (saveError) throw saveError;
    }

    if (!paymentUrl) throw new Error("SANDBOX_CHECKOUT_URL_UNAVAILABLE");
    return json({ checkoutUrl: paymentUrl, mode: "sandbox" });
  } catch (error) { return failure(error); }
}
