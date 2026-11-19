import { execFile } from "node:child_process";
import { createServer } from "node:net";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
export const SERVER_PORTS = [3000, 3001, 3002, 3003, 3004, 3005] as const;
export const REQUIRED_MODEL = "gemma4:e4b";

export type CompanionHealth = { serverUrl?: string; ollamaReady: boolean; modelReady: boolean; detail: string };

export async function findLearnDubServer(fetcher: typeof fetch = fetch) {
  for (const port of SERVER_PORTS) {
    try {
      const response = await fetcher(`http://localhost:${port}/api/health`, { cache: "no-store", signal: AbortSignal.timeout(800) });
      if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) continue;
      const body = await response.json();
      if (body?.service === "learndub-ai") return `http://localhost:${port}`;
    } catch { /* Try the next port. */ }
  }
  return undefined;
}

export async function findAvailablePort() {
  for (const port of SERVER_PORTS) {
    const available = await new Promise<boolean>((resolve) => {
      const probe = createServer().once("error", () => resolve(false)).once("listening", () => probe.close(() => resolve(true)));
      probe.listen(port, "127.0.0.1");
    });
    if (available) return port;
  }
  throw new Error("LearnDub ашиглах сул port (3000–3005) олдсонгүй.");
}

export function parseOllamaModels(output: string) {
  return output.split(/\r?\n/).slice(1).map((line) => line.trim().split(/\s+/)[0]).filter(Boolean);
}

export async function inspectCompanionHealth(run = execFileAsync): Promise<CompanionHealth> {
  const serverUrl = await findLearnDubServer();
  try {
    const { stdout } = await run("ollama", ["list"], { timeout: 5_000, windowsHide: true });
    const modelReady = parseOllamaModels(stdout).includes(REQUIRED_MODEL);
    return { serverUrl, ollamaReady: true, modelReady, detail: serverUrl && modelReady ? "LearnDub ашиглахад бэлэн."
      : !serverUrl ? "LearnDub сервер асаж байна…" : `Ollama ${REQUIRED_MODEL} model шаардлагатай.` };
  } catch { return { serverUrl, ollamaReady: false, modelReady: false, detail: "Ollama ажиллахгүй байна." }; }
}
