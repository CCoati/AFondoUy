import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { demoRaffles } from "@/domain/demo";
import { formatUYU } from "@/domain/raffle";
import { Icon } from "@/components/icon";
import { PrizeGallery } from "@/components/demo/gallery";
import { RaffleProgress } from "@/components/demo/progress";
import { NumberSelector } from "@/components/demo/number-selector";
import { Faq } from "@/components/faq";
type Props = { params: Promise<{ slug: string }> };
export function generateStaticParams() { return demoRaffles.map((raffle) => ({ slug: raffle.id })); }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const raffle = demoRaffles.find((r) => r.id === slug);
  return { title: `${raffle?.title || "Sorteo"} · Demostración`, robots: { index: false, follow: false } };
}
export default async function DemoRafflePage({ params }: Props) {
  const { slug } = await params;
  const raffle = demoRaffles.find((r) => r.id === slug);
  if (!raffle) notFound();
  return <div className="raffle-detail-page"><div className="wrap"><nav className="breadcrumb" aria-label="Ruta de navegación"><Link href="/">Inicio</Link><Icon name="chevron" /><Link href="/#sorteos">Sorteos</Link><Icon name="chevron" /><span aria-current="page">{raffle.title}</span></nav><div className="detail-heading"><div><p className="eyebrow">{raffle.category} <span>/</span> {raffle.edition}</p><h1>{raffle.title}<span className="text-accent">.</span></h1></div><span className="outline-label"><span className="demo-dot" /> SORTEO DE DEMOSTRACIÓN</span></div><div className="prize-detail-grid"><PrizeGallery images={raffle.images} /><div className="prize-info"><span className="eyebrow">PODÉS EMPEZAR POR UN NÚMERO</span><p className="detail-price">{formatUYU(raffle.priceMinor)}<span>UYU / número</span></p><RaffleProgress raffle={raffle} /><div className="promotion-box"><Icon name="ticket" /><div><strong>3 números por {formatUYU(raffle.promotion.totalMinor)}</strong><p>Ahorrá 10% · Promoción de muestra</p></div></div><Link className="button w-full" href="#numeros">Elegí tus números <Icon name="arrow" /></Link><p className="info-footnote"><Icon name="info" />Demo interactiva. No se realiza ningún cobro.</p><div className="draw-condition"><Icon name="clock" /><div><strong>Fecha del sorteo</strong><p>Sin programar · Edición de demostración</p><a className="text-link" href="#condiciones">Ver condiciones <Icon name="arrow" /></a></div></div></div></div><div className="prize-description"><div><p className="eyebrow">MÁS QUE UN PREMIO</p><h2>BMW con espíritu de pista.</h2><p>{raffle.description}</p></div><dl>{raffle.features.map((feature) => <div key={feature.label}><dt>{feature.label}</dt><dd>{feature.value}</dd></div>)}</dl></div></div><NumberSelector raffle={raffle} /><section id="condiciones" className="wrap section conditions-section"><div><p className="eyebrow">SIN SORPRESAS</p><h2>Antes de participar.</h2></div><div className="conditions-list"><details open><summary>Sobre esta demostración</summary><p>El BMW de las imágenes corresponde al premio presentado. Sus fotos fueron mejoradas digitalmente con IA; la apariencia puede diferir del estado real. El precio, la promoción y la disponibilidad de los 200 números son datos de muestra: no hay ventas, reservas ni sorteo activo. La selección visual no reserva números y esta demo no realiza cobros.</p></details><details><summary>Promoción y selección</summary><p>En esta demo hay packs de 3 y de 5 números. El servidor combina packs e individuales para aplicar el menor total disponible. Podés elegir hasta 20 números de un mismo sorteo y modificar tu selección antes de finalizar el recorrido.</p></details><details><summary>Fecha, condiciones y entrega</summary><p>No existe una fecha de sorteo o entrega para esta edición de muestra. Antes de publicar un sorteo real se deberán informar el organizador, las autorizaciones, el premio, la mecánica, las condiciones de participación y las políticas de cancelación y entrega.</p><Link className="text-link" href="/terminos">Leer términos y condiciones <Icon name="arrow" /></Link></details></div></section><section className="wrap section faq-section"><div><p className="eyebrow">TE ACOMPAÑAMOS</p><h2>Todo claro.<br />Desde el principio.</h2></div><Faq limit={3} /></section></div>;
}
