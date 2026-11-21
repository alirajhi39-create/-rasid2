"use client";

export async function apiFetch<T>(
  url: string,
  options: RequestInit = {},
): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers ?? {}),
      },
    });
    const text = await res.text();
    const data = text ? (JSON.parse(text) as T & { error?: string }) : ({} as T);
    if (!res.ok) {
      return { ok: false, error: (data as { error?: string })?.error ?? `خطأ ${res.status}` };
    }
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "تعذر الاتصال بالخادم",
    };
  }
}

export async function fetchInitDb() {
  return apiFetch<{ tables?: string[]; userCount?: number; needsFirstAccount?: boolean }>(
    "/api/init-db",
    { method: "POST" },
  );
}
