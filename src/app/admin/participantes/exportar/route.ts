import { z } from "zod";
import { requireAdmin } from "@/lib/auth";

const participant=z.object({full_name:z.string(),email:z.string(),phone:z.string(),created_at:z.string()});
function csvCell(value:string){const safe=/^[=+\-@\t\r]/.test(value)?`'${value}`:value;return `"${safe.replace(/"/g,'""')}"`}
export async function GET(request:Request){
 const {db,profile}=await requireAdmin();
 if(profile.role!=="owner")return Response.json({error:"Solo el propietario puede exportar datos personales."},{status:403,headers:{"Cache-Control":"no-store"}});
 const url=new URL(request.url),raw=url.searchParams.get("q")?.trim().slice(0,100)??"";
 let query=db.from("participants").select("full_name,email,phone,created_at").order("created_at",{ascending:false}).limit(5000);
 if(raw){const safe=raw.replace(/[%,_().*]/g," ");query=query.or(`full_name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%`)}
 const {data,error}=await query;const rows=z.array(participant).safeParse(data);
 if(error||!rows.success)return Response.json({error:"No pudimos preparar la exportación."},{status:503,headers:{"Cache-Control":"no-store"}});
 const lines=[["Nombre","Email","WhatsApp","Alta"].map(csvCell).join(","),...rows.data.map(p=>[p.full_name,p.email,p.phone,new Date(p.created_at).toISOString()].map(csvCell).join(","))];
 return new Response(`\uFEFF${lines.join("\r\n")}`,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":"attachment; filename=afondo-participantes.csv","Cache-Control":"private, no-store, max-age=0","X-Content-Type-Options":"nosniff"}});
}
