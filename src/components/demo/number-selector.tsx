"use client";
import Link from "next/link";
import { demoRaffles, inventoryCounts, type DemoRaffle } from "@/domain/demo";
import { formatUYU } from "@/domain/raffle";
import { Icon } from "@/components/icon";
import { NumberGrid } from "@/components/numbers/number-grid";
import { useQuote } from "@/components/numbers/use-quote";
import { useDemoCart, saveDemoCart } from "./cart-store";
import { SelectionSummary } from "./selection-summary";
export function NumberSelector({ raffle }: { raffle: DemoRaffle }) {
  const cart = useDemoCart(), selected = cart.raffleId === raffle.id ? cart.numbers : [];
  const other = cart.raffleId !== raffle.id && cart.numbers.length ? demoRaffles.find(r => r.id===cart.raffleId) : undefined;
  const pricing = useQuote(raffle.id,selected.length,true), count = inventoryCounts(raffle);
  return <section id="numeros" className="number-section wrap"><div className="section-heading"><div><p className="eyebrow"><span className="red-line" /> EL MOMENTO DE ELEGIR</p><h2>Tu número. Tu historia.</h2></div><span className="outline-label">{count.available} DISPONIBLES · DEMO</span></div>{other && <div className="switch-raffle"><p>Tenés números elegidos para <strong>{other.title}</strong>. Cada selección corresponde a un sorteo.</p><button className="button secondary" onClick={() => saveDemoCart(raffle.id,[])}>Reemplazar por este sorteo</button><Link className="text-link" href="/carrito">Conservar selección</Link></div>}<div className="selection-layout"><NumberGrid numbers={raffle.numbers} count={raffle.numberCount} selected={selected} onChange={numbers => saveDemoCart(raffle.id,numbers)} disabled={!!other} demo /><SelectionSummary raffle={raffle} selected={selected} onRemove={number => saveDemoCart(raffle.id,selected.filter(n => n!==number))} pricing={pricing} /></div><div className="mobile-purchase"><div><span>{selected.length} números elegidos · demo</span><strong>{pricing.quote ? formatUYU(pricing.quote.totalMinor) : "…"} <small>UYU</small></strong></div>{selected.length && pricing.quote ? <Link className="button" href="/carrito">Revisar <Icon name="arrow" /></Link> : <a className="button" href="#numeros">Elegí tus números</a>}</div></section>;
}
