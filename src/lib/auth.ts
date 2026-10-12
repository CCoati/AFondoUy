import "server-only";
import { redirect } from "next/navigation";
import { authDatabase } from "@/lib/supabase/server";

export async function requireAdmin() {
  const db = await authDatabase();
  if (!db) redirect("/acceso?estado=configuracion");
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) redirect("/acceso");
  const { data: profile, error: permissionError } = await db.from("profiles").select("user_id,role,is_active").eq("user_id", user.id).maybeSingle();
  if (permissionError || !profile?.is_active || !["admin","owner"].includes(profile.role)) redirect("/acceso?estado=denegado");
  return { user, db, profile };
}
