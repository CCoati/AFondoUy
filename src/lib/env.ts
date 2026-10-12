import "server-only";
import { z } from "zod";

const supabaseConfig = z.object({ url: z.url(), key: z.string().min(1) });
export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url && !key) return null;
  const result = supabaseConfig.safeParse({ url, key });
  if (!result.success) throw new Error("Configuración de Supabase incompleta o inválida.");
  return result.data;
}

export function getSiteUrl() {
  return z.url().parse(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000");
}
