import { z } from "zod";
import { getReceipt } from "@/lib/reservations/server";
import { ReservationStatus } from "@/components/numbers/reservation-status";
export const metadata = { title: "Tu reserva", robots: { index: false, follow: false } };
export default async function CheckoutPage({ params }: { params: Promise<{id:string}> }) {
  const id=z.uuid().safeParse((await params).id);
  const receipt=id.success ? await getReceipt(id.data).catch(()=>null) : null;
  return <div className="wrap page-body">{receipt ? <ReservationStatus initial={receipt} /> : <div className="panel"><h1>No pudimos recuperar tu reserva</h1><p className="notice">Abrí este enlace desde el navegador donde reservaste. Si perdiste la conexión, volvé a intentar; no crees otra reserva hasta confirmar el estado.</p><a className="button secondary" href="">Volver a intentar</a></div>}</div>;
}
