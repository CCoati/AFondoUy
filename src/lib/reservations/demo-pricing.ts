import "server-only";
import type { DemoRaffle } from "@/domain/demo";
import type { Quote } from "@/domain/reservation";
// Real orders always use PostgreSQL. This isolated fixture calculator never reaches the client bundle.
export function priceDemo(raffle: DemoRaffle, quantity: number): Quote {
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 20) throw new RangeError("INVALID_QUANTITY");
  const packs = [{ quantity: 1, totalMinor: raffle.priceMinor, name: "Número individual" },
    { ...raffle.promotion, name: "Pack de 3 · demo" },
    { quantity: 5, totalMinor: Math.round(raffle.priceMinor * 4.25), name: "Pack de 5 · demo" }];
  const costs = [0], paths: Quote["breakdown"][] = [[]];
  for (let n = 1; n <= quantity; n++) {
    costs[n] = Infinity; paths[n] = [];
    for (const pack of packs) if (pack.quantity <= n && costs[n-pack.quantity]! + pack.totalMinor < costs[n]!) {
      costs[n] = costs[n-pack.quantity]! + pack.totalMinor; paths[n] = [...paths[n-pack.quantity]!, pack];
    }
  }
  return { quantity, unitPriceMinor: raffle.priceMinor, subtotalMinor: raffle.priceMinor*quantity,
    totalMinor: costs[quantity]!, discountMinor: raffle.priceMinor*quantity-costs[quantity]!, currency: "UYU", breakdown: paths[quantity]!, reservationMinutes: 10 };
}
