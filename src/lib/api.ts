/**
 * Centralized typed API client for the Sales Management System backend.
 *
 * - Base URL comes from VITE_API_URL (e.g. http://localhost:4000/api).
 * - Session token is kept in memory + localStorage under "sms.token".
 * - All errors are normalized to Arabic messages.
 * - Requests have a timeout and surface network errors distinctly.
 *
 * This module is intentionally dependency-free (uses native fetch) so it
 * works in the browser preview and in a real deployment without changes.
 */

export interface ApiErrorShape {
  code: string;
  message: string;
  details?: unknown;
}

export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const TOKEN_KEY = "sms.token";
const DEFAULT_TIMEOUT_MS = 15000;

export function apiBaseUrl(): string | null {
  const url = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_URL;
  return url && url.trim() ? url.replace(/\/+$/, "") : null;
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable — session stays in memory only */
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  timeoutMs?: number;
  signal?: AbortSignal;
}

function buildUrl(base: string, path: string, query?: RequestOptions["query"]): string {
  const url = new URL(base + path);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const base = apiBaseUrl();
  if (!base) {
    throw new ApiError(0, "NO_BACKEND", "لم يتم تكوين عنوان الخادم (VITE_API_URL). التطبيق يعمل حاليًا بالتخزين المحلي.");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  if (options.signal) {
    options.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(base, path, options.query), {
      method: options.method ?? "GET",
      headers,
      body,
      signal: controller.signal,
      credentials: "omit",
    });
  } catch (err) {
    clearTimeout(timeout);
    if ((err as { name?: string }).name === "AbortError") {
      throw new ApiError(0, "TIMEOUT", "انتهت مهلة الاتصال بالخادم. تحقق من الشبكة وحاول مرة أخرى.");
    }
    throw new ApiError(0, "NETWORK", "تعذّر الاتصال بالخادم. تحقق من تشغيل الخادم وعنوان الاتصال.");
  }
  clearTimeout(timeout);

  const text = await res.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }

  if (!res.ok) {
    const p = (payload ?? {}) as Partial<ApiErrorShape> & { error?: string };
    const code = p.code ?? `HTTP_${res.status}`;
    const message = p.message ?? p.error ?? "حدث خطأ غير متوقع في الخادم.";
    throw new ApiError(res.status, code, message, p.details);
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, query?: RequestOptions["query"]) => apiRequest<T>(path, { method: "GET", query }),
  post: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: "POST", body }),
  put: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: "PUT", body }),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: "PATCH", body }),
  del: <T>(path: string) => apiRequest<T>(path, { method: "DELETE" }),
};