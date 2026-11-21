import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "./session";

const DEFAULT_SECRET = "grades-app-dev-secret-change-me-in-production-32chars";

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET || process.env.JWT_SECRET || DEFAULT_SECRET;
  return new TextEncoder().encode(secret.padEnd(32, "0"));
}

export type SessionPayload = {
  uid: number;
  username: string;
  fullName: string;
  role: string;
};

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("grades-app")
    .setExpirationTime("30d")
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { issuer: "grades-app" });
    if (typeof payload.uid !== "number" || typeof payload.username !== "string") return null;
    return {
      uid: payload.uid,
      username: payload.username,
      fullName: typeof payload.fullName === "string" ? payload.fullName : "معلم المادة",
      role: typeof payload.role === "string" ? payload.role : "teacher",
    };
  } catch {
    return null;
  }
}

/** قراءة الجلسة الحالية من الكوكيز (Server Components / Route Handlers) */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/** حارس للمسارات المحمية — يعيد استجابة 401 أو الجلسة */
export async function requireSession(): Promise<
  { ok: true; session: SessionPayload } | { ok: false; response: Response }
> {
  const session = await getSession();
  if (!session) {
    return {
      ok: false,
      response: Response.json(
        { ok: false, error: "غير مصرح — يرجى تسجيل الدخول من جديد" },
        { status: 401 },
      ),
    };
  }
  return { ok: true, session };
}

/** حارس صلاحيات المدير — لإدارة حسابات المعلمين */
export async function requireAdmin(): Promise<
  { ok: true; session: SessionPayload } | { ok: false; response: Response }
> {
  const session = await getSession();
  if (!session) {
    return {
      ok: false,
      response: Response.json({ ok: false, error: "غير مصرح — يرجى تسجيل الدخول" }, { status: 401 }),
    };
  }
  if (session.role !== "admin") {
    return {
      ok: false,
      response: Response.json(
        { ok: false, error: "هذه الصلاحية متاحة لمدير النظام فقط" },
        { status: 403 },
      ),
    };
  }
  return { ok: true, session };
}


