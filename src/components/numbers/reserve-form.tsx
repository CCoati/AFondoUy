"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { receiptSchema } from "@/domain/reservation";
export function ReserveForm({ raffleId, numbers, total, enabled, onConflict }: { raffleId: string; numbers: number[]; total: number; enabled: boolean; onConflict: () => void }) {
  const [busy,setBusy] = useState(false), [message,setMessage] = useState("");
  const attempt = useRef<{ signature: string; key: string } | null>(null), router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if(busy || !enabled) return;
    const form = new FormData(event.currentTarget);
    const values = { raffleId, numbers: [...numbers].sort((a,b)=>a-b), expectedTotalMinor: total,
      fullName: String(form.get("fullName")), email: String(form.get("email")), phone: String(form.get("phone")),
      consent: form.get("consent")==="on", paymentMethod: String(form.get("paymentMethod")) };
    const signature = JSON.stringify(values);
    if(attempt.current?.signature!==signature) attempt.current = { signature, key: crypto.randomUUID() };
    setBusy(true);setMessage("");
    try {
      const session = await fetch("/api/sesion",{method:"POST",signal:AbortSignal.timeout(10000)});
      if(!session.ok) throw new Error((await session.json()).message);
      const response = await fetch("/api/reservas",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...values,idempotencyKey:attempt.current.key}),signal:AbortSignal.timeout(15000)});
      const body = await response.json();
      if(!response.ok) { if(response.status===409) onConflict(); throw new Error(body.message); }
      const receipt = receiptSchema.parse(body);
      try { sessionStorage.setItem(`afondo-reservation:${raffleId}`,receipt.orderId); } catch { /* Receipt navigation works without storage. */ }
      router.push(`/checkout/${receipt.orderId}`);
    } catch(error) { setMessage(error instanceof TypeError || error instanceof DOMException ? "No recibimos la confirmación. Usá «Recuperar mi reserva» o reintentá: la misma solicitud no creará dos reservas." : error instanceof Error ? error.message : "No pudimos completar la solicitud."); }
    finally { setBusy(false); }
  }
  return <form className="reservation-form" onSubmit={submit}>
    <h3>Datos para tu participación</h3>
    <p>No necesitás crear una cuenta. Usaremos estos datos para identificar la reserva y enviarte la confirmación.</p>
    <label>Nombre y apellido<input name="fullName" autoComplete="name" minLength={2} maxLength={160} required disabled={busy} /></label>
    <label>Correo electrónico<input name="email" type="email" autoComplete="email" maxLength={254} required disabled={busy} /></label>
    <label>WhatsApp o celular<input name="phone" type="tel" autoComplete="tel" inputMode="tel" minLength={6} maxLength={32} placeholder="09X XXX XXX" required disabled={busy} /></label>

    <fieldset className="payment-methods" disabled={busy}>
      <legend>Método de pago</legend>
      <label className="payment-method">
        <input type="radio" name="paymentMethod" value="mercadopago" defaultChecked required />
        <span className="payment-method-copy"><strong>Mercado Pago</strong><small>Checkout Pro · entorno de prueba</small></span>
        <span className="payment-method-tag">SEGURO</span>
      </label>
      <p className="payment-security">Vas a completar el pago en el sitio seguro de Mercado Pago. A FONDO UY no solicita ni guarda los datos de tu tarjeta.</p>
    </fieldset>

    <label className="consent-row"><input name="consent" type="checkbox" required disabled={busy} /><span>Acepto las <Link href="/terminos" target="_blank" rel="noreferrer">condiciones del sorteo</Link> y leí la <Link href="/privacidad" target="_blank" rel="noreferrer">política de privacidad</Link>.</span></label>
    <button className="button w-full" disabled={!enabled || busy}>{busy ? "Confirmando reserva…" : "Reservar y seguir a Mercado Pago"}</button>
    <p className="summary-note">La reserva comienza cuando el servidor confirma tus números. Esta integración solo acepta pagos de prueba; no se realizará un cobro real.</p>
    {message && <p className="notice" role="alert">{message}</p>}
  </form>;
}
