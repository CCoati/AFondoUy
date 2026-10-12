import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { signParticipationToken, verifySignedParticipationToken } from "../src/domain/participation-token";

const secret = "test-only-secret-that-is-at-least-32-bytes-long";
const now = 1_800_000_000;

test("el enlace privado es determinista y no permite alterar la orden", () => {
  const orderId = randomUUID();
  const token = signParticipationToken(orderId, now + 60, secret);
  assert.equal(signParticipationToken(orderId, now + 60, secret), token);
  assert.deepEqual(verifySignedParticipationToken(token, secret, now), { orderId, expiresAt: now + 60 });
  assert.equal(verifySignedParticipationToken(`${token}x`, secret, now), null);
  assert.equal(verifySignedParticipationToken(token, `${secret}other`, now), null);
});

test("el enlace privado vence y rechaza secretos débiles", () => {
  const token = signParticipationToken(randomUUID(), now, secret);
  assert.equal(verifySignedParticipationToken(token, secret, now), null);
  assert.throws(() => signParticipationToken(randomUUID(), now + 60, "short"), /WEAK_LOOKUP_SECRET/);
});
