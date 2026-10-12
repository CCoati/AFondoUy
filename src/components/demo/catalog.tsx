"use client";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { demoRaffles, demoHref, upcomingMoto } from "@/domain/demo";
import { formatUYU } from "@/domain/raffle";
import { Icon } from "@/components/icon";
import { RaffleProgress } from "./progress";

const categories = ["Todos", "Auto", "Moto"] as const;
export function DemoCatalog() {
  const [category, setCategory] = useState<string>("Todos");
  const showCar = category !== "Moto";
  const showMoto = category !== "Auto";
  const countLabel = category === "Todos" ? "1 sorteo de muestra · 1 próximo" : category === "Auto" ? "1 sorteo de muestra" : "1 sorteo próximo";

  return <>
    <div className="catalog-toolbar"><div className="filter-tabs" role="group" aria-label="Filtrar sorteos por categoría">{categories.map((item) => <button key={item} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}{item === "Todos" && <span>02</span>}</button>)}</div><p className="muted text-sm" aria-live="polite">{countLabel}</p></div>
    <div className="prize-grid">
      {showCar && demoRaffles.map((raffle) => <article className="prize-card" key={raffle.id}><Link href={demoHref(raffle)} className="prize-card-image" aria-label={`Ver ${raffle.title}, sorteo de demostración`}><Image src={raffle.images[0]!.src} alt={raffle.images[0]!.alt} fill sizes="(max-width: 600px) 100vw, 50vw" /><span className="image-tag">BMW</span><span className="demo-tag">DEMO</span><span className="image-open"><Icon name="diagonal" /></span></Link><div className="prize-card-content"><p className="eyebrow">{raffle.edition}</p><h3><Link href={demoHref(raffle)}>{raffle.title}</Link></h3><div className="card-price"><strong>{formatUYU(raffle.priceMinor)} <small>UYU</small></strong><span>por número</span></div><RaffleProgress raffle={raffle} compact /><Link className="card-link" href={`${demoHref(raffle)}#numeros`}>Elegí tus números <Icon name="arrow" /></Link></div></article>)}
      {showMoto && <article className="prize-card upcoming-card" aria-label="Próximo sorteo conceptual: Moto Racing"><div className="prize-card-image"><Image src={upcomingMoto.image.src} alt={upcomingMoto.image.alt} fill sizes="(max-width: 600px) 100vw, 50vw" /><span className="image-tag">MOTO</span><span className="demo-tag">CONCEPTO</span></div><div className="prize-card-content"><p className="eyebrow">{upcomingMoto.edition}</p><h3>{upcomingMoto.title}</h3><p className="upcoming-copy">Estamos preparando la próxima propuesta de sorteo. La imagen es conceptual; pronto compartiremos los detalles.</p><div className="card-link upcoming-link"><span>Próximamente</span><span className="outline-label">EN PREPARACIÓN</span></div></div></article>}
    </div>
  </>;
}
