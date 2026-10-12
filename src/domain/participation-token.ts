import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const claimsSchema = z.object({ orderId: z.uuid(), expiresAt: z.number().int().positive() });

export function signParticipationToken(orderId: string, expiresAt: number, secret: string) {
  const claims = claimsSchema.parse({ orderId, expiresAt });
  if (Buffer.byteLength(secret) < 32) throw new Error("WEAK_LOOKUP_SECRET");
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifySignedParticipationToken(token: string | undefined, secret: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!token || token.length > 1024 || Buffer.byteLength(secret) < 32) return null;
  const [payload, supplied, extra] = token.split(".");
  if (!payload || !supplied || extra !== undefined) return null;
  try {
    const expected = Buffer.from(createHmac("sha256", secret).update(payload).digest("base64url"));
    const actual = Buffer.from(supplied);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const claims = claimsSchema.safeParse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    if (!claims.success || claims.data.expiresAt <= nowSeconds) return null;
    return claims.data;
  } catch { return null; }
}
