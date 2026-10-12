import Link from "next/link";
import type { Metadata } from "next";
import { PageHeading } from "@/components/page-heading";
import { getSupabaseConfig } from "@/lib/env";
import { signIn } from "./actions";
export const metadata: Metadata = { title: "Acceso administrativo", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
const messages: Record<string, string> = {
  actualizada: "Contraseña actualizada. Iniciá sesión con tu nueva contraseña.",
  configuracion: "El acceso administrativo todavía no está configurado.",
  error: "No pudimos iniciar sesión. Revisá tus datos y volvé a intentar.",
  denegado: "Esta cuenta no tiene acceso administrativo.",
};
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const configured = !!getSupabaseConfig();
  const { estado } = await searchParams;
  return <div className="wrap page-body"><PageHeading eyebrow="ACCESO RESTRINGIDO" title="Administración"><p>Ingresá con la cuenta habilitada por el equipo de A FONDO UY.</p></PageHeading><div className="max-w-md panel">{(!configured || (estado && messages[estado])) && <p className="notice mb-6" role="status">{!configured ? messages.configuracion : messages[estado!]}</p>}<form action={signIn}><fieldset disabled={!configured} className="space-y-5"><div><label htmlFor="email">Correo electrónico</label><input id="email" name="email" type="email" autoComplete="username" maxLength={254} required /></div><div><label htmlFor="password">Contraseña</label><input id="password" name="password" type="password" autoComplete="current-password" maxLength={256} required /></div><button className="button w-full" type="submit" disabled={!configured}>Ingresar ↗</button></fieldset></form><Link className="text-link mt-6" href="/acceso/recuperar">Olvidé mi contraseña</Link><p className="muted text-xs mt-6 leading-relaxed">Acceso exclusivo para administradores. No se crean cuentas de participantes desde esta página.</p></div></div>;
}
