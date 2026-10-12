import { PageHeading } from "@/components/page-heading";
import { RaffleList } from "@/components/raffle-list";
import { listRaffles } from "@/lib/raffles";
export const metadata={title:"Sorteos publicados"};
export const dynamic="force-dynamic";
export default async function RafflesPage() {
  return <div className="wrap page-body"><PageHeading eyebrow="A FONDO UY" title="Sorteos publicados."><p>Los ejemplos de desarrollo se identifican con la etiqueta DEMO. Los pagos reales están deshabilitados.</p></PageHeading><RaffleList listing={await listRaffles()} /></div>;
}
