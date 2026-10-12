"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { authDatabase } from "@/lib/supabase/server";

export async function signIn(form: FormData) {
  const input = z.object({ email: z.email().max(254), password: z.string().min(1).max(256) }).safeParse({ email: form.get("email"), password: form.get("password") });
  if (!input.success) redirect("/acceso?estado=error");
  const db = await authDatabase();
  if (!db) redirect("/acceso?estado=configuracion");
  const { error } = await db.auth.signInWithPassword(input.data);
  if (error) redirect("/acceso?estado=error");
  const {data:{user}}=await db.auth.getUser();
  const {data:profile}=user ? await db.from("profiles").select("role,is_active").eq("user_id",user.id).maybeSingle() : {data:null};
  if(!profile?.is_active || !["admin","owner"].includes(profile.role)) {
    await db.auth.signOut();redirect("/acceso?estado=denegado");
  }
  redirect("/admin");
}

export async function signOut() {
  const db = await authDatabase();
  if (db) await db.auth.signOut();
  redirect("/acceso");
}
