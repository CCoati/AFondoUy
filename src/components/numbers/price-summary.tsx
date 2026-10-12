import { formatUYU } from "@/domain/raffle";
import type { Quote } from "@/domain/reservation";
export function PriceSummary({ quote, error, retry }: { quote?: Quote; error?: string; retry: () => void }) {
  if (error) return <div className="notice" role="status">{error}<button className="text-link" onClick={retry}>Volver a cotizar</button></div>;
  if (!quote) return <p role="status" className="notice">Calculando el mejor precio…</p>;
  return <div className="summary-lines"><p><span>{quote.quantity} números × {formatUYU(quote.unitPriceMinor)}</span><span>{formatUYU(quote.subtotalMinor)}</span></p>{quote.discountMinor > 0 && <p className="discount-line"><span>Promociones aplicadas</span><span>−{formatUYU(quote.discountMinor)}</span></p>}<div className="summary-total"><span>Total <small>UYU</small></span><strong>{formatUYU(quote.totalMinor)}</strong></div>{quote.discountMinor > 0 && <p className="quote-packs">{quote.breakdown.filter(p => p.quantity > 1).map(p => p.name).join(" + ")}</p>}</div>;
}
