"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { failure } from "@/lib/reservations/http";
import { uyuToMinor } from "@/domain/money";
import { randomUUID } from "node:crypto";
export type AdminFormState = { message: string; success: boolean };
const uuid = z.uuid(), integer = z.coerce.number().int();
export async function updateInventory(_previous: AdminFormState, form: FormData): Promise<AdminFormState> {
  const { db } = await requireAdmin();
  try {
    let operation: string, values: Record<string, unknown>;
    switch(form.get("operation")) {
      case "role":
        if(form.get("confirmRoleChange")!=="on")return {message:"Confirmá el cambio de acceso antes de guardar.",success:false};
        operation="admin_set_role";values={p_user_id:uuid.parse(form.get("userId")),p_role:z.enum(["viewer","admin","owner"]).parse(form.get("role")),p_active:form.get("active")==="on"};break;
      case "create":
        operation="admin_create_raffle";
        values={p_title:z.string().trim().min(2).max(160).parse(form.get("title")),p_slug:z.string().max(160).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).parse(form.get("slug")),p_count:integer.min(1).max(10000).parse(form.get("count")),p_price:integer.min(1).max(100000000).parse(uyuToMinor(form.get("price"))),p_minutes:integer.min(1).max(60).parse(form.get("minutes"))}; break;
      case "configure":
        operation="admin_configure_inventory";
        values={p_raffle_id:uuid.parse(form.get("raffleId")),p_count:integer.min(1).max(10000).parse(form.get("count")),p_minutes:integer.min(1).max(60).parse(form.get("minutes"))};break;
      case "update_raffle": {
        operation="admin_update_raffle";
        if(form.get("status")==="cancelled"&&form.get("confirmCancel")!=="on")return {message:"Confirmá la cancelación del sorteo antes de guardar.",success:false};
        const draw=String(form.get("drawAt")??"").trim();
        values={p_id:uuid.parse(form.get("raffleId")),p_title:z.string().trim().min(2).max(160).parse(form.get("title")),p_slug:z.string().max(160).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).parse(form.get("slug")),p_description:z.string().max(5000).parse(form.get("description")??""),p_terms:z.string().max(10000).parse(form.get("terms")??""),p_draw_at:draw?z.iso.datetime({offset:true}).parse(new Date(draw).toISOString()):null,p_price:integer.min(1).max(100000000).parse(uyuToMinor(form.get("price"))),p_status:z.enum(["draft","active","paused","closed","cancelled"]).parse(form.get("status"))};break;
      }
      case "promotion": {
        operation="admin_save_promotion";
        const dates=z.object({start:z.iso.date(),end:z.iso.date()}).parse({start:form.get("start"),end:form.get("end")});
        values={p_id:form.get("id") ? uuid.parse(form.get("id")) : null,p_raffle_id:uuid.parse(form.get("raffleId")),p_name:z.string().trim().min(2).max(100).parse(form.get("name")),p_quantity:integer.min(2).max(20).parse(form.get("quantity")),p_total:integer.positive().max(2000000000).parse(uyuToMinor(form.get("total"))),p_starts:`${dates.start}T00:00:00-03:00`,p_ends:`${dates.end}T23:59:59-03:00`,p_enabled:form.get("enabled")==="on"};break;
      }
      case "toggle":
        operation="admin_toggle_promotion";values={p_id:uuid.parse(form.get("id")),p_enabled:z.enum(["true","false"]).parse(form.get("enabled"))==="true"};break;
      case "block":
        if(form.get("confirmBlock")!=="on")return {message:"Confirmá el bloqueo o liberación antes de aplicarlo.",success:false};
        operation="admin_set_blocked";values={p_raffle_id:uuid.parse(form.get("raffleId")),p_numbers:z.array(integer.min(1).max(10000)).min(1).max(200).refine(n=>new Set(n).size===n.length).parse(String(form.get("numbers")).split(/[\s,]+/).filter(Boolean)),p_blocked:z.enum(["block","unblock"]).parse(form.get("mode"))==="block",p_reason:z.string().trim().min(3).max(300).parse(form.get("reason"))};break;
      case "result": {
        operation="admin_record_result";
        if(form.get("confirmResult")!=="on")return {message:"Confirmá el registro inmutable del resultado.",success:false};
        const raffleId=uuid.parse(form.get("raffleId")),file=form.get("evidenceFile");
        if(!(file instanceof File)||file.size<1||file.size>5*1024*1024||!(["application/pdf","image/jpeg","image/png","image/webp"] as string[]).includes(file.type))return {message:"Adjuntá un acta PDF o imagen de hasta 5 MB.",success:false};
        values={p_raffle_id:raffleId,p_number:integer.min(1).max(10000).parse(form.get("number")),p_drawn_at:z.iso.datetime({offset:true}).parse(new Date(String(form.get("drawnAt"))).toISOString()),p_evidence:"",p_publish:form.get("publish")==="on",p_draw_mode:z.enum(["national_lottery","public_draw","notary","other"]).parse(form.get("drawMode"))};
        const extension=({"application/pdf":"pdf","image/jpeg":"jpg","image/png":"png","image/webp":"webp"} as Record<string,string>)[file.type],path=`${raffleId}/${randomUUID()}.${extension}`;
        const upload=await db.storage.from("raffle-evidence").upload(path,new Uint8Array(await file.arrayBuffer()),{contentType:file.type,upsert:false});if(upload.error)throw upload.error;
        values.p_evidence=path;
        const saved=await db.rpc(operation,values);if(saved.error){await db.storage.from("raffle-evidence").remove([path]);throw saved.error;}
        revalidatePath("/admin","layout");return {message:"Resultado y acta guardados en forma privada.",success:true};
      }
      case "setting":
        operation="admin_save_platform_setting";values={p_key:z.enum(["business_name","contact_whatsapp","contact_email","instagram_url","facebook_url"]).parse(form.get("key")),p_value:z.string().trim().max(500).parse(form.get("value"))};break;
      case "upload_image": {
        const raffleId=uuid.parse(form.get("raffleId")),file=form.get("image");
        if(!(file instanceof File)||file.size<1||file.size>850_000||!(["image/jpeg","image/png","image/webp"] as string[]).includes(file.type))throw new TypeError("Seleccioná una imagen JPG, PNG o WebP de hasta 850 KB.");
        const alt=z.string().trim().min(3).max(200).parse(form.get("alt")),position=integer.min(0).max(29).parse(form.get("position"));
        const extension=({"image/jpeg":"jpg","image/png":"png","image/webp":"webp"} as Record<string,string>)[file.type];
        const path=`${raffleId}/${randomUUID()}.${extension}`;
        const upload=await db.storage.from("raffle-images").upload(path,new Uint8Array(await file.arrayBuffer()),{contentType:file.type,upsert:false});
        if(upload.error)throw upload.error;
        const saved=await db.rpc("admin_save_image",{p_id:null,p_raffle_id:raffleId,p_path:path,p_alt:alt,p_position:position,p_published:false});
        if(saved.error){await db.storage.from("raffle-images").remove([path]);throw saved.error;}
        revalidatePath("/admin/sorteos");return {message:"Imagen cargada al almacenamiento protegido como borrador.",success:true};
      }
      default: throw new SyntaxError();
    }
    const { error } = await db.rpc(operation,values); if(error) throw error;
    revalidatePath("/admin","layout");return {message:"Cambios guardados.",success:true};
  } catch(error) { const body=await failure(error).json();return {message:body.message,success:false}; }
}
