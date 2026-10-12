"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { authDatabase } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/env";
import { newPasswordSchema } from "@/domain/auth";
export type RecoveryState={message:string;success:boolean};
export async function requestRecovery(_state:RecoveryState,form:FormData):Promise<RecoveryState> {
  const email=z.email().max(254).safeParse(form.get("email"));
  if(!email.success) return {message:"Ingresá un correo electrónico válido.",success:false};
  const db=await authDatabase();if(!db) return {message:"La recuperación todavía no está configurada.",success:false};
  // Uniform response: no account/membership enumeration, including provider rate limits.
  try {await db.auth.resetPasswordForEmail(email.data,{redirectTo:new URL("/acceso/restablecer",getSiteUrl()).toString()});} catch { /* Same external response. */ }
  return {message:"Si el correo corresponde a una cuenta, recibirás un enlace. Revisá también spam; si ya pediste uno, esperá antes de repetir.",success:true};
}
export async function resetPassword(_state:RecoveryState,form:FormData):Promise<RecoveryState> {
  const input=newPasswordSchema.safeParse({password:form.get("password"),confirmPassword:form.get("confirmPassword"),tokenHash:form.get("tokenHash")});
  if(!input.success) return {message:"Usá al menos 12 caracteres y repetí la misma contraseña. El enlace debe ser válido.",success:false};
  const db=await authDatabase();if(!db) return {message:"La recuperación todavía no está configurada.",success:false};
  // Verify and change in the SAME server operation; an ordinary logged-in session cannot bypass the recovery token.
  const {data,error}=await db.auth.verifyOtp({type:"recovery",token_hash:input.data.tokenHash});
  if(error || !data.user) return {message:"El enlace venció o ya se usó. Solicitá uno nuevo.",success:false};
  const {data:profile}=await db.from("profiles").select("role,is_active").eq("user_id",data.user.id).maybeSingle();
  if(!profile?.is_active || !["admin","owner"].includes(profile.role)) {
    await db.auth.signOut();return {message:"No pudimos completar la recuperación de acceso administrativo.",success:false};
  }
  const {error:updateError}=await db.auth.updateUser({password:input.data.password});
  await db.auth.signOut({scope:"global"});
  if(updateError) return {message:"No se cambió la contraseña. Solicitá un enlace nuevo y elegí una contraseña diferente que cumpla los requisitos.",success:false};
  redirect("/acceso?estado=actualizada");
}
