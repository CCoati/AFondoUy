import Link from "next/link";
import { PageHeading } from "@/components/page-heading";
export default function NotFound() {
  return <div className="wrap page-body"><PageHeading eyebrow="404 · FUERA DE PISTA" title="No encontramos esa página."><p>El enlace puede haber cambiado o el sorteo todavía no está publicado.</p></PageHeading><Link className="button" href="/">Volver al inicio ↗</Link></div>;
}
