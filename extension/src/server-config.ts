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
