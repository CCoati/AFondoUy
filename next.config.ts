import type { NextConfig } from "next";

function contentSecurityPolicy() {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let supabaseHttp = "";
  let supabaseRealtime = "";
  try {
    const url = new URL(supabase ?? "");
    if (url.protocol === "https:" || (process.env.NODE_ENV !== "production" && url.protocol === "http:")) {
      supabaseHttp = url.origin;
      supabaseRealtime = `${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}`;
    }
  } catch {
    // Supabase is optional for the demonstration mode.
  }

  const developmentConnections = process.env.NODE_ENV === "development"
    ? " http://127.0.0.1:54321 ws://127.0.0.1:54321 ws://localhost:3000 ws://127.0.0.1:3000"
    : "";
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${supabaseHttp ? ` ${supabaseHttp}` : ""}`,
    "font-src 'self' data:",
    `connect-src 'self'${supabaseHttp ? ` ${supabaseHttp}` : ""}${supabaseRealtime ? ` ${supabaseRealtime}` : ""}${developmentConnections}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(process.env.NODE_ENV === "production" ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

const config: NextConfig = {
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Content-Security-Policy", value: contentSecurityPolicy() },
    ] }, { source: "/acceso/restablecer", headers: [
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Cache-Control", value: "private, no-store" },
    ] }];
  },
};
export default config;
