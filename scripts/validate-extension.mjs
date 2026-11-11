import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export async function validateExtension() {
  const root = path.resolve("extension");
  const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
  if (manifest.manifest_version !== 3) throw new Error("Expected Manifest V3.");
  const files = new Set([
    manifest.action?.default_popup,
    manifest.background?.service_worker,
    ...(manifest.content_scripts ?? []).flatMap((entry) => entry.js ?? []),
    "dist/transcribe.html",
  ]);
  for (const relative of files) {
    if (typeof relative !== "string") throw new Error("Extension manifest is missing an entry point.");
    const absolute = path.resolve(root, relative);
    if (!absolute.startsWith(root + path.sep)) throw new Error("Extension asset must stay inside extension directory.");
    let info;
    try { info = await stat(absolute); } catch {
      throw new Error(`Missing extension asset: ${relative}. Run npm run build:extension first.`);
    }
    if (!info.isFile() || info.size === 0) throw new Error(`Empty extension asset: ${relative}`);
    if (relative.endsWith(".html")) {
      const html = await readFile(absolute, "utf8");
      for (const match of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)) {
        files.add(path.relative(root, path.resolve(path.dirname(absolute), match[1])));
      }
    }
  }
  return files.size;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log(`Validated ${await validateExtension()} extension assets.`);
}
