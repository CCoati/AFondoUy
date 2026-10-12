import type { Metadata } from "next";
import { PageHeading } from "@/components/page-heading";
import { Faq } from "@/components/faq";
export const metadata: Metadata = { title: "Preguntas frecuentes" };
export default function FaqPage() {
  return <div className="wrap page-body"><PageHeading eyebrow="LAS COSAS, CLARAS" title="Antes de dar el próximo paso."><p>Conocé cómo funciona la demostración de A FONDO UY.</p></PageHeading><div className="max-w-4xl"><Faq /></div></div>;
}
