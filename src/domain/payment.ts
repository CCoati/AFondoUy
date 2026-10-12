export type VerifiedPayment = {
  id?: string | number;
  status?: string;
  external_reference?: string;
  transaction_amount?: number;
  transaction_amount_refunded?: number;
  currency_id?: string;
  collector_id?: number;
  live_mode?: boolean;
};

export type PaymentExpectation = {
  paymentId: string;
  externalReference: string;
  collectorId: number;
  amountMinor: number;
};

export type PaymentDecision = "approved" | "unpaid" | "pending" | "refunded" | "charged_back" | "review";

export function paymentAmountMinor(amount: number | undefined) {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) return null;
  const minor = Math.round(amount * 100);
  return Math.abs(amount * 100 - minor) < 0.000001 && Number.isSafeInteger(minor) ? minor : null;
}

export function inspectSandboxPayment(payment: VerifiedPayment, expected: PaymentExpectation): PaymentDecision | null {
  if (String(payment.id ?? "") !== expected.paymentId || payment.external_reference !== expected.externalReference) return null;
  if (payment.collector_id !== expected.collectorId || payment.live_mode !== false || payment.currency_id !== "UYU") return null;
  if (paymentAmountMinor(payment.transaction_amount) !== expected.amountMinor) return null;
  switch (payment.status) {
    case "approved": return paymentAmountMinor(payment.transaction_amount_refunded ?? 0) === 0 ? "approved" : "review";
    case "rejected":
    case "cancelled": return "unpaid";
    case "pending":
    case "in_process":
    case "authorized": return "pending";
    case "refunded": return "refunded";
    case "charged_back": return "charged_back";
    default: return null;
  }
}

export function isSandboxCredential(token: string | undefined) {
  return typeof token === "string" && /^TEST-[A-Za-z0-9_-]{16,}$/.test(token);
}
