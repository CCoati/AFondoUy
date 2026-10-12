"use client";
import { useState } from "react";
import Image from "next/image";
export function PublishedGallery({images}:{images:{src:string;alt:string;label:string}[]}) {
  const [index,setIndex]=useState(0),selected=images[index]??images[0];
  if(!selected) return null;
  return <div className="gallery"><div className="gallery-main"><Image src={selected.src} alt={selected.alt} fill unoptimized sizes="(max-width:700px) 100vw, 800px" /></div>{images.length>1 && <div className="gallery-thumbs" role="group" aria-label="Galería del premio">{images.map((image,i)=><button key={image.src} aria-pressed={i===index} onClick={()=>setIndex(i)}>{image.label}</button>)}</div>}</div>;
}
