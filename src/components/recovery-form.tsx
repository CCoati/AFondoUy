"use client";
import { useActionState } from "react";
import Link from "next/link";
import { requestRecovery, resetPassword } from "@/app/acceso/recuperar/actions";
export function RecoveryForm({tokenHash,configured}:{tokenHash?:string;configured:boolean}) {
  const [state,action,pending]=useActionState(tokenHash?resetPassword:requestRecovery,{message:"",success:false});
  return <form action={action} className="reservation-form"><fieldset disabled={!configured || pending || state.success}>{tokenHash ? <><input type="hidden" name="tokenHash" value={tokenHash} /><label>Nueva contraseña<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label><label>Repetí la contraseña<input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label><p className="muted">Usá al menos 12 caracteres. Después del cambio deberás iniciar sesión nuevamente.</p></> : <label>Correo de tu cuenta administrativa<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>}<button className="button w-full" type="submit">{pending?"Procesando…":tokenHash?"Guardar nueva contraseña":"Enviar enlace de recuperación"}</button></fieldset>{!configured && <p className="notice">Supabase Auth todavía no está conectado.</p>}{state.message && <p className="notice" role="status">{state.message}</p>}<Link className="text-link mt-6" href={tokenHash?"/acceso/recuperar":"/acceso"}>{tokenHash?"Solicitar otro enlace":"Volver al acceso"}</Link></form>;
}
