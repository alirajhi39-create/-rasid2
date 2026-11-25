import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ensureDatabase } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  // أول زيارة تُنشئ جداول قاعدة البيانات تلقائياً (Vercel + Neon)
  await ensureDatabase().catch(() => undefined);
  const session = await getSession();
  redirect(session ? "/dashboard" : "/login");
}
