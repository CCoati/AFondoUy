import "server-only";
import { signParticipationToken, verifySignedParticipationToken } from "@/domain/participation-token";

function secret() {
  const value = process.env.ORDER_LOOKUP_SECRET;
  if (!value || Buffer.byteLength(value) < 32) throw new Error("ORDER_LOOKUP_NOT_CONFIGURED");
  return value;
}

// Expiration is derived from immutable order creation time so webhook retries
// generate the same link and the same Resend idempotency payload.
export function createParticipationToken(orderId: string, createdAt: string) {
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created)) throw new Error("INVALID_ORDER_DATE");
  return signParticipationToken(orderId, Math.floor(created / 1000) + 60 * 60 * 24 * 30, secret());
}

export function verifyParticipationToken(token: string | undefined) {
  try { return verifySignedParticipationToken(token, secret()); } catch { return null; }
}
