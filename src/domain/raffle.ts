import { z } from "zod";

export const DEFAULT_NUMBER_COUNT = 200;
export const DEFAULT_PRICE_MINOR = 100_000;
export const MAX_SELECTION = 20;
export const raffleSchema = z.object({
  id: z.uuid(), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(1), description: z.string(),
  status: z.enum(["active", "closed", "drawn"]),
  number_count: z.number().int().min(1).max(10_000),
  price_minor: z.number().int().positive().max(100_000_000),
  currency: z.literal("UYU"), terms: z.string().min(1),
  is_demo: z.boolean().default(false),
});
export type Raffle = z.infer<typeof raffleSchema>;

export const reservationInputSchema = z.object({
  raffleId: z.uuid(),
  numbers: z.array(z.number().int().min(1).max(10_000)).min(1).max(MAX_SELECTION)
    .refine((values) => new Set(values).size === values.length, "No se permiten números repetidos."),
}).strict();

export function formatNumber(number: number, count = DEFAULT_NUMBER_COUNT): string {
  if (!Number.isSafeInteger(number) || number < 1 || number > count) throw new RangeError("Número fuera del sorteo.");
  return number.toString().padStart(Math.max(3, count.toString().length), "0");
}

export function formatUYU(minor: number): string {
  if (!Number.isSafeInteger(minor) || minor < 0) throw new RangeError("Importe inválido.");
  return new Intl.NumberFormat("es-UY", { style: "currency", currency: "UYU", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(minor / 100);
}

export function selectionTotal(priceMinor: number, quantity: number): number {
  if (!Number.isSafeInteger(priceMinor) || priceMinor < 1 || !Number.isSafeInteger(quantity) || quantity < 0 || quantity > MAX_SELECTION) throw new RangeError("Selección inválida.");
  const total = priceMinor * quantity;
  if (!Number.isSafeInteger(total)) throw new RangeError("Importe fuera de rango.");
  return total;
}
