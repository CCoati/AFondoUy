import type { MetadataRoute } from "next";
import { listRaffles } from "@/lib/raffles";
import { publishedResults } from "@/lib/raffle-media";
import { getSiteUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (!configured || /localhost|127\.0\.0\.1/.test(configured)) return [];
  const base = getSiteUrl().replace(/\/$/, "");
  const [{ raffles }, { results }] = await Promise.all([listRaffles(), publishedResults()]);
  const publicRaffles = raffles.filter(raffle => !raffle.is_demo && raffle.status === "active");
  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/sorteos`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/resultados`, changeFrequency: "weekly", priority: 0.6 },
    ...publicRaffles.map(raffle => ({ url: `${base}/sorteos/${encodeURIComponent(raffle.slug)}`, changeFrequency: "daily" as const, priority: 0.9 })),
    ...results.map(result => ({ url: `${base}/sorteos/${encodeURIComponent(result.slug)}`, changeFrequency: "monthly" as const, priority: 0.5 })),
  ];
}
