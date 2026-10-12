import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { participationReceiptSchema } from "@/domain/reservation";
import { formatUYU } from "@/domain/raffle";
import { verifyParticipationToken } from "@/lib/participation/access";
import { reservationDatabase } from "@/lib/reservations/server";

export const metadata: Metadata = { title: "Consultar mi participación", robots: { index: false, follow: false } };
type Props = { searchParams: Promise<{ referencia?: string; estado?: string }> };

export default async function ParticipationPage({ searchParams }: Props) {
  const { referencia, estado } = await searchParams;
  const token = (await cookies()).get("afondo_participation_access")?.value;
  const claims = verifyParticipationToken(token);
  const authorized = claims && referencia === claims.orderId ? claims : null;
  const { data, error } = authorized ? await reservationDatabase().rpc("secure_order_receipt", { p_order_id: authorized.orderId }) : { data: null, error: null };
  const receipt = !error ? participationReceiptSchema.safeParse(data) : null;
  const value = receipt?.success && ["paid", "refunded", "review"].includes(receipt.data.status) ? receipt.data : null;
  const paymentLabel = value?.paymentStatus === "approved" ? "Confirmado" : value?.paymentStatus === "pending" ? "Pendiente" : value?.paymentStatus === "rejected" ? "Rechazado" : value?.paymentStatus === "refunded" ? "Reembolsado" : value?.paymentStatus === "review" ? "En revisión" : "Sin pago iniciado";
  return <div className="wrap page-body participation-page">
    <p className="eyebrow">ACCESO PRIVADO</p><h1>Consultar mi participación</h1>
    {value ? <section className="panel participation-receipt" aria-labelledby="participation-title">
      <p className="eyebrow">COMPRA CONFIRMADA · {value.orderId.slice(0, 8).toUpperCase()}</p><h2 id="participation-title">{value.raffleTitle}</h2>
      <p className="muted">Estado de pago: <strong>{paymentLabel}</strong></p>
      <div className="selected-numbers" aria-label="Números confirmados">{value.numbers.map(number => <span key={number}>{String(number).padStart(Math.max(3, String(value.numberCount).length), "0")}</span>)}</div>
      <dl className="reservation-price-breakdown"><div><dt>Total pagado</dt><dd>{formatUYU(value.totalMinor)} UYU</dd></div></dl>
      <p className="muted">Referencia completa: <span className="participation-reference">{value.orderId}</span></p>
      <Link className="text-link" href={`/sorteos/${encodeURIComponent(value.raffleSlug)}`}>Ver información del sorteo</Link>
    </section> : <section className="panel participation-empty">
      <h2>{estado === "enlace-invalido" ? "El enlace venció o no es válido" : estado === "no-disponible" ? "No pudimos abrir la compra" : "Abrí tu enlace de acceso"}</h2>
      <p className="muted">La referencia por sí sola no permite consultar una compra. Usá el enlace personal enviado al correo de confirmación. Si no lo encontrás, revisá correo no deseado o escribinos por los canales oficiales que publicará el organizador.</p>
      <Link className="button secondary" href="/">Volver al inicio</Link>
    </section>}
    <p className="participation-privacy">No pedimos cédula ni teléfono para consultar esta compra. No compartas el enlace personal: funciona como una llave privada y vence a los 30 días.</p>
  </div>;
}
