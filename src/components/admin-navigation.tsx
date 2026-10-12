"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/acceso/actions";

const links = [
  ["/admin", "Resumen", "01"], ["/admin/sorteos", "Sorteos", "02"],
  ["/admin/numeros", "Números", "03"], ["/admin/participantes", "Participantes", "04"],
  ["/admin/transacciones", "Transacciones", "05"], ["/admin/promociones", "Promociones", "06"],
  ["/admin/resultados", "Resultados", "07"], ["/admin/configuracion", "Configuración", "08"],
] as const;

export function AdminNavigation() {
  const pathname = usePathname();
  return <aside className="admin-sidebar" aria-label="Navegación administrativa">
    <Link href="/admin" className="admin-brand"><span className="admin-brand-mark">AF</span><span><strong>A FONDO UY</strong><small>ADMINISTRACIÓN</small></span></Link>
    <p className="admin-nav-label">PLATAFORMA</p>
    <nav className="admin-nav">{links.map(([href,label,number])=><Link key={href} href={href} aria-current={(href==="/admin"?pathname==="/admin":pathname===href||pathname.startsWith(`${href}/`))?"page":undefined}><span className="admin-nav-number">{number}</span>{label}<span className="admin-nav-arrow" aria-hidden="true">↗</span></Link>)}</nav>
    <div className="admin-sidebar-bottom"><Link href="/" className="admin-public-link">↗ <span>Ver sitio público</span></Link><form action={signOut}><button className="admin-signout">Cerrar sesión <span aria-hidden="true">→</span></button></form><small>Montevideo · UY</small></div>
  </aside>;
}
