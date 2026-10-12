"use client";
import Image from "next/image";
import { useState } from "react";
import { Icon } from "@/components/icon";
import type { PrizeImage } from "@/domain/demo";
export function PrizeGallery({ images }: { images: PrizeImage[] }) {
  const [index, setIndex] = useState(0);
  const current = images[index]!;
  return <div className="gallery"><div className="gallery-main" id="prize-image"><Image src={current.src} alt={current.alt} fill loading="eager" sizes="(max-width: 900px) 100vw, 65vw" style={{ transform: `scale(${current.zoom || 1})`, transformOrigin: current.position || "center" }} /><span className="demo-tag">PRESENTACIÓN · IA</span><span className="gallery-counter">0{index + 1} / 0{images.length}</span><div className="gallery-arrows"><button aria-label="Imagen anterior" onClick={() => setIndex((index + images.length - 1) % images.length)}><Icon name="chevron" className="rotate-180" /></button><button aria-label="Imagen siguiente" onClick={() => setIndex((index + 1) % images.length)}><Icon name="chevron" /></button></div></div><div className="gallery-thumbs" role="group" aria-label="Vistas del premio">{images.map((image, i) => <button key={image.label} aria-pressed={index === i} aria-controls="prize-image" aria-label={image.label} onClick={() => setIndex(i)}><span><Image src={image.src} alt="" fill sizes="160px" style={{ transform: `scale(${image.zoom || 1})`, transformOrigin: image.position || "center" }} /></span><small>{image.label}</small></button>)}</div><p className="gallery-note" aria-live="polite">{current.label} · Foto original mejorada digitalmente con IA; el estado real puede diferir.</p></div>;
}
