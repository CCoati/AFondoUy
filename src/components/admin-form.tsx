"use client";
import { useActionState, type ReactNode } from "react";
import { updateInventory } from "@/app/admin/actions";
export function AdminForm({children,submit="Guardar cambios"}:{children:ReactNode;submit?:string}) {
  const [state,action,pending]=useActionState(updateInventory,{message:"",success:false});
  return <form action={action} className="admin-form"><fieldset disabled={pending}>{children}<button className="button secondary" type="submit">{pending?"Guardando…":submit}</button></fieldset>{state.message && <p role="status" className={state.success?"success-message":"notice"}>{state.message}</p>}</form>;
}
