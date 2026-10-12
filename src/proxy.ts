import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/lib/env";
import { authCookieOptions } from "@/lib/supabase/cookie-options";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const config = getSupabaseConfig();
  if (!config && request.nextUrl.pathname.startsWith("/admin")) {
    const login = NextResponse.redirect(new URL("/acceso?estado=configuracion",request.url));
    login.headers.set("Cache-Control","private, no-store");
    return login;
  }
  if (config) {
    const db = createServerClient(config.url, config.key, { cookieOptions: authCookieOptions, cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    } });
    await db.auth.getUser();
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = { matcher: ["/admin/:path*", "/acceso/:path*"] };
