import Link from "next/link";
import { PageHeading } from "@/components/page-heading";
import { RecoveryForm } from "@/components/recovery-form";
import { getSupabaseConfig } from "@/lib/env";
import { recoveryTokenSchema } from "@/domain/auth";
export const metadata={title:"Nueva contraseña",robots:{index:false,follow:false},referrer:"no-referrer" as const};
export const dynamic="force-dynamic";
export default async function ResetPage({searchParams}:{searchParams:Promise<{token_hash?:string;type?:string}>}) {
  const params=await searchParams, token=recoveryTokenSchema.safeParse(params.token_hash);
  return <div className="wrap page-body"><PageHeading eyebrow="RECUPERACIÓN SEGURA" title="Elegí una nueva contraseña." /><div className="panel max-w-md">{token.success && params.type==="recovery" ? <RecoveryForm tokenHash={token.data} configured={!!getSupabaseConfig()} /> : <><p className="notice">Abrí el enlace del correo de recuperación. Si venció, solicitá uno nuevo.</p><Link className="button mt-6" href="/acceso/recuperar">Solicitar enlace</Link></>}</div></div>;
}
