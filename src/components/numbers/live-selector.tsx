"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatNumber, formatUYU, type Raffle } from "@/domain/raffle";
import { NumberGrid } from "./number-grid";
import { PriceSummary } from "./price-summary";
import { useQuote } from "./use-quote";
import { useAvailability } from "./use-availability";
import { ReserveForm } from "./reserve-form";
export function LiveSelector({ raffle }: { raffle: Raffle }) {
  const [selected,setSelected] = useState<number[]>([]), [checkout,setCheckout] = useState(false);
  const [recovery,setRecovery] = useState("");
  const router=useRouter();
  async function recover() {
    try {const response=await fetch(`/api/reservas?raffleId=${raffle.id}`,{cache:"no-store"});const body=await response.json();if(!response.ok) throw new Error(body.message);if(body.orderId) router.push(`/checkout/${body.orderId}`);else setRecovery("No hay una reserva activa en esta sesión.");}
    catch(e){setRecovery(e instanceof Error?e.message:"No pudimos recuperar tu reserva.");}
  }
  const { snapshot, connected, error, refresh } = useAvailability(raffle.id);
  const valid = selected.filter(n => snapshot?.numbers.some(item=>item.number===n && item.state==="available"));
  const conflict = snapshot && valid.length !== selected.length;
  const pricing = useQuote(raffle.id,valid.length);
  const enabled = connected && !!snapshot?.active && !!valid.length && !!pricing.quote && !conflict;
  const available = snapshot?.numbers.filter(n=>n.state==="available").length;
  const sold = snapshot?.numbers.filter(n=>n.state==="sold").length ?? 0;
  return <section className="number-section" id="numeros"><div className="section-heading"><div><p className="eyebrow">ELEGÍ TU PRÓXIMA HISTORIA</p><h2>Tus números, a un toque.</h2></div><span className="outline-label">{available ?? "…"} DISPONIBLES</span></div><button className="text-link recover-reservation" onClick={recover}>Recuperar mi reserva</button>{recovery && <p role="status" className="notice">{recovery}</p>}<div className="live-status" role="status">{connected ? "Disponibilidad actualizada · sincronización automática" : error || "Consultando disponibilidad…"}{error && <button className="text-link" onClick={refresh}>Reintentar</button>}</div>{snapshot && <div className="live-progress"><label htmlFor="sales-progress">{sold} vendidos de {snapshot.count}</label><progress id="sales-progress" value={sold} max={snapshot.count} /></div>}{conflict && <div className="notice" role="alert">Algunos números elegidos dejaron de estar disponibles. No se reservaron.<button className="text-link" onClick={()=>{setSelected(valid);pricing.refresh();}}>Quitar los no disponibles y revisar total</button></div>}{snapshot && !snapshot.active && <p className="notice">Este sorteo ya no admite nuevas reservas.</p>}<div className="selection-layout">{snapshot ? <NumberGrid numbers={snapshot.numbers} count={snapshot.count} selected={valid} onChange={setSelected} disabled={!connected || !snapshot.active} /> : <div className="panel" aria-busy="true">Cargando números…</div>}<aside className="selection-summary" id="resumen"><h3>Tu selección · {valid.length} números</h3><div className="selected-numbers">{valid.map(n=><button key={n} aria-label={`Quitar número ${formatNumber(n,snapshot?.count ?? raffle.number_count)}`} onClick={()=>setSelected(selected.filter(x=>x!==n))}>{formatNumber(n,snapshot?.count ?? raffle.number_count)} ×</button>)}</div><PriceSummary quote={pricing.quote} error={pricing.error} retry={pricing.refresh} /><p className="summary-note">La selección es local. Al iniciar checkout, reservamos por {pricing.quote?.reservationMinutes ?? "…"} minutos.</p>{!checkout ? <button className="button w-full" disabled={!enabled} onClick={()=>setCheckout(true)}>Continuar con mis números</button> : <ReserveForm raffleId={raffle.id} numbers={valid} total={pricing.quote?.totalMinor ?? 0} enabled={enabled} onConflict={()=>{refresh();pricing.refresh();}} />}</aside></div><div className="mobile-purchase"><div><span>{valid.length} números elegidos</span><strong>{pricing.quote ? formatUYU(pricing.quote.totalMinor) : "…"} <small>UYU</small></strong></div><a className="button" href="#resumen">Revisar selección</a></div></section>;
}
