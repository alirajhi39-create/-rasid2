/**
 * =====================================================================
 *  طبقة الاتصال بقاعدة البيانات — متوافقة مع:
 *   1) PostgreSQL محلي (بيئة التطوير / المعاينة)
 *   2) Neon PostgreSQL Serverless (عند النشر على Vercel)
 *
 *  يتم الاختيار تلقائياً حسب رابط الاتصال المخزن في متغير البيئة
 *  DATABASE_URL الذي ينشئه Vercel تلقائياً عند إضافة Neon من Marketplace.
 * =====================================================================
 */

import { drizzle as drizzleNodePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzleNeonHttp } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { Pool } from "pg";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL ?? "";

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required — أضف متغير البيئة DATABASE_URL في Vercel / .env");
}

/** هل الرابط يشير إلى Neon (استضافة سحابية بدون خادم)؟ */
const isNeonServerless =
  /neon\.(tech|build|new|ws|house)/i.test(databaseUrl) ||
  (Boolean(process.env.DATABASE_URL) && process.env.Vercel === "1" && /pooler|neon/i.test(databaseUrl));

export const db: NodePgDatabase<typeof schema> = (() => {
  if (isNeonServerless) {
    // در Neon HTTP السحابي (الأسرع داخل دوال Vercel Serverless)
    const neonDb = drizzleNeonHttp(neon(databaseUrl), { schema });
    return neonDb as unknown as NodePgDatabase<typeof schema>;
  }

  // در node-postgres التقليدي (TCP) للاتصال المحلي أو أي PostgreSQL آخر
  const isRemote = !/(localhost|127\.0\.0\.1|\[::1\])/i.test(databaseUrl);
  const globalForDb = globalThis as typeof globalThis & {
    __gradesAppPool?: Pool;
  };

  const pool =
    globalForDb.__gradesAppPool ??
    new Pool({
      connectionString: databaseUrl,
      ssl: isRemote ? { rejectUnauthorized: false } : undefined,
      max: process.env.VERCEL ? 3 : 10,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 15_000,
    });

  if (process.env.NODE_ENV !== "production") {
    globalForDb.__gradesAppPool = pool;
  }

  return drizzleNodePg(pool, { schema });
})();

export { schema };
