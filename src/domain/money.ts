import { z } from "zod";
// Decimal form text -> integer cents, without floating-point multiplication.
export function uyuToMinor(value: unknown): number {
  const text=z.string().trim().regex(/^\d{1,8}(\.\d{1,2})?$/).parse(value);
  const [whole,decimal=""]=text.split(".");
  return Number(whole)*100+Number(decimal.padEnd(2,"0"));
}
