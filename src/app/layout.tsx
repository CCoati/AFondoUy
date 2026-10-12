import type { Metadata } from "next";
import { SiteHeader, SiteFooter } from "@/components/site-shell";
import { getSiteUrl } from "@/lib/env";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: { default: "A FONDO UY | Pasión que se comparte", template: "%s | A FONDO UY" },
  description: "Conocé A FONDO UY, una plataforma de sorteos para Uruguay. Próximamente: sorteos, elección de números y resultados en un solo lugar.",
  robots: { index: true, follow: true },
  openGraph: { locale: "es_UY", type: "website", siteName: "A FONDO UY", images: [{ url: "/logo.png", width: 1254, height: 1254, alt: "A FONDO UY" }] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es-UY" data-scroll-behavior="smooth"><body><SiteHeader /><main id="contenido">{children}</main><SiteFooter /></body></html>;
}
