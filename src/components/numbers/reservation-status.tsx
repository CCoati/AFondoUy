"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { receiptSchema, type ReservationReceipt } from "@/domain/reservation";
import { formatUYU } from "@/domain/raffle";

export function ReservationStatus({ initial }: { initial: ReservationReceipt }) {
  const [receipt, setReceipt] = useState(initial);
  const [remaining, setRemaining] = useState(Math.max(0, Date.parse(initial.expiresAt) - Date.parse(initial.serverNow)));
  const [error, setError] = useState("");
  const [startingCheckout, setStartingCheckout] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    let lastServerTime = Date.parse(initial.serverNow);
    let expiry = performance.now() + Math.max(0, Date.parse(initial.expiresAt) - Date.parse(initial.serverNow));
    async function refresh() {
      try {
        const response = await fetch(`/api/reservas/${initial.orderId}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(4000)]) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.message);
        const value = receiptSchema.parse(body);
        if (controller.signal.aborted || Date.parse(value.serverNow) < lastServerTime) return;
        lastServerTime = Date.parse(value.serverNow);
        expiry = performance.now() + Math.max(0, Date.parse(value.expiresAt) - Date.parse(value.serverNow));
        setReceipt(value);
        setError("");
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof TypeError || cause instanceof DOMException ? "No pudimos actualizar la reserva. Revisá tu conexión." : cause instanceof Error ? cause.message : "No pudimos actualizar la reserva.");
      }
    }
    const clock = setInterval(() => setRemaining(Math.max(0, expiry - performance.now())), 1000);
    const poll = setInterval(() => void refresh(), 5000);
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      controller.abort(); clearInterval(clock); clearInterval(poll);
      window.removeEventListener("online", refresh); window.removeEventListener("focus", refresh);
    };
  }, [initial]);

  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor(remaining / 1000) % 60;
  const active = receipt.reservationStatus === "active";
  const heading = receipt.status === "paid" ? "Participación confirmada"
    : receipt.status === "expired" ? "La reserva venció"
      : receipt.status === "review" ? "Reserva en revisión"
        : receipt.status === "cancelled" ? "Reserva cancelada"
          : receipt.status === "refunded" ? "Pago devuelto"
            : receipt.paymentStatus === "rejected" ? "Pago rechazado"
              : receipt.paymentStatus === "pending" ? "Pago pendiente de confirmación"
                : receipt.paymentStatus === "refunded" ? "Pago devuelto"
                : "Tus números están reservados";

  async function startCheckout() {
    setStartingCheckout(true);
    setCheckoutError("");
    try {
      const response = await fetch("/api/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: receipt.orderId }), cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok || typeof body.checkoutUrl !== "string") throw new Error(body.message ?? "No pudimos abrir el checkout de pruebas.");
      window.location.assign(body.checkoutUrl);
    } catch (cause) {
      setCheckoutError(cause instanceof Error ? cause.message : "No pudimos abrir el checkout de pruebas.");
      setStartingCheckout(false);
    }
  }

  return <section className="checkout-card reservation-receipt" aria-live="polite">
    <p className="eyebrow">RESERVA {receipt.orderId.slice(0, 8).toUpperCase()}</p>
    <h1>{heading}</h1>
    <div className="selected-numbers" aria-label="Números de esta reserva">
      {receipt.numbers.map(number => <span key={number}>{String(number).padStart(Math.max(3, String(receipt.numberCount).length), "0")}</span>)}
    </div>
    <dl className="reservation-price-breakdown">
      <div><dt>Precio original</dt><dd>{formatUYU(receipt.subtotalMinor)} UYU</dd></div>
      {receipt.discountMinor > 0 && <div><dt>Descuento</dt><dd>−{formatUYU(receipt.discountMinor)} UYU</dd></div>}
      <div className="reservation-total"><dt>Total en UYU</dt><dd>{formatUYU(receipt.totalMinor)} UYU</dd></div>
    </dl>
    {active && <>
      <p className="reservation-clock" aria-label="Tiempo restante">{minutes}:{String(seconds).padStart(2, "0")}</p>
      <p>{remaining > 0
        ? receipt.paymentStatus === "pending" ? "El proveedor está procesando el pago. La reserva permanece protegida mientras verificamos."
          : receipt.paymentStatus === "rejected" ? "El proveedor rechazó el pago. Podés volver a intentarlo mientras la reserva siga activa."
            : "Tiempo restante para iniciar el pago."
        : "Plazo cumplido. El servidor está comprobando si puede liberar los números."}</p>
    </>}
    {active && remaining > 0 && <button className="button w-full" onClick={startCheckout} disabled={startingCheckout}>
      {startingCheckout ? "Conectando con Mercado Pago…" : "Pagar con Mercado Pago · prueba"}
    </button>}
    <div className="payment-security payment-security-status"><strong>Mercado Pago · Checkout Pro</strong><span>Los datos de tarjeta se ingresan directamente en Mercado Pago. Esta conexión es de prueba y no cobra dinero real.</span></div>
    <p className="notice">La vuelta desde el checkout no confirma la compra. Confirmamos los números después de verificar el pago en el servidor.</p>
    {receipt.status === "paid" && <p className="notice">El enlace personal para consultar desde otro dispositivo se envía por correo cuando el servicio transaccional está configurado. La referencia sola no abre el comprobante.</p>}
    {checkoutError && <p role="alert" className="notice">{checkoutError}</p>}
    {error && <p role="alert" className="notice">{error} La falta de conexión no cancela una reserva.</p>}
    <Link className="text-link" href="/">Volver al inicio</Link>
  </section>;
}
