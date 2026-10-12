import Link from "next/link";
import type { Metadata } from "next";
import { PageHeading } from "@/components/page-heading";
import { RaffleList } from "@/components/raffle-list";
import { listRaffles } from "@/lib/raffles";
import { publishedResults } from "@/lib/raffle-media";
export const metadata: Metadata = { title: "Historial y resultados" };
export const dynamic = "force-dynamic";
export default async function ResultsPage() {
  const {results,unavailable}=await publishedResults();
  return <div className="wrap page-body"><PageHeading eyebrow="CADA SORTEO, UNA HISTORIA" title="Historial y resultados"><p>Consultá los resultados verificados. No publicamos datos de contacto de los participantes.</p></PageHeading>{unavailable && <p className="notice" role="status">No pudimos consultar los resultados. Intentá nuevamente.</p>}{results.length>0 ? <div className="results-grid">{results.map(result=><article className="panel" key={result.id}><p className="eyebrow">RESULTADO VERIFICADO</p><h2 className="text-2xl mt-4">{result.title}</h2><p className="winning-number">N.º {String(result.winning_number).padStart(3,"0")}</p><p className="muted">{new Date(result.drawn_at).toLocaleString("es-UY",{timeZone:"America/Montevideo"})}</p><p className="muted">Modalidad: {result.draw_mode === "national_lottery" ? "Lotería nacional" : result.draw_mode === "public_draw" ? "Sorteo público" : result.draw_mode === "notary" ? "Ante escribano" : result.draw_mode === "other" ? "Otra modalidad" : "Pendiente de publicar"}</p>{result.evidenceUrl && <a className="text-link mt-3" href={result.evidenceUrl} target="_blank" rel="noreferrer">Ver acta o evidencia verificada ↗</a>}<Link className="text-link mt-2" href={`/sorteos/${result.slug}`}>Ver sorteo</Link></article>)}</div> : !unavailable && <p className="notice">Todavía no hay resultados verificados publicados.</p>}<RaffleList listing={await listRaffles(true)} history /></div>;
}
