import "server-only";
import { z } from "zod";
import { inspectSandboxPayment, type VerifiedPayment } from "@/domain/payment";
import { sendCriticalPaymentAlert, sendPaymentConfirmation } from "@/lib/payments";
import type { reservationDatabase } from "@/lib/reservations/server";
import type { Payment } from "mercadopago";

const attemptSchema = z.object({ id: z.uuid(), order_id: z.uuid(), external_reference: z.string().min(1) });
const orderSchema = z.object({ participant_id: z.uuid(), total_minor: z.number().int().positive(), currency: z.literal("UYU"), created_at: z.string(), raffle_title: z.string(), raffle_slug: z.string() });
const personSchema = z.object({ full_name: z.string().min(1), email: z.email() });
const relatedRaffleSchema = z.union([z.object({ title: z.string(), slug: z.string() }), z.array(z.object({ title: z.string(), slug: z.string() })).length(1)]);

export async function processSandboxPayment(db: ReturnType<typeof reservationDatabase>, client: Payment, paymentId: string, collectorId: number) {
  const payment = await client.get({ id: paymentId }) as VerifiedPayment;
  const { data: attemptData, error: attemptError } = await db.from("payment_attempts")
    .select("id,order_id,external_reference").eq("external_reference", payment.external_reference ?? "").single();
  if (attemptError) throw new Error("PAYMENT_ATTEMPT_NOT_FOUND");
  const attempt = attemptSchema.parse(attemptData);
  const { data: orderData, error: orderError } = await db.from("orders")
    .select("participant_id,total_minor,currency,created_at,raffles!inner(title,slug)").eq("id", attempt.order_id).single();
  if (orderError) throw new Error("ORDER_NOT_FOUND");
  const related = relatedRaffleSchema.parse(orderData.raffles), raffle = Array.isArray(related) ? related[0]! : related;
  const order = orderSchema.parse({ ...orderData, raffle_title: raffle.title, raffle_slug: raffle.slug });
  const decision = inspectSandboxPayment(payment, {
    paymentId,
    externalReference: attempt.external_reference,
    collectorId,
    amountMinor: order.total_minor,
  });
  if (!decision) {
    const { error } = await db.rpc("flag_payment_attempt_review", { p_attempt_id: attempt.id, p_evidence: `verified-mismatch:${paymentId}` });
    if (error) throw error;
    await sendCriticalPaymentAlert({ incident: "verified-payment-mismatch", reference: attempt.order_id });
    return "mismatch" as const;
  }

  if (decision === "approved") {
    const { data: result, error } = await db.rpc("apply_verified_payment", {
      p_attempt_id: attempt.id, p_provider_id: paymentId, p_amount: order.total_minor, p_currency: order.currency, p_is_live: false,
    });
    if (error) throw error;
    if (result?.status === "confirmed") await sendConfirmation(db, attempt.order_id, order);
    if (result?.status === "refund_required") await sendCriticalPaymentAlert({ incident: `payment-${result.reason ?? "review"}`, reference: attempt.order_id });
    return result?.status === "refund_required" ? "refund_required" as const : "confirmed" as const;
  }
  if (decision === "unpaid") {
    const { error } = await db.rpc("record_verified_unpaid", { p_attempt_id: attempt.id, p_evidence: `mercadopago:${paymentId}:${payment.status}` });
    if (error && !String(error.message).includes("PAYMENT_ALREADY_APPROVED")) throw error;
    return "rejected" as const;
  }
  if (decision === "refunded" || decision === "charged_back") {
    const { data: existing, error: lookupError } = await db.from("payments").select("id").eq("provider_payment_id", paymentId).maybeSingle();
    if (lookupError) throw lookupError;
    const { error } = existing
      ? await db.rpc("record_verified_payment_adjustment", { p_provider_payment_id: paymentId, p_state: decision })
      : await db.rpc("record_unapplied_payment_adjustment", { p_attempt_id: attempt.id, p_provider_payment_id: paymentId, p_amount: order.total_minor, p_currency: order.currency, p_state: decision });
    if (error) throw error;
  } else if (decision === "review") {
    const { error } = await db.rpc("flag_payment_attempt_review", { p_attempt_id: attempt.id, p_evidence: `partial-refund:${paymentId}` });
    if (error) throw error;
  }
  return decision;
}

async function sendConfirmation(db: ReturnType<typeof reservationDatabase>, orderId: string, order: z.infer<typeof orderSchema>) {
  const { data: claimed, error: claimError } = await db.rpc("claim_notification_delivery", { p_order_id: orderId, p_kind: "purchase_confirmation" });
  if (claimError) throw new Error("CONFIRMATION_CLAIM_FAILED");
  if (!claimed) return;
  const claim = z.object({ id: z.uuid(), claimToken: z.uuid() }).parse(claimed);
  let sent = false;
  try {
  const [{ data: personData, error: personError }, { data: itemData, error: itemError }] = await Promise.all([
    db.from("participants").select("full_name,email").eq("id", order.participant_id).single(),
    db.from("order_items").select("number").eq("order_id", orderId).order("number"),
  ]);
  if (personError || itemError) throw new Error("CONFIRMATION_DATA_UNAVAILABLE");
  const person = personSchema.parse(personData);
  const numbers = z.array(z.object({ number: z.number().int().positive() })).parse(itemData).map(item => item.number);
  sent = await sendPaymentConfirmation({ orderId, createdAt: order.created_at, raffleTitle: order.raffle_title, raffleSlug: order.raffle_slug, email: person.email, fullName: person.full_name, numbers, totalMinor: order.total_minor }) === "sent";
  } finally {
    const { error } = await db.rpc("finish_notification_delivery", { p_id: claim.id, p_claim: claim.claimToken, p_sent: sent });
    if (error) throw new Error("CONFIRMATION_STATE_UPDATE_FAILED");
  }
}
