import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeading } from "@/components/page-heading";
import { findRaffle } from "@/lib/raffles";
import { formatNumber, formatUYU } from "@/domain/raffle";
import { LiveSelector } from "@/components/numbers/live-selector";
import { publishedImages } from "@/lib/raffle-media";
import { PublishedGallery } from "@/components/prize-gallery";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const raffle = await findRaffle((await params).slug);
  if (!raffle || raffle.is_demo || raffle.status !== "active") return { title: raffle?.title || "Sorteo no encontrado", robots: { index: false, follow: false } };
  const description = raffle.description.slice(0, 155);
  const path = `/sorteos/${encodeURIComponent(raffle.slug)}`;
  return { title: raffle.title, description, alternates: { canonical: path }, openGraph: { title: `${raffle.title} | A FONDO UY`, description, url: path, type: "website", images: [{ url: "/logo.png", alt: `A FONDO UY · ${raffle.title}` }] }, twitter: { card: "summary_large_image", title: raffle.title, description, images: ["/logo.png"] } };
}
export default async function RafflePage({ params }: Props) {
  const raffle = await findRaffle((await params).slug);
  if (!raffle) notFound();
  const images=await publishedImages(raffle.id);
  return <div className="wrap page-body"><PageHeading eyebrow={raffle.is_demo ? "SORTEO FICTICIO · DEMO DE DESARROLLO" : "A FONDO UY · SORTEOS"} title={raffle.title}><p>{raffle.description}</p></PageHeading>{images.length>0 && <PublishedGallery images={images} />}<div className="panel mt-6"><p className="text-3xl font-bold">{formatUYU(raffle.price_minor)} UYU <span className="text-sm muted font-normal">por número</span></p><p className="mt-5 muted">{raffle.number_count} números · {formatNumber(1, raffle.number_count)} al {formatNumber(raffle.number_count, raffle.number_count)}</p><h2 className="mt-8 text-2xl">Bases del sorteo</h2><p className="mt-5 whitespace-pre-wrap leading-relaxed muted">{raffle.terms}</p></div><LiveSelector raffle={raffle} /><Link className="text-link mt-8 inline-flex" href="/#sorteos">← Volver a los sorteos</Link></div>;
}
