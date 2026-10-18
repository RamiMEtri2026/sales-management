/**
 * Single switch between the local prototype store and the real backend API.
 *
 * - When VITE_API_URL is set, `mode` is "api" and pages should call the API
 *   client in `@/lib/api`.
 * - Otherwise `mode` is "local" and the existing `@/lib/store` (localStorage)
 *   continues to back the UI, so the preview keeps working unchanged.
 *
 * This file deliberately does NOT import the store or the api client at
 * module top-level, so switching modes never breaks the build.
 */

export type DataSourceMode = "api" | "local";

export function dataSourceMode(): DataSourceMode {
  const url = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_URL;
  return url && url.trim() ? "api" : "local";
}

export function isApiMode(): boolean {
  return dataSourceMode() === "api";
}

export function dataSourceLabel(): string {
  return isApiMode()
    ? "متصل بالخادم (SQLite)"
    : "تخزين محلي في المتصفح (نموذج أولي)";
}