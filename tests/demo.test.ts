import assert from "node:assert/strict";
import test from "node:test";
import { demoRaffles, inventoryCounts, pickAvailable, featuredRaffle } from "../src/domain/demo";

test("inventarios de muestra: 200 números únicos, estados y contadores coherentes", () => {
  for (const raffle of demoRaffles) {
    const counts = inventoryCounts(raffle);
    assert.equal(counts.available + counts.reserved + counts.sold + counts.blocked, 200);
    assert.equal(new Set(raffle.numbers.map((n) => n.number)).size, 200);
    assert.equal(raffle.numbers[0]?.number, 1);
    assert.equal(raffle.numbers[199]?.number, 200);
  }
  assert.deepEqual(inventoryCounts(featuredRaffle), { available: 198, reserved: 0, sold: 0, blocked: 2 });
});
test("selección al azar excluye ocupados y elegidos, no duplica y respeta el máximo", () => {
  const first = pickAvailable(featuredRaffle, [], 19, () => 0.5);
  assert.equal(first.length, 19);
  assert.equal(new Set(first).size, 19);
  assert.ok(first.every((number) => featuredRaffle.numbers.some((n) => n.number === number && n.state === "available")));
  const next = pickAvailable(featuredRaffle, first, 5, () => 0.25);
  assert.equal(next.length, 1);
  assert.ok(!first.includes(next[0]!));
  assert.deepEqual(pickAvailable(featuredRaffle, [...first, ...next], 1), []);
});
