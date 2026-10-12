import assert from "node:assert/strict";
import test from "node:test";
import { formatNumber, formatUYU, selectionTotal, reservationInputSchema, raffleSchema } from "../src/domain/raffle";

test("numeración 001–200, sin 000 y configurable", () => {
  assert.equal(formatNumber(1), "001"); assert.equal(formatNumber(200), "200");
  assert.equal(formatNumber(1, 1000), "0001");
  for (const n of [0, -1, 201, 1.5]) assert.throws(() => formatNumber(n), RangeError);
});
test("importes enteros en centésimos y límites de pedido", () => {
  assert.equal(selectionTotal(100_000, 3), 300_000);
  assert.equal(selectionTotal(100_000, 0), 0);
  assert.throws(() => selectionTotal(100_000, 21), RangeError);
  assert.throws(() => selectionTotal(Number.MAX_SAFE_INTEGER, 20), RangeError);
  assert.throws(() => selectionTotal(1.5, 2), RangeError);
  assert.match(formatUYU(100_000), /1[.]000/);
});
test("contrato de reservas rechaza duplicados, importes manipulados y entradas inválidas", () => {
  const input = { raffleId: "5b0a1000-2710-4ab1-8fb6-d5dc17295118", numbers: [1, 200] };
  assert.equal(reservationInputSchema.safeParse(input).success, true);
  for (const value of [{ ...input, numbers: [1, 1] }, { ...input, numbers: [] }, { ...input, numbers: [0] }, { ...input, numbers: ["1"] }, { ...input, total: 1 }, { ...input, raffleId: "bad" }]) {
    assert.equal(reservationInputSchema.safeParse(value).success, false);
  }
});
test("datos públicos inválidos no se publican", () => {
  assert.equal(raffleSchema.safeParse({ status: "draft" }).success, false);
  assert.equal(raffleSchema.safeParse({ currency: "USD" }).success, false);
});
