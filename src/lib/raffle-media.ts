import "server-only";
import { z } from "zod";
import { publicDatabase } from "@/lib/supabase/server";
const imageSchema=z.object({storage_path:z.string(),alt_text:z.string(),position:z.number()});
export async function publishedImages(raffleId:string) {
  const db=publicDatabase();if(!db) return [];
  const {data,error}=await db.from("raffle_images").select("storage_path,alt_text,position").eq("raffle_id",raffleId).order("position").limit(30);
  if(error) return [];
  const images=z.array(imageSchema).safeParse(data);if(!images.success) return [];
  const results=await Promise.all(images.data.map(async image=>{
    const {data:signed,error:signError}=await db.storage.from("raffle-images").createSignedUrl(image.storage_path,300);
    return !signError && signed ? {src:signed.signedUrl,alt:image.alt_text,label:`Vista ${image.position+1}`} : null;
  }));
  return results.filter((image):image is NonNullable<typeof image>=>image!==null);
}
const resultSchema=z.object({id:z.uuid(),raffle_id:z.uuid(),title:z.string(),slug:z.string(),winning_number:z.number().int(),drawn_at:z.string(),draw_mode:z.enum(["national_lottery","public_draw","notary","other"]).nullable(),evidence_path:z.string().nullable()});
export async function publishedResults() {
  const db=publicDatabase();if(!db) return {results:[],unavailable:false};
  const {data,error}=await db.from("public_results").select("id,raffle_id,title,slug,winning_number,drawn_at,draw_mode,evidence_path").order("drawn_at",{ascending:false}).limit(50);
  const parsed=z.array(resultSchema).safeParse(data);
  if(error || !parsed.success) return {results:[],unavailable:true};
  const results=await Promise.all(parsed.data.map(async result=>{
    const {data:signed,error:signError}=result.evidence_path?await db.storage.from("raffle-evidence").createSignedUrl(result.evidence_path,300):{data:null,error:null};
    return {id:result.id,raffle_id:result.raffle_id,title:result.title,slug:result.slug,winning_number:result.winning_number,drawn_at:result.drawn_at,draw_mode:result.draw_mode,evidenceUrl:!signError?signed?.signedUrl??null:null};
  }));
  return {results,unavailable:false};
}
