"use client";
import Link from "next/link";
import type { DemoRaffle } from "@/domain/demo";
import { formatNumber } from "@/domain/raffle";
import { Icon } from "@/components/icon";
import { PriceSummary } from "@/components/numbers/price-summary";
import type { useQuote } from "@/components/numbers/use-quote";
export function SelectionSummary({ raffle, selected, onRemove, pricing }: { raffle: DemoRaffle; selected: number[]; onRemove: (number: number) => void; pricing: ReturnType<typeof useQuote> }) {
  return <aside className="selection-summary" aria-label="Resumen de tu selección"><div className="summary-heading"><Icon name="ticket" /><h3>Tu próxima historia</h3><span className="demo-tag">DEMO</span></div><p className="summary-prize">{raffle.title} <span>{raffle.edition}</span></p><div className="selected-numbers">{selected.length ? selected.map(number => <button key={number} onClick={() => onRemove(number)} aria-label={`Quitar número ${formatNumber(number)}`}>{formatNumber(number)}<Icon name="close" /></button>) : <p>Elegí tus números y empezá a imaginar.</p>}</div><PriceSummary quote={pricing.quote} error={pricing.error} retry={pricing.refresh} />{selected.length > 0 && pricing.quote ? <Link className="button w-full" href="/carrito">Revisar selección <Icon name="arrow" /></Link> : <button className="button w-full" disabled>{pricing.loading ? "Calculando…" : "Elegí al menos un número"}</button>}<p className="summary-note"><Icon name="info" />Demostración sin compras ni reservas. Promos de 3 y 5 calculadas en el servidor.</p></aside>;
}
