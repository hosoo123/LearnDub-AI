import { describe, expect, it } from "vitest";
import { DEFAULT_SERVER_URL, normalizeServerUrl } from "../extension/src/server-config";

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
});
