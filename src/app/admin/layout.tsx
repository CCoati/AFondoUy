import { requireAdmin } from "@/lib/auth";
import { AdminNavigation } from "@/components/admin-navigation";
import type { Metadata } from "next";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false, noarchive: true } };
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <div className="admin-shell"><AdminNavigation /><main id="admin-main" className="admin-main">{children}</main></div>;
}
