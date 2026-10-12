// Auth is server-only. Realtime uses a separate anonymous browser client.
export const authCookieOptions = {
  httpOnly: true, sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production", path: "/",
};
