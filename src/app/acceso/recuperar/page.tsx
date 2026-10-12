import { PageHeading } from "@/components/page-heading";
import { RecoveryForm } from "@/components/recovery-form";
import { getSupabaseConfig } from "@/lib/env";
export const metadata={title:"Recuperar acceso",robots:{index:false,follow:false}};
export default function RecoveryPage() {
  return <div className="wrap page-body"><PageHeading eyebrow="ACCESO ADMINISTRATIVO" title="Recuperá tu acceso."><p>Te enviaremos un enlace para elegir una nueva contraseña.</p></PageHeading><div className="panel max-w-md"><RecoveryForm configured={!!getSupabaseConfig()} /></div></div>;
}
