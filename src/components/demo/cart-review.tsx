"use client";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { demoHref, demoRaffles } from "@/domain/demo";
import { formatNumber } from "@/domain/raffle";
import { Icon } from "@/components/icon";
import { PageHeading } from "@/components/page-heading";
import { useQuote } from "@/components/numbers/use-quote";
import { PriceSummary } from "@/components/numbers/price-summary";
import { useDemoCart, saveDemoCart } from "./cart-store";

export function CartReview() {
  const cart = useDemoCart();
  const [complete, setComplete] = useState(false);
  const raffle = demoRaffles.find((r) => r.id === cart.raffleId);
  const pricing = useQuote(raffle?.id, cart.numbers.length, true);

  if (complete) return <div className="wrap page-body"><div className="demo-success" role="status"><Icon name="check" /><span className="eyebrow block mt-6">RECORRIDO COMPLETADO</span><h1>Ya imaginaste tu próxima historia.</h1><p>Completaste la demostración de A FONDO UY.<br /><strong>No se realizó ninguna compra, reserva ni cobro, y los datos de prueba no se enviaron ni guardaron.</strong></p><p className="mt-4">Tu selección de muestra sigue disponible para que puedas editarla.</p><button className="button" onClick={() => setComplete(false)}>Volver a mi selección <Icon name="arrow" /></button><Link className="text-link mt-4" href="/#sorteos">Explorar otros premios <Icon name="diagonal" /></Link></div></div>;

  if (!raffle || !cart.numbers.length) return <div className="wrap page-body"><PageHeading eyebrow="TU PRÓXIMA HISTORIA" title="Todo empieza con un número."><p>Todavía no elegiste ninguno. Explorá los premios de muestra y probá la experiencia, sin compras ni reservas.</p></PageHeading><div className="empty-state"><span className="result-symbol"><Icon name="ticket" /></span><div><h3>Tu selección te espera.</h3><p>Elegí tus favoritos o dejá que el azar te sorprenda.</p></div><Link className="button" href="/#sorteos">Explorar sorteos <Icon name="arrow" /></Link></div></div>;

  return <div className="wrap page-body">
    <nav className="checkout-steps" aria-label="Pasos de la experiencia"><span><Icon name="check" />Elegí tus números</span><Icon name="chevron" /><span className="current" aria-current="step"><b>2</b>Revisá tu selección</span></nav>
    <PageHeading eyebrow="ESTÁS A UN PASO · DEMOSTRACIÓN" title="Revisá. Imaginá. A fondo."><p>Todo lo que elegiste, en un solo lugar. Podés cambiar tus números antes de terminar el recorrido.</p></PageHeading>
    <div className="cart-layout">
      <div>
        <section className="cart-item" aria-label="Números elegidos">
          <div className="cart-prize"><div className="cart-image"><Image src={raffle.images[0]!.src} alt={raffle.images[0]!.alt} fill sizes="(max-width:700px) 115px, 400px" /></div><div><span className="demo-tag">PREMIO DEMO</span><h2>{raffle.title}</h2><p>{raffle.edition}</p></div></div>
          <p className="eyebrow mt-6">TUS NÚMEROS · {cart.numbers.length} ELEGIDOS</p>
          <div className="selected-numbers">{cart.numbers.map((number) => <button key={number} aria-label={`Quitar número ${formatNumber(number)}`} onClick={() => saveDemoCart(raffle.id, cart.numbers.filter((n) => n !== number))}>{formatNumber(number)}<Icon name="close" /></button>)}</div>
          <div className="cart-edit"><Link className="text-link" href={`${demoHref(raffle)}#numeros`}>Editar mis números <Icon name="arrow" /></Link><button onClick={() => saveDemoCart(raffle.id, [])}>Vaciar selección</button></div>
        </section>
        <form className="reservation-form cart-demo-form" onSubmit={(event) => { event.preventDefault(); setComplete(true); }}>
          <h2>Datos de contacto</h2>
          <p className="notice" role="note">Estás en una demostración. No ingreses datos reales: esta prueba no envía ni guarda la información.</p>
          <label>Nombre y apellido<input name="fullName" autoComplete="off" minLength={2} maxLength={160} required /></label>
          <label>Correo electrónico<input name="email" type="email" autoComplete="off" maxLength={254} required /></label>
          <label>WhatsApp o celular<input name="phone" type="tel" inputMode="tel" autoComplete="off" minLength={6} maxLength={32} placeholder="09X XXX XXX" required /></label>
          <fieldset className="payment-methods">
            <legend>Método de pago</legend>
            <label className="payment-method"><input type="radio" name="paymentMethod" value="mercadopago" defaultChecked required /><span className="payment-method-copy"><strong>Mercado Pago</strong><small>Checkout Pro · simulación de prueba</small></span><span className="payment-method-tag">DEMO</span></label>
            <p className="payment-security">En una compra real completarías el pago directamente en Mercado Pago. No ingreses los datos de tu tarjeta en A FONDO UY.</p>
          </fieldset>
          <label className="consent-row"><input type="checkbox" required /><span>Acepto las <Link href="/terminos" target="_blank" rel="noreferrer">condiciones de muestra</Link> y leí la <Link href="/privacidad" target="_blank" rel="noreferrer">política de privacidad</Link>.</span></label>
          <button className="button w-full" disabled={!pricing.quote}>Probar el recorrido de pago <Icon name="arrow" /></button>
        </form>
      </div>
      <aside className="checkout-card" aria-label="Resumen de la demostración"><h2>Tu resumen</h2><PriceSummary quote={pricing.quote} error={pricing.error} retry={pricing.refresh} /><p className="summary-note"><Icon name="info" />Sin compras. Sin reservas. Sin cobros.</p><p className="notice">Los precios y promociones son ilustrativos. No existe un pedido real asociado a esta selección.</p></aside>
    </div>
  </div>;
}
