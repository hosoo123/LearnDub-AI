import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SERVER_URL, normalizeServerUrl, resolveServerUrl } from "../extension/src/server-config";

afterEach(() => vi.unstubAllGlobals());

describe("extension local server configuration", () => {
  it("normalizes supported loopback addresses and ports", () => {
    expect(normalizeServerUrl(" http://localhost:4173/path ")).toBe("http://localhost:4173");
    expect(normalizeServerUrl("http://127.0.0.1:3000")).toBe("http://127.0.0.1:3000");
    expect(normalizeServerUrl(undefined)).toBe(DEFAULT_SERVER_URL);
  });

  it("rejects remote or credentialed server addresses", () => {
    expect(() => normalizeServerUrl("https://example.com")).toThrow();
    expect(() => normalizeServerUrl("http://user:pass@localhost:3000")).toThrow();
  });

  it("skips an unrelated HTML service and discovers LearnDub on the next port", async () => {
    const set = vi.fn();
    vi.stubGlobal("chrome", { storage: { local: { get: vi.fn().mockResolvedValue({ serverUrl: "http://localhost:3000" }), set } } });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes(":3001/")
      ? new Response(JSON.stringify({ service: "learndub-ai" }), { status: 200, headers: { "Content-Type": "application/json" } })
      : new Response("<!doctype html>", { status: 200, headers: { "Content-Type": "text/html" } })));
    await expect(resolveServerUrl()).resolves.toBe("http://localhost:3001");
    expect(set).toHaveBeenCalledWith({ serverUrl: "http://localhost:3001" });
  });
});
