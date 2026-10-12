import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  const site = configured && !/localhost|127\.0\.0\.1/.test(configured) ? configured.replace(/\/$/, "") : null;
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/admin/", "/acceso", "/api/", "/carrito", "/checkout/", "/participacion/"] }], ...(site ? { sitemap: `${site}/sitemap.xml` } : {}) };
}
