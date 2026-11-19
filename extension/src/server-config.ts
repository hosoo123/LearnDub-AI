export const DEFAULT_SERVER_URL = "http://localhost:3000";

export function normalizeServerUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return DEFAULT_SERVER_URL;
  const url = new URL(value.trim());
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    || url.username || url.password || url.search || url.hash) throw new Error("Зөвхөн local HTTP серверийн хаяг ашиглана.");
  return url.origin;
}

export async function getServerUrl() {
  const stored = await chrome.storage.local.get("serverUrl");
  return normalizeServerUrl(stored.serverUrl);
}

export async function resolveServerUrl() {
  const configured = await getServerUrl();
  const candidates = [configured, ...Array.from({ length: 6 }, (_, index) => `http://localhost:${3000 + index}`)];
  for (const candidate of [...new Set(candidates)]) {
    try {
      const response = await fetch(`${candidate}/api/health`, { signal: AbortSignal.timeout(1_500), cache: "no-store" });
      if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) continue;
      const body = await response.json();
      if (body?.service === "learndub-ai") {
        if (candidate !== configured) await chrome.storage.local.set({ serverUrl: candidate });
        return candidate;
      }
    } catch { /* Try the next local port. */ }
  }
  throw new Error("LearnDub сервер олдсонгүй. npm run dev ажиллуулаад дахин оролдоно уу.");
}
