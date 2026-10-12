import "server-only";
import { z } from "zod";
import { MercadoPagoConfig, Payment, Preference, WebhookSignatureValidator } from "mercadopago";
import { isSandboxCredential } from "@/domain/payment";

const sandboxConfigSchema = z.object({
  token: z.string().refine(isSandboxCredential),
  webhookSecret: z.string().min(24),
  collectorId: z.coerce.number().int().positive(),
});

export function getSandboxPaymentConfig() {
  if (process.env.MERCADOPAGO_MODE !== "sandbox") return null;
  const parsed = sandboxConfigSchema.safeParse({
    token: process.env.MERCADOPAGO_ACCESS_TOKEN,
    webhookSecret: process.env.MERCADOPAGO_WEBHOOK_SECRET,
    collectorId: process.env.MERCADOPAGO_EXPECTED_COLLECTOR_ID,
  });
  return parsed.success ? parsed.data : null;
}

export function mercadopagoClients(token: string) {
  const config = new MercadoPagoConfig({ accessToken: token, options: { timeout: 8000 } });
  return { preference: new Preference(config), payment: new Payment(config) };
}

export { WebhookSignatureValidator };

export async function sendPaymentConfirmation(input: {
  orderId: string;
  createdAt: string;
  raffleTitle: string;
  raffleSlug: string;
  email: string;
  fullName: string;
  numbers: number[];
  totalMinor: number;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from || !process.env.ORDER_LOOKUP_SECRET || Buffer.byteLength(process.env.ORDER_LOOKUP_SECRET) < 32) return "disabled" as const;
  const { createParticipationToken } = await import("@/lib/participation/access");
  const { getSiteUrl } = await import("@/lib/env");
  const accessToken = createParticipationToken(input.orderId, input.createdAt);
  const participationUrl = `${getSiteUrl().replace(/\/$/, "")}/api/participacion/acceder?token=${encodeURIComponent(accessToken)}`;
  const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
  const numbers = input.numbers.map(value => String(value).padStart(3, "0")).join(", ");
  const amount = new Intl.NumberFormat("es-UY", { style: "currency", currency: "UYU", maximumFractionDigits: 0 }).format(input.totalMinor / 100);
  const raffleUrl = `${getSiteUrl().replace(/\/$/, "")}/sorteos/${encodeURIComponent(input.raffleSlug)}`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(8000),
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `afondo-paid-${input.orderId}` },
    body: JSON.stringify({
      from, to: [input.email], subject: "Tu participación en A FONDO UY está confirmada",
      html: `<div style="font-family:Arial,sans-serif;background:#101014;color:#fff;padding:32px"><h1>¡Gracias, ${escape(input.fullName)}!</h1><p>Tu pago fue verificado y tu participación quedó confirmada.</p><p><strong>Sorteo:</strong> <a href="${escape(raffleUrl)}" style="color:#ff7770">${escape(input.raffleTitle)}</a></p><p><strong>Referencia:</strong> ${escape(input.orderId)}</p><p><strong>Números:</strong> ${escape(numbers)}</p><p><strong>Total:</strong> ${escape(amount)} UYU</p><p><a href="${escape(participationUrl)}" style="display:inline-block;padding:14px 20px;background:#d92d29;color:#fff;text-decoration:none">Consultar mi participación</a></p><p>Este acceso personal vence en 30 días. Guardá este correo; no compartas el enlace.</p></div>`,
    }),
  });
  if (!response.ok) throw new Error("CONFIRMATION_EMAIL_FAILED");
  return "sent" as const;
}

export async function sendCriticalPaymentAlert(input: { incident: string; reference?: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const to = process.env.ADMIN_ALERT_EMAIL;
  if (!apiKey || !from || !to) return "disabled" as const;
  const incident = input.incident.replace(/[^a-z0-9_-]/gi, "").slice(0, 80);
  const reference = input.reference?.replace(/[^a-f0-9-]/gi, "").slice(0, 64) ?? "sin-referencia";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST", signal: AbortSignal.timeout(8000),
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `afondo-alert-${incident}-${reference}` },
    body: JSON.stringify({ from, to: [to], subject: `A FONDO UY · revisar incidente de pago ${incident}`, text: `Se requiere revisar el incidente ${incident}. Referencia interna: ${reference}. No se incluyeron datos personales.` }),
  });
  if (!response.ok) throw new Error("CRITICAL_ALERT_FAILED");
  return "sent" as const;
}
