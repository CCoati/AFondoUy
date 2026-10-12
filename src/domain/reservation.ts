import { z } from "zod";
import { reservationInputSchema } from "./raffle";
export const checkoutInput = reservationInputSchema.extend({
  idempotencyKey: z.uuid(), expectedTotalMinor: z.number().int().positive().max(2_000_000_000),
  fullName: z.string().trim().min(2).max(160), email: z.email().max(254),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{6,32}$/), consent: z.literal(true),
  paymentMethod: z.literal("mercadopago"),
}).strict();
export const quoteSchema = z.object({
  quantity: z.number().int().min(0).max(20), unitPriceMinor: z.number().int().positive(),
  subtotalMinor: z.number().int().nonnegative(), totalMinor: z.number().int().nonnegative(),
  discountMinor: z.number().int().nonnegative(), currency: z.literal("UYU"), reservationMinutes: z.number().int().positive(),
  breakdown: z.array(z.object({ name: z.string(), quantity: z.number().int().positive(), totalMinor: z.number().int().positive() })),
});
export type Quote = z.infer<typeof quoteSchema>;
export const inventorySchema = z.array(z.object({ number: z.number().int().positive(), state: z.enum(["available", "reserved", "sold", "blocked"]) }));
export type InventoryNumber = z.infer<typeof inventorySchema>[number];
export const receiptSchema = z.object({
  numberCount: z.number().int().min(1).max(10000),
  orderId: z.uuid(), raffleId: z.uuid(), status: z.enum(["pending","paid","expired","cancelled","review","refunded"]),
  paymentStatus: z.enum(["not_started","pending","approved","rejected","refunded","review"]),
  reservationStatus: z.enum(["active","expired","converted","cancelled"]),
  expiresAt: z.iso.datetime({ offset: true }), serverNow: z.iso.datetime({ offset: true }),
  totalMinor: z.number().int().positive(), subtotalMinor: z.number().int().positive(), discountMinor: z.number().int().nonnegative(),
  currency: z.literal("UYU"), numbers: z.array(z.number().int().positive()),
});
export type ReservationReceipt = z.infer<typeof receiptSchema>;
export const participationReceiptSchema = receiptSchema.extend({ raffleTitle: z.string(), raffleSlug: z.string() });
export type ParticipationReceipt = z.infer<typeof participationReceiptSchema>;
