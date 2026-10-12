import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/page-heading";

export const metadata: Metadata = { title: "Transparencia" };

export default function TransparencyPage() {
  return <div className="wrap page-body"><PageHeading eyebrow="INFORMACIÓN VERIFICABLE" title="Las cosas, claras."><p>Publicaremos los datos y documentos cuando estén confirmados por el organizador y revisados para su publicación.</p></PageHeading>
    <div className="transparency-grid">
      <section className="panel"><p className="eyebrow">ORGANIZADOR</p><h2>Información pendiente</h2><p className="muted">La identidad legal, domicilio y canales comerciales del organizador todavía no se han proporcionado para publicación.</p><span className="status-pill">Pendiente de completar</span></section>
      <section className="panel"><p className="eyebrow">AUTORIZACIONES</p><h2>Estado legal</h2><p className="muted">No se afirma que exista una autorización para realizar sorteos. El estado deberá confirmarse para cada actividad con asesoramiento profesional en Uruguay antes de ofrecer participación.</p><span className="status-pill">Sin confirmar</span></section>
      <section className="panel"><p className="eyebrow">REGLAS</p><h2>Bases por sorteo</h2><p className="muted">Las condiciones específicas se mostrarán en la ficha del sorteo una vez completadas y revisadas. La versión general disponible es un borrador.</p><Link className="text-link" href="/terminos">Leer borrador de condiciones</Link></section>
      <section className="panel"><p className="eyebrow">PAGOS Y PREMIOS</p><h2>Cancelaciones y entrega</h2><p className="muted">Los procedimientos comerciales de devolución, reclamos y entrega del premio están pendientes de definición. No se ofrecen sorteos reales ni pagos productivos.</p></section>
    </div>
    <p className="transparency-note">Los resultados publicados requieren asignación confirmada y evidencia registrada. El sitio no publicará nombres ni datos de contacto de participantes.</p>
  </div>;
}
