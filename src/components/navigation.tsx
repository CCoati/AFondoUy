"use client";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "./icon";
export function Navigation() {
  const [open, setOpen] = useState(false);
  return <div className="navigation"><button className="menu-toggle" aria-label={open ? "Cerrar menú" : "Abrir menú"} aria-expanded={open} aria-controls="primary-navigation" onClick={() => setOpen(!open)}><Icon name={open ? "close" : "menu"} /></button><nav id="primary-navigation" className={open ? "is-open" : ""} aria-label="Navegación principal"><Link onClick={() => setOpen(false)} href="/#sorteos">Sorteos</Link><Link onClick={() => setOpen(false)} href="/#como-participar">Cómo participar</Link><Link onClick={() => setOpen(false)} href="/resultados">Resultados</Link><Link onClick={() => setOpen(false)} href="/#preguntas">Ayuda</Link></nav></div>;
}
