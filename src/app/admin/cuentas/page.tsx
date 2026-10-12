import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { AdminForm } from "@/components/admin-form";
import { PageHeading } from "@/components/page-heading";
export default async function AccountsPage() {
  const {db,profile}=await requireAdmin();if(profile.role!=="owner") redirect("/admin");
  const {data,error}=await db.from("profiles").select("user_id,display_name,role,is_active").order("created_at").limit(100);
  const profiles=z.array(z.object({user_id:z.uuid(),display_name:z.string(),role:z.enum(["viewer","admin","owner"]),is_active:z.boolean()})).safeParse(data);
  return <div className="admin-content"><PageHeading eyebrow="SOLO PROPIETARIOS" title="Accesos del equipo."><p>Las cuentas se crean y verifican en Supabase Auth. Aquí se asigna o revoca su acceso administrativo.</p></PageHeading><Link className="admin-inline-link" href="/admin">← Volver al resumen</Link>{error || !profiles.success ? <p className="notice">No pudimos cargar las cuentas.</p> : profiles.data.map(p=><section key={p.user_id} className="admin-card admin-card-below"><h2>{p.display_name || "Cuenta administrativa"}</h2><p className="account-id">{p.user_id}</p><AdminForm submit="Actualizar acceso"><input type="hidden" name="operation" value="role" /><input type="hidden" name="userId" value={p.user_id} /><label>Permiso<select name="role" defaultValue={p.role}><option value="viewer">Sin acceso administrativo</option><option value="admin">Administrador</option><option value="owner">Propietario</option></select></label><label className="consent-row"><input name="active" type="checkbox" defaultChecked={p.is_active} />Cuenta activa</label><label className="consent-row"><input name="confirmRoleChange" type="checkbox" required/> Confirmo actualizar permisos o estado de esta cuenta.</label></AdminForm></section>)}</div>;
}
