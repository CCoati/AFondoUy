import { inventoryCounts, type DemoRaffle } from "@/domain/demo";
export function RaffleProgress({ raffle, compact = false }: { raffle: DemoRaffle; compact?: boolean }) {
  const count = inventoryCounts(raffle);
  return <div className={`raffle-progress ${compact ? "compact" : ""}`}>
    <div className="progress-label"><span><strong>{count.sold}</strong> de {raffle.numberCount} vendidos</span><span className="micro-label">DEMO</span></div>
    <div className="progress-track" role="img" aria-label={`Datos de demostración: ${count.sold} vendidos, ${count.reserved} reservados, ${count.blocked} bloqueados y ${count.available} disponibles de ${raffle.numberCount}`}><span style={{ width: `${count.sold / raffle.numberCount * 100}%` }} /><span className="reserved-progress" style={{ width: `${count.reserved / raffle.numberCount * 100}%` }} /><span className="blocked-progress" style={{ width: `${count.blocked / raffle.numberCount * 100}%` }} /></div>
    <div className="progress-detail"><span>{count.available} disponibles</span><span>{count.reserved} reservados · {count.blocked} bloqueados</span></div>
  </div>;
}
