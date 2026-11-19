import { describe, expect, it, vi } from "vitest";
import { findLearnDubServer, parseOllamaModels } from "../companion/src/health";

describe("desktop companion health", () => {
  it("finds LearnDub while ignoring an unrelated service", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => String(url).includes(":3001/")
      ? new Response(JSON.stringify({ service: "learndub-ai" }), { headers: { "Content-Type": "application/json" } })
      : new Response("<!doctype html>", { headers: { "Content-Type": "text/html" } }));
    await expect(findLearnDubServer(fetcher as typeof fetch)).resolves.toBe("http://localhost:3001");
  });
  it("parses installed Ollama model names", () => {
    expect(parseOllamaModels("NAME ID SIZE MODIFIED\ngemma4:e4b abc 6 GB today\nqwen2.5-coder:7b def 4 GB today\n"))
      .toEqual(["gemma4:e4b", "qwen2.5-coder:7b"]);
  });
});
