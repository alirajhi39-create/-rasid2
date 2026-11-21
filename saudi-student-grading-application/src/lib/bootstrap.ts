import { initDatabase } from "@/db/init";

let initialized: Promise<unknown> | null = null;

/**
 * تشغيل التهيئة مرة واحدة لكل عملية (Process) — يضمن وجود الجداول
 * قبل أي استعلام، ويعمل على Vercel و Neon بدون أوامر SQL يدوية.
 */
export function ensureDatabase(): Promise<unknown> {
  if (!initialized) {
    initialized = initDatabase().catch((error) => {
      initialized = null;
      throw error;
    });
  }
  return initialized;
}
