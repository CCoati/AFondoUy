import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { WebhookSignatureValidator } from "mercadopago";
import { inspectSandboxPayment, isSandboxCredential, paymentAmountMinor } from "../src/domain/payment";

const expected = { paymentId: "987654321", externalReference: "attempt:unique", collectorId: 123456, amountMinor: 270000 };
const payment = {
  id: 987654321,
  status: "approved",
  external_reference: "attempt:unique",
  collector_id: 123456,
  live_mode: false,
  currency_id: "UYU",
  transaction_amount: 2700,
};

test("Checkout solo acepta credenciales de prueba", () => {
  assert.equal(isSandboxCredential("TEST-1234567890abcdef"), true);
  assert.equal(isSandboxCredential("APP_USR-1234567890abcdef"), false);
  assert.equal(isSandboxCredential(undefined), false);
});

test("importe UYU decimal se convierte a unidades menores sin redondear cobros dudosos", () => {
  assert.equal(paymentAmountMinor(2700), 270000);
  assert.equal(paymentAmountMinor(10.25), 1025);
  assert.equal(paymentAmountMinor(Number.NaN), null);
  assert.equal(paymentAmountMinor(-1), null);
});

test("el pago debe coincidir en referencia, cuenta, modo sandbox, importe y moneda", () => {
  assert.equal(inspectSandboxPayment(payment, expected), "approved");
  for (const change of [
    { external_reference: "otra orden" },
    { collector_id: 654321 },
    { live_mode: true },
    { currency_id: "USD" },
    { transaction_amount: 1 },
    { status: "unknown" },
  ]) assert.equal(inspectSandboxPayment({ ...payment, ...change }, expected), null);
});

test("decodifica los estados pendientes, rechazados, reembolsados y contracargos", () => {
  assert.equal(inspectSandboxPayment({ ...payment, status: "pending" }, expected), "pending");
  assert.equal(inspectSandboxPayment({ ...payment, status: "in_process" }, expected), "pending");
  assert.equal(inspectSandboxPayment({ ...payment, status: "rejected" }, expected), "unpaid");
  assert.equal(inspectSandboxPayment({ ...payment, status: "cancelled" }, expected), "unpaid");
  assert.equal(inspectSandboxPayment({ ...payment, status: "refunded", transaction_amount_refunded: 2700 }, expected), "refunded");
  assert.equal(inspectSandboxPayment({ ...payment, status: "charged_back" }, expected), "charged_back");
  assert.equal(inspectSandboxPayment({ ...payment, transaction_amount_refunded: 100 }, expected), "review");
});

test("validador SDK oficial acepta manifiesto firmado y rechaza firma modificada", () => {
  const secret = "a-secure-webhook-secret-for-tests";
  const dataId = "987654321", requestId = "request-abc", timestamp = Math.floor(Date.now() / 1000).toString();
  const manifest = `id:${dataId};request-id:${requestId};ts:${timestamp};`;
  const signature = createHmac("sha256", secret).update(manifest).digest("hex");
  const options = { xSignature: `ts=${timestamp},v1=${signature}`, xRequestId: requestId, dataId, secret, toleranceSeconds: 300 };
  assert.doesNotThrow(() => WebhookSignatureValidator.validate(options));
  assert.throws(() => WebhookSignatureValidator.validate({ ...options, dataId: "000000000" }));
  assert.throws(() => WebhookSignatureValidator.validate({ ...options, xSignature: `ts=${timestamp},v1=${"0".repeat(64)}` }));
});
